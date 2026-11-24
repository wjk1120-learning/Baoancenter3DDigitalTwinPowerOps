import type { CameraVo, PlayUrlVo } from '../../api/ezviz/types'
import { mockFail } from '../mockFail'

/**
 * 萤石摄像头台账假数据：6 台，覆盖 online 三态（4 在线 / 1 离线 / 1 查询失败未知）。
 * mock 取流返回假 ezopen 地址与假 accessToken，真 EZUIKit 播不了会按「无画面隐藏」口径
 * 消失——mock 模式下视频墙空态属预期，真画面与播放链路一律以真后端联调验证（用户拍板
 * 本页面直接连真后端开发）。台账数据调整直接改本数组。
 * §6.2-6.4 增删改已随配置中心监控配置板块接回（2026-11-24）：序列号全局唯一（重复
 * code=0），修改为全量提交目标状态、位置描述空串按 null，新增摄像头 online=null（未知）。
 */
export const cameraRows: CameraVo[] = [
  { id: 1, deviceSerial: 'C24805932', cameraName: '1#变配电房全景', locationDesc: '宝安中心医院1#变配电房', online: true },
  { id: 2, deviceSerial: 'C73210485', cameraName: '1#变配电房柜面', locationDesc: '宝安中心医院1#变配电房', online: true },
  { id: 3, deviceSerial: 'D88412067', cameraName: '2#变配电房全景', locationDesc: '宝安中心医院2#变配电房', online: true },
  { id: 4, deviceSerial: 'C90531728', cameraName: '值班室', locationDesc: '宝安中心医院配电房值班室', online: true },
  { id: 5, deviceSerial: 'D11826439', cameraName: '3#变配电房全景', locationDesc: '宝安中心医院3#变配电房', online: false },
  { id: 6, deviceSerial: 'C66491053', cameraName: '4#变配电房全景', locationDesc: '宝安中心医院4#变配电房', online: null },
]

function findRow(cameraId: number): CameraVo | undefined {
  return cameraRows.find((c) => c.id === cameraId)
}

/** §6.5 直播取流：假 ezopen 地址（格式对齐 EZUIKit 要求的 ezopen://open.ys7.com/序列号/通道.live，
 *  不带 query——实测带 ?hd=0 会被判「协议格式有误」；流畅度由真接口 quality 下发，假数据无需携带。
 *  假 token 播不出画面属预期） */
export function getMockLiveUrl(cameraId: number): PlayUrlVo | null {
  const hit = findRow(cameraId)
  if (!hit) return null
  return {
    url: `ezopen://open.ys7.com/${hit.deviceSerial}/1.live`,
    accessToken: `mock-accessToken-${hit.deviceSerial}`,
  }
}

/** §6.6 回放取流：同直播假地址（回放协议也是 ezopen） */
export function getMockPlaybackUrl(cameraId: number): PlayUrlVo | null {
  return getMockLiveUrl(cameraId)
}

/** §6.7 抓拍：内联 SVG 假图（真接口返回有时效的萤石托管 URL，仅当场看） */
const CAPTURE_MOCK_SVG =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
      '<rect width="100%" height="100%" fill="#0b1c2e"/>' +
      '<text x="50%" y="50%" fill="#5aa7e8" font-size="28" text-anchor="middle" font-family="sans-serif">抓拍 MOCK 图</text>' +
      '</svg>',
  )

export function getMockCaptureUrl(cameraId: number): string | null {
  return findRow(cameraId) ? CAPTURE_MOCK_SVG : null
}

/* ================= §6.2-6.4 台账增删改（配置中心监控配置板块；失败走 mockFail code=0） ================= */

function readBody(body: Record<string, unknown>) {
  return {
    deviceSerial: typeof body.deviceSerial === 'string' ? body.deviceSerial.trim() : '',
    cameraName: typeof body.cameraName === 'string' ? body.cameraName.trim() : '',
    locationDesc: typeof body.locationDesc === 'string' && body.locationDesc.trim() ? body.locationDesc.trim() : null,
  }
}

/** §6.2 新增（序列号全局唯一，重复 code=0；新摄像头 online=null 未知，待真后端查询） */
export function addCameraRow(body: Record<string, unknown>): CameraVo | ReturnType<typeof mockFail> {
  const { deviceSerial, cameraName, locationDesc } = readBody(body)
  if (!deviceSerial || !cameraName) return mockFail('请填写设备序列号与摄像头名称')
  if (cameraRows.some((c) => c.deviceSerial === deviceSerial)) {
    return mockFail(`设备序列号已存在：${deviceSerial}`)
  }
  const row: CameraVo = {
    id: cameraRows.reduce((max, c) => Math.max(max, c.id), 0) + 1,
    deviceSerial,
    cameraName,
    locationDesc,
    online: null,
  }
  cameraRows.push(row)
  return { ...row }
}

/** §6.3 修改（全量目标状态；序列号唯一性排除自身） */
export function updateCameraRow(id: number, body: Record<string, unknown>): CameraVo | ReturnType<typeof mockFail> {
  const hit = findRow(id)
  if (!hit) return mockFail(`摄像头不存在${id}`)
  const { deviceSerial, cameraName, locationDesc } = readBody(body)
  if (!deviceSerial || !cameraName) return mockFail('请填写设备序列号与摄像头名称')
  if (cameraRows.some((c) => c.id !== id && c.deviceSerial === deviceSerial)) {
    return mockFail(`设备序列号已存在：${deviceSerial}`)
  }
  hit.deviceSerial = deviceSerial
  hit.cameraName = cameraName
  hit.locationDesc = locationDesc
  return { ...hit }
}

/** §6.4 删除 */
export function deleteCameraRow(id: number): boolean | ReturnType<typeof mockFail> {
  const hit = findRow(id)
  if (!hit) return mockFail(`摄像头不存在${id}`)
  cameraRows.splice(cameraRows.indexOf(hit), 1)
  return true
}
