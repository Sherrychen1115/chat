import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { TimelineItem } from './useChat'

const BOTTOM_THRESHOLD = 32

/**
 * 訊息列表的捲動規則:
 * - 剛載入時停在最底
 * - 自己送出的訊息,一定捲到最底
 * - 本來就在最底時,新訊息進來自動跟著捲
 * - 往上捲動時有別人的新訊息:畫面不動,出現「有新訊息」按鈕
 */
export function useAutoScroll(items: TimelineItem[], selfId: string) {
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const seenCountRef = useRef(0)
  const [showNew, setShowNew] = useState(false)

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  useLayoutEffect(() => {
    const seen = seenCountRef.current
    seenCountRef.current = items.length

    if (items.length === 0) {
      atBottomRef.current = true
      setShowNew(false)
      return
    }
    if (seen === 0 || items.length < seen) {
      scrollToBottom(false)
      atBottomRef.current = true
      return
    }
    const added = items.slice(seen)
    if (added.length === 0) return
    const ownAdded = added.some((i) => i.kind === 'message' && i.message.senderId === selfId)
    if (ownAdded || atBottomRef.current) {
      scrollToBottom(false)
      atBottomRef.current = true
    } else if (added.some((i) => i.kind === 'message')) {
      setShowNew(true)
    }
  }, [items, selfId, scrollToBottom])

  const onScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
    atBottomRef.current = atBottom
    if (atBottom) setShowNew(false)
  }, [])

  const jumpToBottom = useCallback(() => {
    scrollToBottom(true)
    setShowNew(false)
  }, [scrollToBottom])

  return { listRef, showNew, onScroll, jumpToBottom }
}
