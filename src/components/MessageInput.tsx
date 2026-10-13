import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { SendResult } from '../hooks/useChat'
import { sendErrorText } from '../lib/messages'
import { BODY_MAX, charCount } from '../lib/text'
import { SendIcon } from './icons'

/** 剩多少字以內才開始顯示剩餘字數 */
const SHOW_REMAINING_AT = 50

interface Props {
  /** 連線中斷時整個輸入區停用 */
  offline: boolean
  /** 限速冷卻中 */
  cooling: boolean
  onSend: (text: string) => Promise<SendResult>
}

// 手機(觸控)的 Enter 是換行,要按送出按鈕;電腦的 Enter 直接送出
function enterSends(): boolean {
  return !window.matchMedia('(pointer: coarse)').matches
}

export function MessageInput({ offline, cooling, onSend }: Props) {
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const length = charCount(text)
  const remaining = BODY_MAX - length
  const tooLong = remaining < 0
  const blank = text.trim().length === 0
  const disabled = offline || cooling
  const canSend = !disabled && !blank && !tooLong

  // 輸入框隨內容長高,最高約 5 行
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  // 冷卻結束後,游標回到輸入框
  useEffect(() => {
    if (!cooling && !offline) areaRef.current?.focus({ preventScroll: true })
  }, [cooling, offline])

  const submit = async () => {
    if (!canSend) return
    const sending = text
    setText('')
    setSendError(null)
    areaRef.current?.focus()
    const result = await onSend(sending)
    if (!result.ok) {
      // 失敗:文字要留在輸入框,不能消失(使用者在這段時間已經打了新字的話,不覆蓋)
      setText((current) => (current === '' ? sending : current))
      if (result.code !== 'rate_limited') setSendError(sendErrorText(result.code))
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    // 中文輸入法選字時按 Enter 不能當成送出
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (!enterSends()) return
    event.preventDefault()
    void submit()
  }

  let hint: { text: string; kind: 'error' | 'muted' } | null = null
  if (cooling) hint = { text: sendErrorText('rate_limited'), kind: 'error' }
  else if (tooLong) hint = { text: `超過 ${-remaining} 字,無法送出`, kind: 'error' }
  else if (sendError) hint = { text: sendError, kind: 'error' }
  else if (remaining <= SHOW_REMAINING_AT) hint = { text: `還可輸入 ${remaining} 字`, kind: 'muted' }

  const failed = !!sendError && !cooling && !tooLong
  const areaClass = tooLong || failed ? 'composer__area composer__area--error' : 'composer__area'
  const placeholder = offline ? '連線恢復後才能送出' : cooling ? '請稍等一下再送出' : '輸入訊息…'

  return (
    <div className="composer">
      <div className="composer__inner">
        {hint && (
          <div
            className={hint.kind === 'error' ? 'composer__hint composer__hint--error' : 'composer__hint'}
            role={hint.kind === 'error' ? 'alert' : undefined}
          >
            {hint.text}
          </div>
        )}
        <div className="composer__row">
          <textarea
            ref={areaRef}
            className={areaClass}
            aria-label="訊息內容"
            placeholder={placeholder}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(event) => {
              setText(event.target.value)
              if (sendError) setSendError(null)
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="composer__send"
            aria-label="送出"
            disabled={!canSend}
            // 用 onMouseDown 擋掉預設行為,按送出時輸入框不會失去焦點(手機鍵盤才不會收起來)
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void submit()}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
