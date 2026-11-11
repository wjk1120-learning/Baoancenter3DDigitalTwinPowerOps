/**
 * 萤石视频接口（§6 萤石视频监控模块，契约唯一依据 = docs/FY-Hospital-API.md §6）。
 * 范围：§6.1 台账列表 / §6.2-6.4 台账增删改（仅 level 0/1，外部 403 由拦截器统一 toast）/
 * §6.5 直播取流 / §6.6 回放取流 / §6.7 抓拍。
 * 通道号不入库，取流统一通道 1（服务端固定）；accessToken 服务端管理、随取流下发。
 * 播放协议固定 ezopen（protocol=1，EZUIKit 播放器唯一支持）；直播清晰度固定流畅
 * （quality=2，多路同屏省带宽）。台账列表/取流/抓拍走 silent（页面按「无画面隐藏」
 * 口径自行消隐，轮询失败不弹全局错误）；增删改不 silent（依赖拦截器统一错误 toast）。
 */
import { bzGet, bzPost, DATA_FETCH_TIMEOUT_MS } from '../../utils/http'
import type { RequestConfig } from '../../utils/http'
import type { CameraSaveBody, CameraVo, PlayUrlVo, PlaybackSource } from './types'

function conf(): RequestConfig {
  return { timeout: DATA_FETCH_TIMEOUT_MS, silent: true }
}

/** §6.1 摄像头台账列表 GET /ezviz/cameras（online 三态，页面自行过滤离线/未知） */
export async function fetchCameraList(): Promise<CameraVo[]> {
  const data = await bzGet<CameraVo[]>('/ezviz/cameras', undefined, conf())
  return Array.isArray(data) ? data.filter((c) => c && c.id) : []
}

/** §6.5 直播取流 GET /ezviz/cameras/{id}/live-url（protocol=1 ezopen，quality=2 流畅） */
export function fetchCameraLiveUrl(cameraId: number): Promise<PlayUrlVo> {
  return bzGet<PlayUrlVo>(
    `/ezviz/cameras/${cameraId}/live-url`,
    { protocol: 1, quality: 2 },
    conf(),
  )
}

/** §6.6 回放取流 GET /ezviz/cameras/{id}/playback-url（source=local/cloud，protocol=1 ezopen；
 *  时间格式 yyyy-MM-dd HH:mm:ss，云存储回放起止必须同一天——平台规则，选择器侧约束） */
export function fetchCameraPlaybackUrl(
  cameraId: number,
  source: PlaybackSource,
  startTime: string,
  stopTime: string,
): Promise<PlayUrlVo> {
  return bzGet<PlayUrlVo>(
    `/ezviz/cameras/${cameraId}/playback-url`,
    { source, startTime, stopTime, protocol: 1 },
    conf(),
  )
}

/** §6.7 抓拍当前画面 POST /ezviz/cameras/{id}/capture（返回平台托管图片 URL，有时效需即时看） */
export function captureCamera(cameraId: number): Promise<string> {
  return bzPost<string>(`/ezviz/cameras/${cameraId}/capture`, undefined, conf())
}

/** §6.2 新增摄像头台账 POST /ezviz/cameras（序列号全局唯一，重复 code=0） */
export function addCamera(body: CameraSaveBody): Promise<CameraVo> {
  return bzPost<CameraVo>('/ezviz/cameras', body)
}

/** §6.3 修改摄像头台账 POST /ezviz/cameras/{id}/update（全量提交目标状态，查重排除自身） */
export function updateCamera(cameraId: number, body: CameraSaveBody): Promise<CameraVo> {
  return bzPost<CameraVo>(`/ezviz/cameras/${cameraId}/update`, body)
}

/** §6.4 删除摄像头台账 POST /ezviz/cameras/{id}/delete */
export function deleteCamera(cameraId: number): Promise<boolean> {
  return bzPost<boolean>(`/ezviz/cameras/${cameraId}/delete`)
}
