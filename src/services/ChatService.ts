// 通訊約定。畫面只依賴這個檔案,不知道資料是從哪裡來的。
// 階段一用過 MockChatService(假資料,已移除,看 git 歷史),階段二是 SupabaseChatService。
// 換通訊層時,新的通訊層都要遵守這份約定,畫面程式就不用改。

/** 歷史訊息的筆數 */
export const HISTORY_LIMIT = 50

export interface Message {
  /** 訊息編號,由後端給,越新越大 */
  id: number
  /** 發話者代號,由後端填入 */
  nickname: string
  /** 內容,純文字,1 到 500 字,可含換行 */
  body: string
  /** 送出時間(ISO 格式),由後端記錄 */
  createdAt: string
  /** 發話者的匿名編號,用來判斷是不是自己的訊息 */
  senderId: string
}

export type NoticeKind = 'join' | 'leave'

export interface Notice {
  id: string
  kind: NoticeKind
  nickname: string
}

/** connected 連線中、reconnecting 重連中、kicked 代號已被別人拿走(要重新輸入) */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'kicked'

export type ChatErrorCode =
  | 'nickname_taken'
  | 'nickname_invalid'
  | 'rate_limited'
  | 'body_invalid'
  | 'not_member'
  | 'network'

export class ChatError extends Error {
  readonly code: ChatErrorCode
  constructor(code: ChatErrorCode) {
    super(code)
    this.name = 'ChatError'
    this.code = code
  }
}

/** 通訊層會通知畫面的事件 */
export interface ChatEvents {
  /** 有新訊息(包含自己送的) */
  message: Message
  /** 線上名單變了(代號清單,包含自己) */
  members: string[]
  /** 有人進入或離開(已經過寬限時間判斷) */
  notice: Notice
  /** 連線狀態變了 */
  connection: ConnectionStatus
}

export interface ChatService {
  /** 這個瀏覽器的匿名編號 */
  readonly selfId: string
  /** 登記代號並進入聊天室。失敗時丟出 ChatError */
  join(nickname: string): Promise<void>
  /** 離開,釋放代號 */
  leave(): Promise<void>
  /** 送出一則訊息。失敗時丟出 ChatError。新訊息會透過 message 事件回來 */
  sendMessage(body: string): Promise<void>
  /** 取得最近的歷史訊息(由舊到新) */
  loadRecent(limit: number): Promise<Message[]>
  /** 斷線重連後補抓漏掉的訊息(編號比 afterId 大的,由舊到新) */
  loadSince(afterId: number): Promise<Message[]>
  /** 訂閱事件,回傳取消訂閱的函式 */
  on<K extends keyof ChatEvents>(
    event: K,
    handler: (payload: ChatEvents[K]) => void,
  ): () => void
}
