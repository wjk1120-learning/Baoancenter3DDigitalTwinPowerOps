/**
 * 配置中心响应校验（照搬福永配置中心参考包，v4.19 起规则）：
 * 异常形状不能作为空数据或保存成功。后端已知 BUG 容忍点（BUG-011/013/016）
 * 按参考包原样保留，切真后端前不「修复」。
 */
export function validateConfiguration(path: string, value: unknown, write = false): void {
  const fail = (field: string): never => { throw new Error(`配置接口响应无效：${path} / ${field}，请刷新核对`) }
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('记录')
    return v as Record<string, unknown>
  }
  const number = (r: Record<string, unknown>, key: string, min = 1) => {
    if (typeof r[key] !== 'number' || !Number.isSafeInteger(r[key]) || (r[key] as number) < min) fail(key)
  }
  const string = (r: Record<string, unknown>, key: string) => { if (typeof r[key] !== 'string') fail(key) }
  const array = (r: Record<string, unknown>, key: string): unknown[] => {
    if (!Array.isArray(r[key])) return fail(key)
    return r[key] as unknown[]
  }
  if (write && path.endsWith('/delete') && !path.startsWith('/channels/')) {
    // 宝中契约（BZ-Hospital-API v5.4.2，2026-11-25 对齐）：字典删除成功返回 data:null ——
    // 设备类型 §5.4 / 配电房 §5.8 / 数据类型 §5.36；其余删除（箱柜 §5.18 / 楼栋 §5.23 /
    // 统计映射 §5.27 / 楼层统计 §5.32）契约标 Boolean true。
    if (value !== true && !(value === null && /^\/(device-types|switchings|data-types)\//.test(path))) fail('删除确认')
    return
  }
  const check = (value: unknown) => {
    const row = object(value)
    const board = path.split('/')[1]
    if (board === 'channels') {
      number(row, 'channelId'); string(row, 'channelName')
      if (write && path === '/channels' && typeof row.refreshSubmitted !== 'boolean') fail('refreshSubmitted')
      if (path.endsWith('/delete')) {
        // 宝中 §5.12 预检/执行响应无 energyCoreChannel 字段（福永独有），2026-11-25 移除强校验
        if (typeof row.executed !== 'boolean') fail('删除状态')
        for (const key of ['buildingDeviceRefs', 'floorDeviceRefs', 'alertLocationRefs']) number(row, key, 0)
        array(row, 'devices').forEach((v) => { const d = object(v); number(d, 'deviceId'); string(d, 'deviceName') })
        array(row, 'warnings')
      }
    } else if (board === 'devices') {
      number(row, 'deviceId'); number(row, 'channelId'); string(row, 'deviceName')
      if (row.enabled !== 0 && row.enabled !== 1) fail('enabled')
      if (row.superName !== null) string(row, 'superName')
      // ⚠️ BUG-016（2026-11-18 实测）：§5.14 修改设备写回显 locationNumbers 实际返回 null
      // （契约标 Array<String>；列表 §5.13 正常返回数组，仅写回显违约）。
      // 写响应放行 null（api 层归一化 [] 后再交给界面），列表响应仍必须是数组。
      if (row.locationNumbers !== null || !write) {
        if (array(row, 'locationNumbers').some((v) => typeof v !== 'string')) fail('locationNumbers')
      }
    } else if (board === 'building-stats') {
      number(row, 'buildingId', 0); number(row, 'deviceId'); number(row, 'channelId'); string(row, 'buildingName')
      if (row.coefficient !== 1 && row.coefficient !== -1) fail('coefficient')
    } else if (board === 'building-floor-stats') {
      number(row, 'buildingId'); string(row, 'buildingName'); string(row, 'floor')
      const ids = new Set<unknown>()
      array(row, 'devices').forEach((v) => {
        const d = object(v); number(d, 'deviceId')
        if (ids.has(d.deviceId) || (d.coefficient !== 1 && d.coefficient !== -1)) fail('测点组')
        ids.add(d.deviceId)
      })
    } else if (board === 'data-types') {
      // §5.33-5.36 CET 数据类型：DataID 为正整数，备注可空
      number(row, 'id')
      string(row, 'typeCode'); string(row, 'typeName')
      number(row, 'dataId', 1)
      if (row.remark !== null) string(row, 'remark')
    } else {
      number(row, 'id')
      string(row, board === 'device-types' ? 'name' : board === 'switchings' ? 'switchingName' : board === 'buildings' ? 'buildingName' : 'superName')
    if (board === 'cabinets' && !path.endsWith('/fuzzy-search')) {
      // §5.15 deviceNumber 标注 String 唯一，但后端确实存在无编号柜（BUG-011，后端确认无需处理）：
      // 读侧与改档响应放行 null（界面显示「—」）；仅新增建档（§5.16，必填）不接受 null。
      if (row.deviceNumber === null) {
        if (write && path === '/cabinets') fail('deviceNumber')
      } else {
        string(row, 'deviceNumber')
      }
      // §5.16 CabinetAdd 不含 status/health/switching；不得伪造为 CabinetConfig。
      if (!(write && path === '/cabinets') && row.status !== 0 && row.status !== 1) fail('status')
    }
    }
    if (row.warnings != null && (!Array.isArray(row.warnings) || row.warnings.some((v) => typeof v !== 'string'))) fail('warnings')
    if (write) {
      const parts = path.split('/')
      const expected = Number(parts[2])
      const key = board === 'channels' ? 'channelId' : board === 'devices' ? 'deviceId' : 'id'
      if (expected > 0 && ['channels', 'devices', 'cabinets', 'device-types', 'switchings', 'buildings', 'data-types'].includes(board!) && row[key] !== expected) fail('返回 ID 与请求不一致')
      if (board === 'building-stats' && parts[2] === 'devices' && parts[3] && row.deviceId !== Number(parts[3])) fail('deviceId')
      if (board === 'building-floor-stats' && parts[2] && (row.buildingId !== Number(parts[2]) || row.floor !== decodeURIComponent(parts[3]!))) fail('楼栋/楼层')
    }
  }
  if (write) check(value)
  else {
    if (!Array.isArray(value)) fail('列表')
    ;(value as unknown[]).forEach(check)
  }
}
