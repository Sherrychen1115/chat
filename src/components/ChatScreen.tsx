import { useEffect, useState } from 'react'
import { useAutoScroll } from '../hooks/useAutoScroll'
import type { SendResult, TimelineItem } from '../hooks/useChat'
import type { ConnectionStatus } from '../services/ChatService'
import { ChatIcon, ArrowDownIcon, ChevronIcon, LogoutIcon, SpinnerIcon, UsersIcon } from './icons'
import { MessageInput } from './MessageInput'
import { MessageItem } from './MessageItem'
import { OnlineList } from './OnlineList'

interface Props {
  nickname: string
  selfId: string
  items: TimelineItem[]
  members: string[]
  connection: ConnectionStatus
  /** 正在進入或載入歷史訊息 */
  loading: boolean
  cooling: boolean
  onSend: (text: string) => Promise<SendResult>
  onLeave: () => void
}

export function ChatScreen({
  nickname,
  selfId,
  items,
  members,
  connection,
  loading,
  cooling,
  onSend,
  onLeave,
}: Props) {
  const [listOpen, setListOpen] = useState(false)
  const { listRef, showNew, onScroll, jumpToBottom } = useAutoScroll(items, selfId)
  const offline = connection === 'reconnecting'
  const countText = loading && members.length === 0 ? '—' : String(members.length)

  // 按 Esc 收起手機版的線上名單
  useEffect(() => {
    if (!listOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setListOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [listOpen])

  return (
    <div className="chat">
      <header className="chat__header">
        <h1 className="chat__title">匿名聊天室</h1>
        <button
          type="button"
          className={listOpen ? 'pill pill--open' : 'pill'}
          aria-expanded={listOpen}
          aria-controls="members-popover"
          aria-label={listOpen ? '收起線上名單' : '展開線上名單'}
          onClick={() => setListOpen((open) => !open)}
        >
          <span className="dot" aria-hidden="true" />
          <span>{countText} 人在線</span>
          <ChevronIcon up={listOpen} />
        </button>
        <button type="button" className="btn btn--ghost-danger" onClick={onLeave}>
          <LogoutIcon />
          <span>離開</span>
        </button>
      </header>

      {offline && (
        <div className="banner" role="status">
          <SpinnerIcon />
          <span>連線中…</span>
        </div>
      )}

      <div className="chat__body">
        <div className="chat__main">
          <div className="messages-wrap">
            <div className="messages" ref={listRef} onScroll={onScroll}>
              <div className="messages__inner">
                {loading && items.length === 0 && (
                  <div className="skeleton" role="status">
                    <div className="skeleton__row">
                      <div className="skeleton__name" />
                      <div className="skeleton__bubble" style={{ width: 200, height: 40 }} />
                    </div>
                    <div className="skeleton__row skeleton__row--self">
                      <div className="skeleton__name" />
                      <div className="skeleton__bubble" style={{ width: 150, height: 40 }} />
                    </div>
                    <div className="skeleton__row">
                      <div className="skeleton__name" />
                      <div className="skeleton__bubble" style={{ width: 250, height: 64 }} />
                    </div>
                    <div className="skeleton__label">
                      <SpinnerIcon size={18} />
                      <span>載入訊息中…</span>
                    </div>
                  </div>
                )}
                {!loading && items.length === 0 && (
                  <div className="empty">
                    <div className="empty__icon">
                      <ChatIcon size={28} />
                    </div>
                    <div className="empty__title">還沒有人說話</div>
                    <div className="empty__text">送出第一則訊息,開啟這個聊天室。</div>
                  </div>
                )}
                {items.map((item) => (
                  <MessageItem key={item.key} item={item} selfId={selfId} />
                ))}
              </div>
            </div>

            {showNew && (
              <div className="new-message">
                <button type="button" className="btn btn--primary btn--pill" onClick={jumpToBottom}>
                  <ArrowDownIcon />
                  <span>有新訊息</span>
                </button>
              </div>
            )}

            {listOpen && (
              <>
                <div className="popover-backdrop" onClick={() => setListOpen(false)} />
                <div className="popover" id="members-popover">
                  <div className="popover__title">目前在線 {members.length} 人</div>
                  <OnlineList members={members} selfNickname={nickname} />
                </div>
              </>
            )}
          </div>

          <MessageInput offline={offline || loading} cooling={cooling} onSend={onSend} />
        </div>

        <aside className="sidebar" aria-label="線上名單">
          <div className="sidebar__title">
            <UsersIcon />
            <span>在線 {countText} 人</span>
          </div>
          <OnlineList members={members} selfNickname={nickname} />
        </aside>
      </div>
    </div>
  )
}
