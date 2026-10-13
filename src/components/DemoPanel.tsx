import { useState } from 'react'
import type { DemoControls } from '../services/ChatService'

/** 展示開關:只在網址後面加 ?demo=1,而且通訊層是假的時候才會出現。階段二會連同假通訊層一起移除 */
export function DemoPanel({ controls }: { controls: DemoControls }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="demo">
      <button type="button" className="demo__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        展示開關
      </button>
      {open && (
        <div className="demo__panel">
          <button type="button" onClick={controls.disconnect}>
            模擬斷線
          </button>
          <button type="button" onClick={controls.reconnect}>
            恢復連線
          </button>
          <button type="button" onClick={controls.kick}>
            代號被別人拿走
          </button>
          <button type="button" onClick={controls.botSpeak}>
            讓機器人說一句
          </button>
        </div>
      )}
    </div>
  )
}
