import { useCallback, useEffect, useRef, useState } from 'react'
import { RateLimiter } from '../lib/rateLimit'
import { cleanBody, isBodyValid, validateNickname } from '../lib/text'
import {
  ChatError,
  HISTORY_LIMIT,
  type ChatErrorCode,
  type ChatService,
  type ConnectionStatus,
  type Message,
  type NoticeKind,
} from '../services/ChatService'

const NICKNAME_STORAGE_KEY = 'chat.nickname'

export type TimelineItem =
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'notice'; key: string; notice: NoticeKind; nickname: string }

export type SendResult = { ok: true } | { ok: false; code: ChatErrorCode }

function readStoredNickname(): string | null {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredNickname(nickname: string | null): void {
  try {
    if (nickname) localStorage.setItem(NICKNAME_STORAGE_KEY, nickname)
    else localStorage.removeItem(NICKNAME_STORAGE_KEY)
  } catch {
    // 瀏覽器不讓存(例如無痕模式)就算了,只是重新整理後要重新輸入代號
  }
}

function toItem(message: Message): TimelineItem {
  return { kind: 'message', key: `m${message.id}`, message }
}

/** 把新收到的訊息併進時間軸,同一個編號的訊息只留一則 */
function mergeMessages(items: TimelineItem[], incoming: Message[]): TimelineItem[] {
  const have = new Set<number>()
  for (const item of items) if (item.kind === 'message') have.add(item.message.id)
  const fresh = incoming.filter((m) => !have.has(m.id)).map(toItem)
  return fresh.length === 0 ? items : [...items, ...fresh]
}

export function useChat(service: ChatService) {
  const [storedNickname] = useState(readStoredNickname)
  // 有上次的代號就先直接進聊天室畫面(顯示載入中),失敗再退回輸入代號
  const [phase, setPhase] = useState<'nickname' | 'chat'>(storedNickname ? 'chat' : 'nickname')
  const [joining, setJoining] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [nickname, setNickname] = useState(storedNickname ?? '')
  const [nicknameError, setNicknameError] = useState<ChatErrorCode | null>(null)
  const [kickedNotice, setKickedNotice] = useState(false)
  const [items, setItems] = useState<TimelineItem[]>([])
  const [members, setMembers] = useState<string[]>([])
  const [connection, setConnection] = useState<ConnectionStatus>('connected')
  const [unread, setUnread] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [cooling, setCooling] = useState(false)

  const limiter = useRef(new RateLimiter())
  const lastIdRef = useRef(0)
  const connectionRef = useRef<ConnectionStatus>('connected')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const startedRef = useRef(false)

  const resetToNicknameScreen = useCallback((showKicked: boolean) => {
    writeStoredNickname(null)
    setPhase('nickname')
    setJoining(false)
    setLoadingHistory(false)
    setItems([])
    setMembers([])
    setConnection('connected')
    connectionRef.current = 'connected'
    lastIdRef.current = 0
    setKickedNotice(showKicked)
  }, [])

  // 訂閱通訊層的事件
  useEffect(() => {
    const offs = [
      service.on('message', (message) => {
        if (phaseRef.current !== 'chat') return
        lastIdRef.current = Math.max(lastIdRef.current, message.id)
        setItems((prev) => mergeMessages(prev, [message]))
        if (message.senderId !== service.selfId && document.hidden) setUnread((n) => n + 1)
      }),
      service.on('members', (list) => setMembers(list)),
      service.on('notice', (notice) => {
        setItems((prev) => [
          ...prev,
          { kind: 'notice', key: notice.id, notice: notice.kind, nickname: notice.nickname },
        ])
      }),
      service.on('connection', (status) => {
        const previous = connectionRef.current
        connectionRef.current = status
        if (status === 'kicked') {
          resetToNicknameScreen(true)
          return
        }
        setConnection(status)
        // 重連成功:補抓斷線期間漏掉的訊息
        if (status === 'connected' && previous === 'reconnecting') {
          service
            .loadSince(lastIdRef.current)
            .then((missed) => {
              if (missed.length > 0) {
                lastIdRef.current = Math.max(lastIdRef.current, ...missed.map((m) => m.id))
                setItems((prev) => mergeMessages(prev, missed))
              }
            })
            .catch(() => undefined)
        }
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [service, resetToNicknameScreen])

  const enter = useCallback(
    async (raw: string, auto = false) => {
      const checked = validateNickname(raw)
      if (!checked.ok) {
        setNicknameError('nickname_invalid')
        if (auto) resetToNicknameScreen(false)
        return
      }
      setNicknameError(null)
      setKickedNotice(false)
      setJoining(true)
      try {
        await service.join(checked.value)
      } catch (error) {
        const code = error instanceof ChatError ? error.code : 'network'
        resetToNicknameScreen(auto && code === 'nickname_taken')
        if (!(auto && code === 'nickname_taken')) setNicknameError(code)
        return
      }
      writeStoredNickname(checked.value)
      setNickname(checked.value)
      setItems([])
      lastIdRef.current = 0
      setPhase('chat')
      setJoining(false)
      setLoadingHistory(true)
      try {
        const recent = await service.loadRecent(HISTORY_LIMIT)
        if (recent.length > 0) {
          lastIdRef.current = Math.max(lastIdRef.current, ...recent.map((m) => m.id))
        }
        // 載入期間可能已經先收到新訊息,所以是「併入」而不是「覆蓋」
        const historyIds = new Set(recent.map((m) => m.id))
        setItems((prev) => [
          ...recent.map(toItem),
          ...prev.filter((item) => item.kind === 'notice' || !historyIds.has(item.message.id)),
        ])
      } catch {
        setConnection('reconnecting')
        connectionRef.current = 'reconnecting'
      } finally {
        setLoadingHistory(false)
      }
    },
    [service, resetToNicknameScreen],
  )

  // 重新整理後自動用上次的代號回來
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (storedNickname) {
      setJoining(true)
      void enter(storedNickname, true)
    }
  }, [storedNickname, enter])

  const leave = useCallback(async () => {
    await service.leave()
    resetToNicknameScreen(false)
    setNicknameError(null)
    setNickname('')
  }, [service, resetToNicknameScreen])

  // 限速冷卻:時間到了自動恢復
  useEffect(() => {
    const remaining = cooldownUntil - Date.now()
    if (remaining <= 0) {
      setCooling(false)
      return
    }
    setCooling(true)
    const timer = setTimeout(() => setCooling(false), remaining)
    return () => clearTimeout(timer)
  }, [cooldownUntil])

  const send = useCallback(
    async (text: string): Promise<SendResult> => {
      const body = cleanBody(text)
      if (!isBodyValid(body)) return { ok: false, code: 'body_invalid' }
      const wait = limiter.current.waitMs()
      if (wait > 0) {
        setCooldownUntil(Date.now() + wait)
        return { ok: false, code: 'rate_limited' }
      }
      limiter.current.record()
      try {
        await service.sendMessage(body)
        return { ok: true }
      } catch (error) {
        const code = error instanceof ChatError ? error.code : 'network'
        if (code === 'rate_limited') setCooldownUntil(Date.now() + 3000)
        if (code === 'not_member') resetToNicknameScreen(true)
        return { ok: false, code }
      }
    },
    [service, resetToNicknameScreen],
  )

  const clearUnread = useCallback(() => setUnread(0), [])
  const clearNicknameError = useCallback(() => setNicknameError(null), [])

  return {
    phase,
    joining,
    loadingHistory,
    nickname,
    nicknameError,
    kickedNotice,
    items,
    members,
    connection,
    unread,
    cooling,
    selfId: service.selfId,
    enter,
    leave,
    send,
    clearUnread,
    clearNicknameError,
  }
}
