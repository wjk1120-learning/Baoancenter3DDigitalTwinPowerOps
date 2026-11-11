import type { CameraSaveBody, CameraVo, PlayUrlVo } from '../../api/ezviz/types'

/**
 * 萤石摄像头台账假数据：6 台，覆盖 online 三态（4 在线 / 1 离线 / 1 查询失败未知）。
 * mock 取流返回假 ezopen 地址与假 accessToken，真 EZUIKit 播不了会按「无画面隐藏」口径
 * 消失——mock 模式下视频墙空态属预期，真画面与播放链路一律以真后端联调验证（用户拍板
 * 本页面直接连真后端开发）。台账增删改直接改本数组，列表/视频墙刷新即联动。
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

/** §6.2 新增台账：id 自增，新登记设备默认按在线（真在线状态以萤石实时查询为准） */
export function addMockCamera(body: Partial<CameraSaveBody>): CameraVo {
  const row: CameraVo = {
    id: cameraRows.reduce((max, c) => Math.max(max, c.id), 0) + 1,
    deviceSerial: String(body.deviceSerial ?? '').trim(),
    cameraName: String(body.cameraName ?? '').trim(),
    locationDesc: body.locationDesc?.trim() ? body.locationDesc.trim() : null,
    online: true,
  }
  cameraRows.push(row)
  return row
}

/** §6.3 修改台账：全量覆盖业务字段；台账不存在返回 null */
export function updateMockCamera(cameraId: number, body: Partial<CameraSaveBody>): CameraVo | null {
  const hit = findRow(cameraId)
  if (!hit) return null
  hit.deviceSerial = String(body.deviceSerial ?? '').trim()
  hit.cameraName = String(body.cameraName ?? '').trim()
  hit.locationDesc = body.locationDesc?.trim() ? body.locationDesc.trim() : null
  return hit
}

/** §6.4 删除台账：从数组移除；不存在返回 false */
export function deleteMockCamera(cameraId: number): boolean {
  const idx = cameraRows.findIndex((c) => c.id === cameraId)
  if (idx === -1) return false
  cameraRows.splice(idx, 1)
  return true
}
