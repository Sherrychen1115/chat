interface Props {
  members: string[]
  selfNickname: string
}

export function OnlineList({ members, selfNickname }: Props) {
  return (
    <ul className="online-list">
      {members.map((name) => {
        const isSelf = name === selfNickname
        return (
          <li key={name} className={isSelf ? 'online-list__item online-list__item--self' : 'online-list__item'}>
            <span className="dot" aria-hidden="true" />
            <span className="online-list__name">{name}</span>
            {isSelf && <span className="badge">你</span>}
          </li>
        )
      })}
    </ul>
  )
}
