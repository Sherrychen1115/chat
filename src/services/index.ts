// 整個專案「決定通訊層是哪一個」的唯一地方。

import type { ChatService } from './ChatService'
import { SupabaseChatService } from './SupabaseChatService'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** 舊版的 Secret key(service_role)是一串 JWT,解開來看角色 */
function isLegacyServiceRoleKey(value: string): boolean {
  try {
    const payload = value.split('.')[1]
    if (!payload) return false
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return json.role === 'service_role'
  } catch {
    return false
  }
}

function findProblem(): string | null {
  if (!url || !key) return '缺少 Supabase 設定(VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY)'
  // 保護:Secret key 絕對不能放進前端,放了就拒絕啟動
  if (key.startsWith('sb_secret_') || isLegacyServiceRoleKey(key)) {
    return '設定錯誤:放進來的是 Secret key,只能用 Publishable key'
  }
  return null
}

/** 設定有問題時是說明文字,沒問題時是 null */
export const configProblem = findProblem()

export const chatService: ChatService | null = configProblem
  ? null
  : new SupabaseChatService(url as string, key as string)
