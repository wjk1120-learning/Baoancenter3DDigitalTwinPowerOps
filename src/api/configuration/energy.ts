/**
 * 配置中心·能耗统计接口（§5.24-5.32，照搬福永配置中心参考包；
 * 楼层路径段 encodeURIComponent，删除为「先清空(§5.31 空组)后删(§5.32)」两步协议）。
 */
import { configGet, configPost, deleteConfig } from './configuration'

export type Coefficient = 1 | -1
export interface StatsDevice {
  deviceId: number
  coefficient: Coefficient
}

export interface BuildingStatsDevice extends StatsDevice {
  buildingId: number
  buildingName: string
  channelId: number
}

export interface FloorGroupKey {
  buildingId: number
  floor: string
}

export interface FloorStatsGroup extends FloorGroupKey {
  buildingName: string
  devices: StatsDevice[]
}

const buildingStats = '/building-stats'
const floorStats = '/building-floor-stats'

export const getBuildingStats = (buildingId?: number) =>
  configGet<BuildingStatsDevice[]>(buildingStats, { buildingId })

export const addBuildingStats = (device: StatsDevice, buildingId: number) =>
  buildingId === 0
    ? configPost<BuildingStatsDevice>(`${buildingStats}/sentinel-devices`, device)
    : configPost<BuildingStatsDevice>(`${buildingStats}/devices`, { ...device, buildingId })

/** §5.26 修改统计方式（契约 2026-11-24 变更：body buildingId 必填，缺省后端 code=0「楼栋ID不能为空」） */
export const updateBuildingStats = (device: StatsDevice, buildingId: number) =>
  configPost<BuildingStatsDevice>(`${buildingStats}/devices/${device.deviceId}/update`, {
    buildingId,
    coefficient: device.coefficient,
  })

/** §5.27 删除映射（契约 2026-11-24 变更：body buildingId 必填） */
export const deleteBuildingStats = (deviceId: number, buildingId: number) =>
  deleteConfig(`${buildingStats}/devices/${deviceId}/delete`, { buildingId })

export const getFloorStats = (buildingId?: number) =>
  configGet<FloorStatsGroup[]>(floorStats, { buildingId })

const floorPath = (group: FloorGroupKey) =>
  `${floorStats}/${group.buildingId}/${encodeURIComponent(group.floor)}`

export const addFloorStats = (group: FloorGroupKey, devices: StatsDevice[]) =>
  configPost<FloorStatsGroup>(floorStats, { ...group, devices })

export const updateFloorStats = (group: FloorGroupKey, devices: StatsDevice[]) =>
  configPost<FloorStatsGroup>(`${floorPath(group)}/update`, { devices })

export const deleteFloorStats = (group: FloorGroupKey) =>
  deleteConfig(`${floorPath(group)}/delete`)
