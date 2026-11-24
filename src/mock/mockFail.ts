/**
 * mock 失败信封标记：handler 返回 mockFail(msg) 时，mockAdapter 会把响应转成
 * `{ code: 0, msg, data: null }`（后端业务失败语义，前端拦截器按 code=0 走
 * reject(Error(msg))，silent 请求的错误文案就地显示在弹窗红条）。
 * 配置中心写接口需要复刻后端失败路径（重名校验、删除有关联项等）而引入。
 */

export const MOCK_FAIL = Symbol('mock-fail')

export interface MockFail {
  [MOCK_FAIL]: string
}

export function mockFail(msg: string): MockFail {
  return { [MOCK_FAIL]: msg }
}

export function isMockFail(v: unknown): v is MockFail {
  return !!v && typeof v === 'object' && MOCK_FAIL in v
}
