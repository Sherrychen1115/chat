import { useState, type FormEvent } from 'react'
import { nicknameErrorText } from '../lib/messages'
import { NICKNAME_MAX, charCount, validateNickname } from '../lib/text'
import type { ChatErrorCode } from '../services/ChatService'
import { AlertIcon, ChatIcon, SpinnerIcon } from './icons'

interface Props {
  initialValue?: string
  joining: boolean
  error: ChatErrorCode | null
  /** 重連後發現代號已被別人拿走 */
  kickedNotice: boolean
  onSubmit: (raw: string) => void
  /** 使用者開始修改輸入框時,通知上層清掉錯誤提示 */
  onEdit: () => void
}

export function NicknameScreen({ initialValue = '', joining, error, kickedNotice, onSubmit, onEdit }: Props) {
  const [value, setValue] = useState(initialValue)
  const canSubmit = validateNickname(value).ok && !joining

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit) onSubmit(value)
  }

  return (
    <main className="nick">
      <div className="nick__intro">
        <div className="nick__logo">
          <ChatIcon size={28} />
        </div>
        <h1 className="nick__title">匿名聊天室</h1>
        <p className="nick__lead">不用註冊,輸入一個代號就能加入。所有人都在同一個聊天室裡。</p>
      </div>

      {kickedNotice && (
        <div className="notice-box" role="status">
          <AlertIcon />
          <span>你的代號已被別人使用,請重新輸入</span>
        </div>
      )}

      <form className="nick__form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="nickname" className="field__label">
            你的代號
          </label>
          <input
            id="nickname"
            className={error ? 'input input--error' : 'input'}
            type="text"
            value={value}
            placeholder="例如:小明"
            maxLength={NICKNAME_MAX}
            autoComplete="off"
            autoCapitalize="off"
            autoFocus
            disabled={joining}
            aria-invalid={error ? true : undefined}
            aria-describedby="nickname-help"
            onChange={(event) => {
              setValue(event.target.value)
              onEdit()
            }}
          />
          <div className="field__help" id="nickname-help">
            {error ? (
              <span className="field__error" role="alert">
                {nicknameErrorText(error)}
              </span>
            ) : (
              <span>1 到 12 個字,中英文數字都可以</span>
            )}
            <span>
              {charCount(value)}/{NICKNAME_MAX}
            </span>
          </div>
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={!canSubmit}>
          {joining ? (
            <>
              <SpinnerIcon size={18} />
              <span>進入中…</span>
            </>
          ) : (
            '進入聊天室'
          )}
        </button>
      </form>
    </main>
  )
}
