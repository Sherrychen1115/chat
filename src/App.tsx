import { ChatScreen } from './components/ChatScreen'
import { DemoPanel } from './components/DemoPanel'
import { NicknameScreen } from './components/NicknameScreen'
import { useChat } from './hooks/useChat'
import { useUnreadTitle } from './hooks/useUnreadTitle'
import { chatService } from './services'

const showDemo = new URLSearchParams(window.location.search).has('demo')

export default function App() {
  const chat = useChat(chatService)
  useUnreadTitle(chat.unread, chat.clearUnread)

  return (
    <>
      {chat.phase === 'nickname' ? (
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
      )}
      {showDemo && chatService.demo && <DemoPanel controls={chatService.demo} />}
    </>
  )
}
