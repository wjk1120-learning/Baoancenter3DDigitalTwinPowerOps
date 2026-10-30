import { OPERATIONS_EXTERNAL_URL } from '../config/authConfig'

/**
 * 已登录跳运维平台：福永会先 POST /auth/tickets 签发 ticket 再拼地址新开窗口。
 * TODO(登录移植): 补 issueJumpTicket() 签发与失败 toast；当前无登录态，
 * 配置了地址就直接打开（由运维平台自己的登录兜底），未配置则提示。
 */
export async function openOperationsPlatform(): Promise<void> {
  if (!OPERATIONS_EXTERNAL_URL) {
    window.alert('运维平台未配置独立地址（.env VITE_OPERATIONS_URL）')
    return
  }
  window.open(OPERATIONS_EXTERNAL_URL, '_blank')
}
