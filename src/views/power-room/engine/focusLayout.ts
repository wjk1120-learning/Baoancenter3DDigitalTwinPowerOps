const GCK_SIZE = { w: 1.0, h: 2.2, d: 0.72 } as const

/**
 * 聚焦构图（纯计算，不依赖 three，可单测）。
 *
 * 点一级柜后：该柜仍站在地上、挪到画面右侧并放大；它挂的二级小柜**悬浮**在左侧
 * 空中，**纵向优先**排在一面「竖直墙」上（先往下排，一列最多 `SEC_MAX_ROWS` 个，
 * 满了往右加一列；第一个在左上）。选中态（默认第一个小柜）由 `focusCol` 决定：
 * 构图整体按 `viewK`（VIEW_K × SELECT_PUSH_IN）推近，并把选中的那一列滑到画面中央
 * `SELECT_FX`——越界时以「不压左侧侧栏、竖排母线仍在大柜出线口左侧」为准。
 *
 * 竖直墙 = 过对位点、含世界 Y 与相机右向的平面：横向按屏幕比例解算，纵向直接给
 * 世界高度（明显离地、又不顶到顶栏），列多时按可用竖直带压缩柜体尺寸，因此柜子在
 * 屏幕上就是竖排，也不会掉到地面以下。光路只走「相机右向」与「世界 Y」两个方向，
 * 转角全是 90°（横段 → 竖排母线 → 每排支线）。竖直带的世界上下界由 caller 用同一个
 * viewK 换算（scene 的 `bandTopY = wall(BAND_TOP_FY)`），不然推近后整列会顶出顶栏。
 */

export interface FocusPoint3 {
  x: number
  y: number
  z: number
}

export interface FocusPoint2 {
  x: number
  z: number
}

export interface FocusPlacement extends FocusPoint3 {
  scale: number
  col: number
  row: number
}

export interface FocusLayout {
  /** 大柜（仍站在地上）：地面位置 + 缩放；fx/fy 是屏幕比例（光路出线口按它算） */
  big: { x: number; z: number; scale: number; fx: number; fy: number }
  feeders: FocusPlacement[]
  cols: number
  rows: number
  /** 直角光路（世界坐标）：出线横段 / 竖排母线上下两段（分岔口分流）/ 每排支线 */
  trunk: [FocusPoint3, FocusPoint3]
  /** 竖排母线两段，from 都是分岔口（大柜出线口高度）：up 向上盖顶排、down 向下盖底排 */
  riserUp: [FocusPoint3, FocusPoint3]
  riserDown: [FocusPoint3, FocusPoint3]
  stubs: { from: FocusPoint3; to: FocusPoint3 }[]
}

/** 聚焦相机构图参数：由 engine 按同一套机位生成 */
export interface FocusFrame {
  /** 竖直悬浮墙：屏幕比例（0..1，左上原点）→ 墙面上的世界点 */
  wall: (fx: number, fy: number) => FocusPoint3
  /** 地面点（大柜仍站在地上） */
  ground: (fx: number, fy: number) => FocusPoint2
  /** 世界点 → 聚焦相机距离（大柜等视觉尺寸补偿） */
  dist: (x: number, y: number, z: number) => number
  /** 悬浮墙到相机的深度距离（小柜等视觉尺寸） */
  planeDist: number
  /** 视口宽高比（横向尺寸按它折算，换窗口不挤） */
  aspect: number
  /** 相机水平右向量（世界单位向量，y=0）：横向排布与直角光路都用它 */
  rightH: FocusPoint2
  /** 视线前向量的 y 分量（竖直墙上下有深度差 → 等视觉尺寸补偿用） */
  fwdY: number
}

/** 引擎相机垂直视场角（构图换算用，改 engine 相机必须同步这里） */
export const PERSP_FOV = 42

/** 相机水平偏航角（0 = 相机在 +Z 方向；engine 的 circuitCam 与 scene 的整组前移方向都用它） */
export const CAM_YAW = (12 * Math.PI) / 180
/** 相机俯仰角（机位高于对位点的角度；越小越接近平视） */
export const CAM_PITCH = (17 * Math.PI) / 180

/**
 * 聚焦构图整体缩放（以画面中心为基准）：0.765 = 视角收缩到 76.5%（先缩 10% 再缩 15%）
 * ——构图位置与柜体尺寸一起缩，四周留白更多。scene 对 ground/wall 解算结果做同一缩放，
 * 可用竖直带的顶上界也按同一系数换算（见 BAND_TOP_FY）。
 */
// 0.765 是早期「缩 10% 再缩 15%」；2026-10-15 用户口径「聚焦视角也放大 15%」→ ×1.15
export const VIEW_K = 0.9 * 0.85 * 1.15

/**
 * 选中态构图推近：选中任一小柜时，整幅聚焦构图按 VIEW_K × SELECT_PUSH_IN 重排
 * （所有柜略大、竖排展开），配合「选中列滑到画面中央」= 视角压到它身上。
 */
export const SELECT_PUSH_IN = 1.15
/** 选中小柜所在列滑到的屏幕横向位置（画面中央） */
export const SELECT_FX = 0.5

/** 可用竖直带：下 = 小柜离地高度（世界 y，明显看出悬浮）；上 = 画面比例（不顶到顶栏/名牌） */
export const BAND_BOTTOM_Y = 0.35
/**
 * 顶上界（福永原值 0.215）：名牌要留在顶栏与房名 pill 之下，选中态推近后名牌还会
 * 再抬高一点。福永与宝中的房名 pill 都在顶部中央，0.215 下首行名牌顶 ≈ 画面 15%，
 * 在 pill（底 ≈13%）之下留白通过。此前宝中调 0.355 是为避让 pill，代价是竖直带压矮、
 * 开关整体缩小 ~45%（与福永观感不符，2026-11-11 用户拍板回退福永原值）。
 */
export const BAND_TOP_FY = 0.215

/** 地板网格一格 = 200 / 100 = 2 世界单位（scene 的整组前移 CONTENT_SHIFT 按它算） */
export const FLOOR_CELL = 2

/**
 * 整组建模相对地板网格前移一格（朝镜头方向）：地板网格不动、柜体整体前移，
 * 看起来就是「模型往前挪了一个格子」。scene（建柜/母线/聚焦构图）与 engine（初始视角
 * 取景）都读这一份，**不要再在别处重算**。
 */
export const CONTENT_SHIFT = {
  x: FLOOR_CELL * Math.sin(CAM_YAW),
  y: 0,
  z: FLOOR_CELL * Math.cos(CAM_YAW),
}

/**
 * 「整组前移」在屏幕上带来的透视放大：前移量 = FLOOR_CELL（水平、朝镜头），
 * 沿视线方向的深度少 FLOOR_CELL·cos(CAM_PITCH)，聚焦构图里的点与尺寸在屏幕上都按
 * K = planeDist / (planeDist − FLOOR_CELL·cos(CAM_PITCH)) 放大（聚焦机位下约 1.17）。
 * 所以「屏幕上要达标的边界」（左栏留白）必须按它反算，不能直接拿屏幕比例当锚点用。
 */
export function contentStretch(planeDist: number) {
  return planeDist / Math.max(0.001, planeDist - FLOOR_CELL * Math.cos(CAM_PITCH))
}

/** 大柜：靠右、略低于画面中线（站位在地上） */
export const BIG_FX = 0.755
const BIG_FY = 0.635
export const BIG_APPARENT = 0.305
/** 小柜：悬浮墙上的横向中心（屏宽比例）；列多变宽时按 CLUSTER_KEEP_FX 整体右移 */
export const SEC_CX = 0.4
/** 小柜群左缘在**屏幕上**的最小横向位置（避开左侧分类/看板 400px ≈ 0.208 + 留白） */
const CLUSTER_KEEP_FX = 0.25
/** 小柜群整群最大宽度（屏宽比例），超了就把柜体再缩小 */
const CLUSTER_MAX_W = 0.42
/** 小柜标称屏幕高度占比（列少时用；列多时按可用竖直带压缩） */
export const SEC_APPARENT = 0.115
/** 小柜目标尺寸系数（在标称基础上再放大一档；福永原值 4/3） */
const SEC_GROW_K = 4 / 3
/** 一列最多几个小柜（超过往右加一列） */
export const SEC_MAX_ROWS = 4
/** 行距 / 列距（相对小柜自身尺寸的系数；福永原值） */
const ROW_STEP_K = 1.34
const ROW_GAP_K = ROW_STEP_K - 1
/**
 * 列距（相对小柜自身宽度的系数）。宝中 2026-11-10 1.35→2.1：折行两行名牌的实际宽度
 * （长名「柜名 测点N」canvas ~285px ×0.62×popBase）实测为列距的 ~1.5 倍，相邻列名牌
 * 互相叠（福永数据形状下名牌更窄不叠）；2.1 使名牌/列距 ≈0.95（贴满但互不压）。
 */
const COL_STEP_K = 2.1
/**
 * 行距放大（用户口径「行与行之间的间隔加多 1/2 倍行距」）：间隔在名牌占位之外再空出
 * ROW_SPREAD × 原行距，于是新行距 = 原行距 × (1 + ROW_SPREAD) = 柜高 × 2.01。
 * 竖直带高度不变，所以行数多（4 行）的柜群柜体会相应缩小来腾出间距。（福永原值 0.5）
 */
const ROW_SPREAD = 0.5
/**
 * 名牌占位（局部高度系数）与最小留白（世界）：矮柜按它补足排间距，避免名牌压到上一台。
 * （福永原值 0.08。宝中 11-11 曾调 0.15/0.18 想解决「选中名牌压上一行开关」，后经福永
 *  EAA3 截图证实福永也有两行名牌 + 4 行摆场且互不接触 → 问题不在行距，已回退福永原值。）
 */
const LABEL_K = 0.36
const LABEL_PAD = 0.08
/** 竖排母线离小柜群右缘的留白（屏宽比例） */
const RISER_GAP_W = 0.055
/** 选中列右滑时至少给竖排母线留出的横向余量（屏宽比例；不留就会把母线压进柜群） */
const RISER_ROOM_W = 0.06
/** 大柜出线口离柜体左缘的留白（屏宽比例） */
const PORT_GAP_W = 0.014

/** 屏幕高度占比 → 世界高度：h_world = apparent × 2·d·tan(fov/2) */
const SIZE_K = (2 * Math.tan((PERSP_FOV * Math.PI) / 360)) / GCK_SIZE.h

export function apparentScale(apparent: number, dist: number) {
  return Math.max(0.05, apparent * SIZE_K * dist)
}

/** 屏宽比例 → 悬浮墙深度上的世界横向距离 */
export function worldPerScreenX(frame: { planeDist: number; aspect: number }) {
  return 2 * frame.planeDist * Math.tan((PERSP_FOV * Math.PI) / 360) * frame.aspect
}

/** 柜宽按高度折算成屏宽比例（宽高比 <1，横向还要除视口宽高比） */
function widthW(heightFraction: number, aspect: number, unit?: { w: number; h: number }) {
  const ratio = unit ? unit.w / unit.h : GCK_SIZE.w / GCK_SIZE.h
  return (heightFraction * ratio) / aspect
}

/** 纵向优先的网格式：列数固定后各列均分，避免出现 5+1 这种缺角（福永原版；
 *  行数跟随开关个数——福永本身就有「一列四个」与「一列三个」两种摆场） */
export function gridOf(count: number) {
  if (count <= 0) return { cols: 0, rows: 0 }
  const cols = Math.ceil(count / SEC_MAX_ROWS)
  const rows = Math.ceil(count / cols)
  return { cols, rows }
}

export function computeFocusLayout(
  opts: Pick<
    FocusFrame,
    'ground' | 'wall' | 'dist' | 'planeDist' | 'aspect' | 'rightH' | 'fwdY'
  > & {
    count: number
    unit?: { w: number; h: number }
    /** 大柜模型槽位（局部单位）：出线口位置按它的实际宽高比算；默认 GCK */
    bigUnit?: { w: number; h: number }
    /** 构图缩放（视角）：默认 VIEW_K；选中态传 VIEW_K × SELECT_PUSH_IN = 推近 */
    viewK?: number
    /** 当前选中的小柜所在列（0 起）：给了就把它滑到画面中央（受左栏 / 大柜出线口限制） */
    focusCol?: number | null
    /** 可用竖直带（世界 y），由 caller 按 viewK 换算顶上界 */
    bandBottomY: number
    bandTopY: number
  },
): FocusLayout {
  const { count, ground, wall, dist, planeDist, aspect, rightH } = opts
  const viewK = opts.viewK ?? VIEW_K
  // 小柜自身尺寸（局部单位）：默认 GCK 比例；换成 GLB（kaiguan）后按模型实际尺寸算行距/列距
  const unit = opts.unit ?? { w: GCK_SIZE.w, h: GCK_SIZE.h }
  // 大柜宽高比：换 peidiangui.glb 后比 GCK 窄，出线口要跟着挪到柜体左缘
  const bigUnit = opts.bigUnit ?? { w: GCK_SIZE.w, h: GCK_SIZE.h }
  const bigP = ground(BIG_FX, BIG_FY)
  const bigScale = apparentScale(BIG_APPARENT * viewK, dist(bigP.x, GCK_SIZE.h / 2, bigP.z))
  const big = { x: bigP.x, z: bigP.z, scale: bigScale, fx: BIG_FX, fy: BIG_FY }

  const { cols, rows } = gridOf(count)
  const worldPerX = worldPerScreenX(opts)
  const portFx = BIG_FX - widthW(BIG_APPARENT, aspect, bigUnit) / 2 - PORT_GAP_W
  /** 出线口高度：取大柜柜体中段 */
  const portY = (GCK_SIZE.h * bigScale) / 2

  // 柜体尺寸：标称按「最大边」折算（GCK 取高、扁平模型取宽，保证屏幕上看得见），
  // 列多时再按可用竖直带压缩，保证整列不落地、不顶栏
  const basis = Math.max(unit.w, unit.h)
  const nominalScale =
    apparentScale(SEC_APPARENT * SEC_GROW_K * viewK, planeDist) * (GCK_SIZE.h / basis)
  const span = Math.max(1, opts.bandTopY - opts.bandBottomY)
  // 行距：柜高 × 1.34 起算；扁平模型（如 kaiguan）名牌相对更大，按「名牌世界高度」补足间距；
  // 最后整段行距再乘 (1 + ROW_SPREAD)＝行与行之间多空出半个原行距
  const rowK = 1 + ROW_SPREAD
  const gapFor = (hUnit: number) => {
    const base = Math.max(ROW_GAP_K * hUnit, LABEL_K * (hUnit / unit.h) + LABEL_PAD)
    return base * rowK + hUnit * ROW_SPREAD
  }
  const pitchFor = (hUnit: number) => hUnit + gapFor(hUnit)
  // 可用带内能塞下的最大柜高（两种情形线性，直接解，避免迭代）
  const hA = span / ((rows - 1) * rowK * (1 + ROW_GAP_K) + 1)
  const hB =
    (span - rowK * LABEL_PAD * (rows - 1)) / (1 + (rows - 1) * rowK * (1 + LABEL_K / unit.h))
  const hCross =
    ROW_GAP_K - LABEL_K / unit.h > 0 ? LABEL_PAD / (ROW_GAP_K - LABEL_K / unit.h) : Infinity
  const hFit = hA >= hCross ? hA : hB
  const unitH = cols ? Math.max(0.12, Math.min(unit.h * nominalScale, hFit)) : unit.h * nominalScale
  const stepRow = pitchFor(unitH)
  // 横向再兜一层：整群宽度不超过 CLUSTER_MAX_W，也不用压到大柜
  // （可用横向带 = 左栏留白 → 大柜出线口前，再给竖排母线留 RISER_ROOM_W：
  //   推近后柜群变宽，若只用 CLUSTER_MAX_W，母线会被顶到大柜出线口右边、光路反向）
  const clusterMaxW = Math.min(CLUSTER_MAX_W, portFx - RISER_ROOM_W - CLUSTER_KEEP_FX)
  const spanColsK = COL_STEP_K * Math.max(0, cols - 1) + 1
  const scaleXMax = (clusterMaxW * worldPerX) / (unit.w * spanColsK)
  const scale = Math.min(unitH / unit.h, scaleXMax)
  const stepCol = unit.w * scale * COL_STEP_K
  const halfW = (unit.w * scale) / 2
  // 整列在可用竖直带里居中
  const centerY = (opts.bandBottomY + opts.bandTopY) / 2
  // 悬浮墙锚点：列多时柜群变宽，整体右移。锚点走 viewK 映射、横向偏移是绝对值，
  // 屏幕上的左缘还要再乘「整组前移」的透视放大（contentStretch），
  // 所以左界按「屏幕上左缘 ≥ CLUSTER_KEEP_FX」反算锚点下限
  const stretch = contentStretch(planeDist)
  const keepLayoutFx = 0.5 - (0.5 - CLUSTER_KEEP_FX) / stretch
  const halfSpanFx = (((cols - 1) / 2) * stepCol + halfW) / worldPerX
  const cxKeep = 0.5 + (keepLayoutFx + halfSpanFx - 0.5) / viewK
  const cxMin = Math.max(SEC_CX, cxKeep)
  const cxPort = portFx - RISER_ROOM_W - halfSpanFx
  // 选中态：把选中的那一列滑到画面中央 SELECT_FX；
  // 柜群太宽、两个边界打架时给光路让位（宁可靠左栏一点，也不能把竖排母线顶到大柜出线口右边）
  const cxLo = Math.min(cxMin, cxPort)
  let cx = cxLo
  if (opts.focusCol != null && cols > 0) {
    const colDx = (Math.min(Math.max(opts.focusCol, 0), cols - 1) - (cols - 1) / 2) * stepCol
    const want = 0.5 + (SELECT_FX - 0.5) / viewK - colDx / worldPerX
    cx = Math.min(Math.max(want, cxLo), cxPort)
  }
  const anchor = wall(cx, 0.5)
  const at = (dx: number, y: number): FocusPoint3 => ({
    x: anchor.x + rightH.x * dx,
    y,
    z: anchor.z + rightH.z * dx,
  })

  // 竖直墙上下有深度差（越高越近），按行补偿世界尺寸，屏幕上整列一样大
  const depthK = (y: number) => Math.max(0.6, 1 + ((y - anchor.y) * opts.fwdY) / planeDist)
  const feeders: FocusPlacement[] = []
  for (let i = 0; i < count; i += 1) {
    // 纵向优先：先往下排满一列，再往右加列
    const col = Math.floor(i / rows)
    const row = i % rows
    const dx = (col - (cols - 1) / 2) * stepCol
    const y = centerY + ((rows - 1) / 2 - row) * stepRow
    const p = at(dx, y)
    feeders.push({ x: p.x, y: p.y, z: p.z, scale: scale * depthK(y), col, row })
  }

  // 直角光路：大柜出线口 → 横段 → 竖排母线 → 每排横支线
  // 竖排母线放在柜群右缘外，但始终留在大柜出线口左边（列多到快贴上大柜时不再外扩）
  const clusterRightFx = cx + (((cols - 1) / 2) * stepCol) / worldPerX + halfW / worldPerX
  const riserFx = Math.max(
    clusterRightFx + 0.03,
    Math.min(clusterRightFx + RISER_GAP_W, portFx - 0.03),
  )
  const riserDx = (riserFx - cx) * worldPerX
  const portDx = (portFx - cx) * worldPerX
  const rowsTopY = centerY + ((rows - 1) / 2) * stepRow + unitH / 2
  const rowsBottomY = centerY - ((rows - 1) / 2) * stepRow - unitH / 2
  const trunk: [FocusPoint3, FocusPoint3] = [at(portDx, portY), at(riserDx, portY)]
  // 竖排母线从分岔口（出线口高度）拆成上/下两段：流动光点到分岔口后分开两个方向
  // （2026-10-22 用户口径）。两段恒输出（极短段不可见），保证光路段数稳定。
  const riserUp: [FocusPoint3, FocusPoint3] = [
    at(riserDx, portY),
    at(riserDx, Math.max(portY, rowsTopY)),
  ]
  const riserDown: [FocusPoint3, FocusPoint3] = [
    at(riserDx, portY),
    at(riserDx, Math.min(portY, rowsBottomY)),
  ]
  const stubs = feeders.map((f) => ({
    from: at(riserDx, f.y),
    to: at((f.col - (cols - 1) / 2) * stepCol + (unit.w / 2) * f.scale, f.y),
  }))

  return { big, feeders, cols, rows, trunk, riserUp, riserDown, stubs }
}
