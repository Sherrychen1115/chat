import { useEffect } from 'react'

const BASE_TITLE = '匿名聊天室'

/** 分頁標題顯示未讀數,例如「(3) 匿名聊天室」;回到分頁後清掉 */
export function useUnreadTitle(unread: number, clearUnread: () => void) {
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE
  }, [unread])

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) clearUnread()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [clearUnread])
}
