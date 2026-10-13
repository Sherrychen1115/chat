// 階段一用的假通訊層:資料都在記憶體裡,用幾個機器人假裝有人在聊天。
// 階段二會用 SupabaseChatService 取代它,畫面程式不用改。

import { RateLimiter } from '../lib/rateLimit'
import { cleanBody, isBodyValid, nicknameKey, validateNickname } from '../lib/text'
import {
  ChatError,
  type ChatEvents,
  type ChatService,
  type DemoControls,
  type Message,
} from './ChatService'

const BOTS = ['小明', '小美', '大雄', '靜香', '阿花']
const INITIAL_ONLINE = ['小明', '小美', '大雄', '靜香']

const LINES = [
  '有人在嗎?',
  '剛下課,好累',
  '今天好冷',
  '晚上要不要一起吃飯?\n我想吃火鍋',
  '六點半可以嗎',
  '我先去訂位',
  '哈哈哈哈',
  '這間 https://example.com/menu/hotpot/2026-spring/list',
  '真的假的',
  '等我一下',
  '下週有人要去嗎',
  '剛剛那個太好笑了',
  '我也這麼覺得',
  '先吃飯,晚點再聊',
  '好啊',
  '加一',
]

type Handlers = { [K in keyof ChatEvents]: Set<(payload: ChatEvents[K]) => void> }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

function loadSelfId(): string {
  const key = 'chat.selfId'
  try {
    const saved = localStorage.getItem(key)
    if (saved) return saved
    const created = crypto.randomUUID()
    localStorage.setItem(key, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

export class MockChatService implements ChatService {
  readonly selfId = loadSelfId()

  private handlers: Handlers = {
    message: new Set(),
    members: new Set(),
    notice: new Set(),
    connection: new Set(),
  }
  private nickname: string | null = null
  private online = new Set(INITIAL_ONLINE)
  private messages: Message[] = []
  private nextId = 1
  private noticeSeq = 0
  private connected = true
  private botTimer: ReturnType<typeof setTimeout> | undefined
  private limiter = new RateLimiter()

  constructor() {
    // 先放一批歷史訊息,時間往前推,讓畫面一進來就有東西可以捲
    const count = 16
    const start = Date.now() - count * 2.5 * 60_000
    for (let i = 0; i < count; i++) {
      const sender = pick(INITIAL_ONLINE)
      this.messages.push(this.makeMessage(sender, pick(LINES), start + i * 2.5 * 60_000))
    }
  }

  readonly demo: DemoControls = {
    disconnect: () => {
      if (!this.nickname || !this.connected) return
      this.connected = false
      this.emit('connection', 'reconnecting')
    },
    reconnect: () => {
      if (!this.nickname || this.connected) return
      this.connected = true
      this.emit('connection', 'connected')
      this.emit('members', this.memberList())
    },
    kick: () => {
      if (!this.nickname) return
      this.nickname = null
      this.stopBots()
      this.connected = true
      this.emit('connection', 'kicked')
    },
    botSpeak: () => this.botSpeak(),
  }

  on<K extends keyof ChatEvents>(event: K, handler: (payload: ChatEvents[K]) => void): () => void {
    const set = this.handlers[event] as Set<(payload: ChatEvents[K]) => void>
    set.add(handler)
    return () => {
      set.delete(handler)
    }
  }

  async join(raw: string): Promise<void> {
    await delay(300)
    const checked = validateNickname(raw)
    if (!checked.ok) throw new ChatError('nickname_invalid')
    if (!this.connected) throw new ChatError('network')
    // 機器人的代號一律視為已被使用(大小寫視為相同)
    if (BOTS.some((bot) => nicknameKey(bot) === nicknameKey(checked.value))) {
      throw new ChatError('nickname_taken')
    }
    this.nickname = checked.value
    this.emit('connection', 'connected')
    this.emit('members', this.memberList())
    this.startBots()
  }

  async leave(): Promise<void> {
    this.nickname = null
    this.stopBots()
    this.connected = true
  }

  async sendMessage(body: string): Promise<void> {
    await delay(150)
    if (!this.connected) throw new ChatError('network')
    if (!this.nickname) throw new ChatError('not_member')
    const cleaned = cleanBody(body)
    if (!isBodyValid(cleaned)) throw new ChatError('body_invalid')
    if (this.limiter.waitMs() > 0) throw new ChatError('rate_limited')
    this.limiter.record()
    const message = this.makeMessage(this.nickname, cleaned, Date.now(), this.selfId)
    this.messages.push(message)
    this.emit('message', message)
  }

  async loadRecent(limit: number): Promise<Message[]> {
    await delay(500)
    if (!this.connected) throw new ChatError('network')
    return this.messages.slice(-limit)
  }

  async loadSince(afterId: number): Promise<Message[]> {
    await delay(200)
    if (!this.connected) throw new ChatError('network')
    return this.messages.filter((m) => m.id > afterId)
  }

  // ---- 內部 ----

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    for (const handler of this.handlers[event]) handler(payload)
  }

  private makeMessage(nickname: string, body: string, at: number, senderId?: string): Message {
    return {
      id: this.nextId++,
      nickname,
      body,
      createdAt: new Date(at).toISOString(),
      senderId: senderId ?? `bot:${nickname}`,
    }
  }

  private memberList(): string[] {
    const list = [...this.online]
    if (this.nickname) list.push(this.nickname)
    return list.sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }

  private startBots(): void {
    this.stopBots()
    const tick = () => {
      if (Math.random() < 0.15) this.botPresenceChange()
      else this.botSpeak()
      this.botTimer = setTimeout(tick, 4000 + Math.random() * 5000)
    }
    this.botTimer = setTimeout(tick, 3000)
  }

  private stopBots(): void {
    clearTimeout(this.botTimer)
    this.botTimer = undefined
  }

  private botSpeak(): void {
    if (this.online.size === 0) return
    const message = this.makeMessage(pick([...this.online]), pick(LINES), Date.now())
    this.messages.push(message)
    // 斷線期間照樣累積訊息,但不通知畫面,重連後由 loadSince 補回來
    if (this.connected && this.nickname) this.emit('message', message)
  }

  private botPresenceChange(): void {
    const bot = pick(BOTS)
    const isOnline = this.online.has(bot)
    if (isOnline && this.online.size <= 2) return
    if (isOnline) this.online.delete(bot)
    else this.online.add(bot)
    if (!this.connected || !this.nickname) return
    this.emit('notice', {
      id: `notice-${this.noticeSeq++}`,
      kind: isOnline ? 'leave' : 'join',
      nickname: bot,
    })
    this.emit('members', this.memberList())
  }
}
