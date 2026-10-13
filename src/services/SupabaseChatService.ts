// 階段二:真的通訊層,接 Supabase。
// 遵守 ChatService.ts 的約定,所以畫面程式不需要知道資料是從哪裡來的。
//
// 用到的 Supabase 功能(對應 docs/architecture.md 第 3.2 節):
// - 匿名登入:給這個瀏覽器一個身分編號
// - 資料庫函式(rpc):claim_nickname、touch_nickname、release_nickname、send_message
// - Realtime 的資料庫變動通知:訊息表有新增就推過來
// - Realtime 的 Presence:誰在線上
// - Realtime 的 Broadcast:主動離開時的「bye」通知

import {
  createClient,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
  type SupabaseClient,
} from '@supabase/supabase-js'
import { BODY_MAX, NICKNAME_MAX, charCount, nicknameKey, validateNickname } from '../lib/text'
import {
  ChatError,
  type ChatErrorCode,
  type ChatEvents,
  type ChatService,
  type ConnectionStatus,
  type Message,
  type NoticeKind,
} from './ChatService'

const CHANNEL_NAME = 'chat-room'
/** 每 30 秒向資料庫報到一次,保住代號 */
const HEARTBEAT_MS = 30_000
/** 有人從在線名單消失後,等多久才顯示「離開了」(短暫斷線、重新整理不算離開) */
const LEAVE_GRACE_MS = 15_000
/** 訂閱頻道最多等多久 */
const SUBSCRIBE_TIMEOUT_MS = 8_000
/** 頁面在背景超過這麼久,回到前景時重新連線並補抓訊息 */
const RESUME_AFTER_MS = 15_000
/** 收到「bye」後,這段時間內忽略名單上還沒消失的同一個人 */
const BYE_IGNORE_MS = 10_000

const ERROR_CODES: ChatErrorCode[] = [
  'nickname_taken',
  'nickname_invalid',
  'rate_limited',
  'body_invalid',
  'not_member',
  'network',
]

interface MessageRow {
  id: number
  nickname: string
  body: string
  created_at: string
  user_id: string
}

type Handlers = { [K in keyof ChatEvents]: Set<(payload: ChatEvents[K]) => void> }

/**
 * 把資料庫的一列轉成畫面用的訊息。
 * 收到的資料不一定可信(別人可以繞過網頁直接送),所以先檢查型別和長度,不合格回傳 null,由呼叫的地方丟掉。
 */
function toMessage(row: unknown): Message | null {
  if (typeof row !== 'object' || row === null) return null
  const { id, nickname, body, created_at, user_id } = row as Record<string, unknown>

  // 編號可能是數字,也可能是數字字串(bigint),一律轉成數字再檢查
  const numericId = typeof id === 'number' || typeof id === 'string' ? Number(id) : NaN
  if (!Number.isSafeInteger(numericId) || numericId <= 0) return null

  if (typeof nickname !== 'string' || typeof body !== 'string') return null
  const nicknameLength = charCount(nickname)
  if (nicknameLength < 1 || nicknameLength > NICKNAME_MAX) return null
  const bodyLength = charCount(body)
  if (bodyLength < 1 || bodyLength > BODY_MAX) return null

  if (typeof created_at !== 'string' || Number.isNaN(Date.parse(created_at))) return null
  if (typeof user_id !== 'string' || user_id === '') return null

  return { id: numericId, nickname, body, createdAt: created_at, senderId: user_id }
}

/** 一次轉換多列,不合格的丟掉 */
function toMessages(rows: unknown): Message[] {
  if (!Array.isArray(rows)) return []
  return rows.map(toMessage).filter((message): message is Message => message !== null)
}

/** 資料庫函式丟出的錯誤,訊息就是錯誤代碼;其他一律當成網路問題 */
function toChatError(error: { message?: string } | null): ChatError {
  const hit = ERROR_CODES.find((code) => code === error?.message)
  return new ChatError(hit ?? 'network')
}

export class SupabaseChatService implements ChatService {
  private readonly client: SupabaseClient
  private userId: string | null = null
  private nickname: string | null = null
  private channel: RealtimeChannel | null = null
  private status: ConnectionStatus = 'connected'
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private hiddenAt: number | null = null
  private noticeSeq = 0

  // 線上名單:confirmed 是畫面上看到的;pendingLeave 是「消失了但還在寬限時間內」的人
  private confirmed = new Map<string, string>()
  private pendingLeave = new Map<string, ReturnType<typeof setTimeout>>()
  private departed = new Map<string, number>()
  private firstSync = true

  private handlers: Handlers = {
    message: new Set(),
    members: new Set(),
    notice: new Set(),
    connection: new Set(),
  }

  constructor(url: string, publishableKey: string) {
    this.client = createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }

  get selfId(): string {
    return this.userId ?? ''
  }

  on<K extends keyof ChatEvents>(event: K, handler: (payload: ChatEvents[K]) => void): () => void {
    const set = this.handlers[event] as Set<(payload: ChatEvents[K]) => void>
    set.add(handler)
    return () => {
      set.delete(handler)
    }
  }

  // ---------- 動作 ----------

  async join(raw: string): Promise<void> {
    const checked = validateNickname(raw)
    if (!checked.ok) throw new ChatError('nickname_invalid')

    // 重複進入時,先收掉上一次的東西
    await this.teardown()

    await this.ensureSession()
    const { data, error } = await this.rpc('claim_nickname', { p_nickname: checked.value })
    if (error) throw toChatError(error)

    this.nickname = typeof data === 'string' ? data : checked.value
    this.firstSync = true
    this.confirmed.set(nicknameKey(this.nickname), this.nickname)
    this.status = 'connected'
    this.startHeartbeat()
    document.addEventListener('visibilitychange', this.onVisibility)
    this.emit('members', this.memberList())

    await this.openChannel()
  }

  async leave(): Promise<void> {
    const channel = this.channel
    const name = this.nickname
    if (channel && name && channel.state === 'joined') {
      try {
        // 先通知大家「我主動離開了」,他們就不用等 15 秒寬限時間
        await channel.send({ type: 'broadcast', event: 'bye', payload: { nickname: name } })
      } catch {
        // 送不出去也沒關係,別人會在寬限時間後看到我離開
      }
    }
    await this.teardown()
    try {
      await this.rpc('release_nickname')
    } catch {
      // 釋放失敗的話,3 分鐘後代號也會自動釋放
    }
  }

  async sendMessage(body: string): Promise<void> {
    const { error } = await this.rpc('send_message', { p_body: body })
    if (error) throw toChatError(error)
  }

  async loadRecent(limit: number): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('id, nickname, body, created_at, user_id')
      .order('id', { ascending: false })
      .limit(limit)
    if (error) throw new ChatError('network')
    return toMessages(data).reverse()
  }

  async loadSince(afterId: number): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('id, nickname, body, created_at, user_id')
      .gt('id', afterId)
      .order('id', { ascending: true })
      .limit(200)
    if (error) throw new ChatError('network')
    return toMessages(data)
  }

  // ---------- 登入 ----------

  /** 確保有匿名身分。第一次來會建立,之後從瀏覽器取回 */
  private async ensureSession(): Promise<void> {
    try {
      const { data } = await this.client.auth.getSession()
      let session = data.session
      if (!session) {
        const result = await this.client.auth.signInAnonymously()
        if (result.error || !result.data.session) throw new ChatError('network')
        session = result.data.session
      }
      this.userId = session.user.id
      await this.client.realtime.setAuth(session.access_token)
    } catch (error) {
      if (error instanceof ChatError) throw error
      throw new ChatError('network')
    }
  }

  /** 呼叫資料庫函式。身分失效(例如後台把使用者刪了)時,重新匿名登入再試一次 */
  private async rpc(fn: string, args?: Record<string, unknown>) {
    let result = await this.client.rpc(fn, args)
    if (result.error && (result.status === 401 || /JWT/i.test(result.error.message))) {
      await this.client.auth.signOut()
      await this.ensureSession()
      result = await this.client.rpc(fn, args)
    }
    return result
  }

  // ---------- 即時連線 ----------

  private async openChannel(): Promise<void> {
    await this.closeChannel()
    if (!this.userId || !this.nickname) return

    const channel = this.client.channel(CHANNEL_NAME, {
      config: { presence: { key: this.userId }, broadcast: { self: false } },
    })
    channel.on('presence', { event: 'sync' }, () => this.onPresenceSync(channel))
    channel.on('broadcast', { event: 'bye' }, ({ payload }) => this.onBye(payload?.nickname))
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload: RealtimePostgresChangesPayload<MessageRow>) => {
        const message = toMessage(payload.new)
        if (message) this.emit('message', message)
      },
    )
    this.channel = channel

    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      const timer = setTimeout(() => {
        this.setConnection('reconnecting')
        done()
      }, SUBSCRIBE_TIMEOUT_MS)

      channel.subscribe((status) => {
        if (this.channel !== channel) return
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          void channel.track({ nickname: this.nickname })
          void this.onSubscribed().then(done)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // 連線斷了。supabase-js 會自己重連,成功時會再收到 SUBSCRIBED
          this.setConnection('reconnecting')
        }
      })
    })
  }

  private async closeChannel(): Promise<void> {
    const channel = this.channel
    this.channel = null
    if (!channel) return
    try {
      await this.client.removeChannel(channel)
    } catch {
      // 已經斷了就算了
    }
  }

  /** 頻道連上了。如果是斷線後重連,要先確認代號還是自己的 */
  private async onSubscribed(): Promise<void> {
    if (this.status !== 'reconnecting') {
      this.setConnection('connected')
      return
    }
    const result = await this.reclaim()
    if (result === 'taken') this.kick()
    else if (result === 'ok') this.setConnection('connected')
    // 'network':資料庫暫時連不上,維持「連線中」,下一次心跳會再試
  }

  /** 重新登記同一個代號(同一個身分重複登記等於報到) */
  private async reclaim(): Promise<'ok' | 'taken' | 'network'> {
    if (!this.nickname) return 'network'
    try {
      const { error } = await this.rpc('claim_nickname', { p_nickname: this.nickname })
      if (!error) return 'ok'
      return error.message === 'nickname_taken' ? 'taken' : 'network'
    } catch {
      return 'network'
    }
  }

  /** 代號被別人拿走了,通知畫面回到輸入代號 */
  private kick(): void {
    void this.teardown()
    this.emit('connection', 'kicked')
  }

  private setConnection(status: ConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit('connection', status)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      void this.beat()
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }

  private async beat(): Promise<void> {
    if (!this.nickname) return
    try {
      const { error } = await this.rpc('touch_nickname')
      if (error?.message === 'not_member') {
        // 登記過期了:試著重新登記,如果代號已經被別人拿走就回到輸入代號
        if ((await this.reclaim()) === 'taken') this.kick()
      }
    } catch {
      // 網路暫時不通,下一次再試
    }
  }

  /** 手機切到別的 app 再回來:離開太久的話,重新連線並補抓漏掉的訊息 */
  private onVisibility = (): void => {
    if (document.hidden) {
      this.hiddenAt = Date.now()
      return
    }
    const away = this.hiddenAt === null ? 0 : Date.now() - this.hiddenAt
    this.hiddenAt = null
    if (!this.nickname) return
    if (away > RESUME_AFTER_MS || this.channel?.state !== 'joined') {
      this.setConnection('reconnecting')
      void this.openChannel()
    }
  }

  // ---------- 線上名單與進出提示 ----------

  private onPresenceSync(channel: RealtimeChannel): void {
    if (this.channel !== channel || !this.nickname) return
    const selfKey = nicknameKey(this.nickname)
    const now = Date.now()

    // 目前在線上的人(同一個人開多個分頁只算一個)
    const raw = new Map<string, string>()
    for (const metas of Object.values(channel.presenceState<{ nickname?: string }>())) {
      for (const meta of metas) {
        if (meta.nickname) raw.set(nicknameKey(meta.nickname), meta.nickname)
      }
    }
    for (const [key, until] of this.departed) {
      if (until <= now || !raw.has(key)) this.departed.delete(key)
    }
    const present = new Map<string, string>()
    for (const [key, name] of raw) {
      if (!this.departed.has(key)) present.set(key, name)
    }

    let changed = false
    for (const [key, name] of present) {
      // 寬限時間內回來了:當作沒離開,什麼提示都不用顯示
      const timer = this.pendingLeave.get(key)
      if (timer) {
        clearTimeout(timer)
        this.pendingLeave.delete(key)
      }
      if (!this.confirmed.has(key)) {
        this.confirmed.set(key, name)
        changed = true
        if (!this.firstSync && key !== selfKey) this.emitNotice('join', name)
      }
    }
    for (const key of this.confirmed.keys()) {
      if (key === selfKey || present.has(key) || this.pendingLeave.has(key)) continue
      this.pendingLeave.set(
        key,
        setTimeout(() => this.finalizeLeave(key), LEAVE_GRACE_MS),
      )
    }
    this.firstSync = false
    if (changed) this.emit('members', this.memberList())
  }

  private finalizeLeave(key: string): void {
    this.pendingLeave.delete(key)
    const name = this.confirmed.get(key)
    if (!name) return
    this.confirmed.delete(key)
    this.emitNotice('leave', name)
    this.emit('members', this.memberList())
  }

  /** 有人主動離開:不用等寬限時間,立刻顯示 */
  private onBye(rawName: unknown): void {
    if (typeof rawName !== 'string' || !this.nickname) return
    const key = nicknameKey(rawName)
    if (key === nicknameKey(this.nickname)) return
    const timer = this.pendingLeave.get(key)
    if (timer) {
      clearTimeout(timer)
      this.pendingLeave.delete(key)
    }
    this.departed.set(key, Date.now() + BYE_IGNORE_MS)
    const name = this.confirmed.get(key)
    if (!name) return
    this.confirmed.delete(key)
    this.emitNotice('leave', name)
    this.emit('members', this.memberList())
  }

  private memberList(): string[] {
    return [...this.confirmed.values()].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }

  private emitNotice(kind: NoticeKind, nickname: string): void {
    this.emit('notice', { id: `notice-${this.noticeSeq++}`, kind, nickname })
  }

  // ---------- 收尾 ----------

  /** 停掉所有計時器和連線,清空狀態(不會通知資料庫,釋放代號由 leave 負責) */
  private async teardown(): Promise<void> {
    this.stopHeartbeat()
    document.removeEventListener('visibilitychange', this.onVisibility)
    for (const timer of this.pendingLeave.values()) clearTimeout(timer)
    this.pendingLeave.clear()
    this.departed.clear()
    this.confirmed.clear()
    this.nickname = null
    this.status = 'connected'
    await this.closeChannel()
  }

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    for (const handler of this.handlers[event]) handler(payload)
  }
}
