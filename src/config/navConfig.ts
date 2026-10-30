export interface NavItemConfig {
  id: string
  name: string
  /** 视图路径（暂无 router，对应 App.vue 的视图表） */
  route: string
}

/** 顶部导航：配电房为实页，医院总览为占位页；后续模块移植时在此追加 */
export const navConfig: NavItemConfig[] = [
  { id: 'overview', name: '医院总览', route: '/hospital' },
  { id: 'power-room', name: '配电房', route: '/power-room' },
]
