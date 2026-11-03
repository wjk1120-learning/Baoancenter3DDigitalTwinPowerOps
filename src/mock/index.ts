/** mock 总开关：读 .env 的 VITE_USE_MOCK。退役 = 置 false 切真联调 + 删 src/mock/ 目录 */
export function useMock(): boolean {
  return (import.meta.env.VITE_USE_MOCK as string | undefined)?.trim().toLowerCase() === 'true'
}
