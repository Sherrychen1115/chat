// 代號和訊息的檢查與清理。
// 前端先做一次是為了讓使用者馬上得到回饋;階段二資料庫會再做同樣的檢查。

export const NICKNAME_MAX = 12
export const BODY_MAX = 500

// 不可見字元、控制字元、會讓排版方向反過來的字元。
// 代號:全部拿掉。
const NICKNAME_STRIP =
  /[\u0000-\u001F\u007F-\u009F­ᅟᅠ​-‏‪-‮⁠-⁤⁦-⁩ㅤ﻿]/g
// 訊息:保留換行(\n)和表情符號組合用的連接字元(‍)。
const BODY_STRIP =
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F­​‌‎‏‪-‮⁠-⁤⁦-⁩﻿]/g
// 各種長得像空白的字元,一律換成一般空白
const LOOKALIKE_SPACES = /[   -   　]/g

const RESERVED_NICKNAMES = ['系統', 'system']

/** 用「字」(不是 UTF-16 單位)算長度,表情符號算一個字 */
export function charCount(text: string): number {
  return Array.from(text).length
}

export function cleanNickname(raw: string): string {
  return raw
    .replace(LOOKALIKE_SPACES, ' ')
    .replace(NICKNAME_STRIP, '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** 比對代號是否相同時用,大小寫視為相同 */
export function nicknameKey(nickname: string): string {
  return nickname.toLowerCase()
}

export type NicknameCheck = { ok: true; value: string } | { ok: false }

export function validateNickname(raw: string): NicknameCheck {
  const value = cleanNickname(raw)
  const length = charCount(value)
  if (length < 1 || length > NICKNAME_MAX) return { ok: false }
  if (RESERVED_NICKNAMES.includes(nicknameKey(value))) return { ok: false }
  return { ok: true, value }
}

/** 送出前的清理:統一換行、拿掉控制字元、連續空行最多留一行、去掉前後空白 */
export function cleanBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(LOOKALIKE_SPACES, ' ')
    .replace(BODY_STRIP, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isBodyValid(cleaned: string): boolean {
  const length = charCount(cleaned)
  return length >= 1 && length <= BODY_MAX
}
