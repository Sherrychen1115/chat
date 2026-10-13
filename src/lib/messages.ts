// 錯誤代碼轉成使用者看得懂的中文。畫面不顯示技術訊息。

import type { ChatErrorCode } from '../services/ChatService'

export function nicknameErrorText(code: ChatErrorCode): string {
  switch (code) {
    case 'nickname_taken':
      return '這個代號已有人使用,請換一個'
    case 'nickname_invalid':
      return '代號要 1 到 12 個字,不能全是空白,也不能用「系統」'
    default:
      return '連線失敗,請檢查網路後再試一次'
  }
}

export function sendErrorText(code: ChatErrorCode): string {
  switch (code) {
    case 'body_invalid':
      return '訊息不能是空白,最多 500 字'
    case 'rate_limited':
      return '送太快了,請稍等'
    case 'network':
      return '送出失敗,網路不穩,請再試一次'
    default:
      return '送出失敗,請再試一次'
  }
}
