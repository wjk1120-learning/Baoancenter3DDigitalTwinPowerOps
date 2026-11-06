/** 设备管理模块契约类型（docs/FY-Hospital-API-v3.90.md §1，字段只认文档所载） */

/** §1.2 楼栋 */
export interface BuildingInfo {
  id: number
  buildingName: string
}

/** §1.4 箱柜（SuperDevice） */
export interface SuperDevice {
  id: number
  superName: string
  /** 设备类型（低压柜/配电箱等） */
  deviceType: string
  /** 设备编号（如 BZ000021） */
  deviceNumber: string
  /** 投运日期 yyyy-MM-dd（未维护为 null） */
  commissionDate: string | null
  /** 有无开关（0=无开关, 1=有开关） */
  status: number
  /** 健康度（0~100，默认 100） */
  health: number | null
  /** 箱柜下测点设备数量 */
  deviceCount: number
}

/** §1.7 箱柜下设备明细（DeviceDetail） */
export interface DeviceDetail {
  deviceId: number
  deviceName: string
  /** 所属箱柜名称（未挂接为 null） */
  superName: string | null
  /** 历史告警数（全部事件口径，不区分处理状态） */
  alarmCount: number
  /** 启用状态（0=停用, 1=启用） */
  enabled: number
}

/** §1.8 箱柜下设备列表（精简，适配下拉/选择器场景；按 deviceId 升序，无分页） */
export interface DeviceBrief {
  deviceId: number
  deviceName: string
}

/** §1.11 测点（MeasInfo） */
export interface MeasInfo {
  measID: number
  measName: string
  /** 测点类型：0=仪表，1=温控 */
  measType: number
  /** 测点当前值 */
  measVal: number
}

/** §1.12 健康度五档统计（优秀 ≥85 / 良好 [70,85) / 一般 [50,70) / 较差 [30,50) / 极差 <30） */
export interface DeviceHealthLevelStats {
  excellentCount: number
  goodCount: number
  fairCount: number
  poorCount: number
  terribleCount: number
  totalCount: number
}
