import { ChatScreen } from './components/ChatScreen'
import { NicknameScreen } from './components/NicknameScreen'
import { AlertIcon } from './components/icons'
import { useChat } from './hooks/useChat'
import { useUnreadTitle } from './hooks/useUnreadTitle'
import type { ChatService } from './services/ChatService'
import { chatService, configProblem } from './services'

function ChatApp({ service }: { service: ChatService }) {
  const chat = useChat(service)
  useUnreadTitle(chat.unread, chat.clearUnread)

  return chat.phase === 'nickname' ? (
    <NicknameScreen
      joining={chat.joining}
      error={chat.nicknameError}
      kickedNotice={chat.kickedNotice}
      onSubmit={(raw) => void chat.enter(raw)}
      onEdit={chat.clearNicknameError}
    />
  ) : (
    <ChatScreen
      nickname={chat.nickname}
      selfId={chat.selfId}
      items={chat.items}
      members={chat.members}
      connection={chat.connection}
      loading={chat.joining || chat.loadingHistory}
      cooling={chat.cooling}
      onSend={chat.send}
      onLeave={() => void chat.leave()}
    />
  )
}

export default function App() {
  if (!chatService) {
    return (
      <main className="nick">
        <div className="notice-box" role="alert">
          <AlertIcon />
          <span>聊天室暫時無法使用:{configProblem}</span>
        </div>
      </main>
    )
  }
  return <ChatApp service={chatService} />
}
