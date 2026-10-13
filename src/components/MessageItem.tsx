import { formatTime } from '../lib/time'
import type { TimelineItem } from '../hooks/useChat'

interface Props {
  item: TimelineItem
  selfId: string
}

export function MessageItem({ item, selfId }: Props) {
  if (item.kind === 'notice') {
    return (
      <div className="system-notice">
        {item.nickname} {item.notice === 'join' ? '進來了' : '離開了'}
      </div>
    )
  }

  const { message } = item
  const mine = message.senderId === selfId
  return (
    <div className={mine ? 'msg msg--self' : 'msg'}>
      <div className="msg__meta">
        <span className="msg__name">{message.nickname}</span> · {formatTime(message.createdAt)}
      </div>
      {/* 內容一律當純文字顯示,不把它當成網頁解讀 */}
      <div className="msg__bubble">{message.body}</div>
    </div>
  )
}
