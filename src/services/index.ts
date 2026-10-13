// 整個專案「決定通訊層是哪一個」的唯一地方。
// 階段二:把下面這一行換成 SupabaseChatService,其他程式不用動。

import type { ChatService } from './ChatService'
import { MockChatService } from './MockChatService'

export const chatService: ChatService = new MockChatService()
