/** 萤石视频监控模块契约类型（docs/FY-Hospital-API.md §6，字段只认文档所载） */

/** §6.1 摄像头台账（CameraVo） */
export interface CameraVo {
  /** 台账 ID */
  id: number
  /** 萤石设备序列号（萤石控制台/APP 查看） */
  deviceSerial: string
  /** 摄像头名称（本地展示名） */
  cameraName: string
  /** 位置描述（可空） */
  locationDesc: string | null
  /** 萤石设备在线状态（true 在线 / false 离线 / null 查询失败未知） */
  online: boolean | null
}

/** §6.5/§6.6 取流地址（PlayUrlVo）：url + accessToken 供 EZUIKit.js 初始化播放器 */
export interface PlayUrlVo {
  url: string
  accessToken: string
}

/** §6.2/§6.3 台账新增/修改请求体（修改为全量提交目标状态） */
export interface CameraSaveBody {
  deviceSerial: string
  cameraName: string
  /** 位置描述（可空） */
  locationDesc?: string | null
}

/** §6.6 回放来源：local=设备 SD 卡本地录像 / cloud=云存储录像 */
export type PlaybackSource = 'local' | 'cloud'
