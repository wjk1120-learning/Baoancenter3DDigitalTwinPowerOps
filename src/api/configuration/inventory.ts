/**
 * 配置中心·通道/设备/箱柜接口（§5.9-5.19，照搬福永配置中心参考包；
 * 适配点：经 ./configuration 的 bzGet/bzPost 封装，无直接改动）。
 */
import { configGet, configPost } from './configuration'

export interface ChannelConfig {
  channelId: number
  channelName: string
}

interface ChannelChangeResult extends ChannelConfig {
  refreshSubmitted?: boolean
  warnings?: string[]
}

export interface ChannelDeleteResult extends ChannelConfig {
  executed: boolean
  devices: { deviceId: number; deviceName: string }[]
  buildingDeviceRefs: number
  floorDeviceRefs: number
  alertLocationRefs: number
  warnings: string[]
}

export type DeviceFilter = '' | 'unbound' | 'no-location'

export interface DeviceConfig {
  channelId: number
  deviceId: number
  deviceName: string
  enabled: number
  superName: string | null
  locationNumbers: string[]
  warnings?: string[]
}

export interface CabinetBrief {
  id: number
  superName: string
}

export interface CabinetConfig extends CabinetBrief {
  buildingId: number | null
  buildingName: string | null
  /** §5.15 契约标 String 唯一；后端实际存在无编号柜（BUG-011），读侧允许 null 显示「—」 */
  deviceNumber: string | null
  deviceTypeId: number | null
  deviceTypeName: string | null
  commissionDate: string | null
  switchingId: number | null
  switchingName: string | null
  status: number
  health: number | null
  warnings?: string[]
}

export const getChannels = () => configGet<ChannelConfig[]>('/channels')
export const getDevices = (filter: DeviceFilter = '') =>
  configGet<DeviceConfig[]>('/devices', filter ? { filter } : undefined)
export const getCabinets = () => configGet<CabinetConfig[]>('/cabinets')
export const searchCabinets = (keyword: string) =>
  configGet<CabinetBrief[]>('/cabinets/fuzzy-search', { keyword })

export function changeChannel(id: number | undefined, body: ChannelConfig) {
  return id == null
    ? configPost<ChannelChangeResult>('/channels', body)
    : configPost<ChannelChangeResult>(`/channels/${id}/rename`, { channelName: body.channelName })
}

export async function deleteChannel(id: number, confirm: boolean) {
  const result = await configPost<ChannelDeleteResult>(`/channels/${id}/delete`, { confirm })
  if (result?.channelId !== id || result.executed !== confirm) {
    throw new Error('通道删除接口返回了意外的操作状态，请刷新核对')
  }
  return result
}

export async function changeDevice(
  id: number,
  body: { superId?: number; locationNumbers?: string[]; enabled?: number },
) {
  // §5.14 修改设备：superId/locationNumbers/enabled 全部可选（缺省=不修改）；
  // enabled 是设备启停人工维护唯一入口（0=停用/1=启用），与绑定同一事务生效。
  const result = await configPost<DeviceConfig>(`/devices/${id}`, body)
  // BUG-016：写回显 locationNumbers 可能为 null（§5.14 契约标数组，待后端修正），
  // 归一化成 [] 供界面回填；列表接口（§5.13）不受影响。
  return { ...result, locationNumbers: result.locationNumbers ?? [] }
}

export type CabinetAdd = Omit<CabinetConfig, 'status' | 'health' | 'switchingId' | 'switchingName' | 'warnings'>

export interface CabinetFields {
  buildingId: number
  superName: string
  deviceNumber: string
  deviceTypeId: number
  commissionDate: string
  switchingId: number
}

export function changeCabinet(id: number | undefined, body: Partial<CabinetFields>) {
  return configPost<CabinetAdd & Partial<CabinetConfig>>(id == null ? '/cabinets' : `/cabinets/${id}/update`, body)
}
