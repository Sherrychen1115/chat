import type { ReactNode } from 'react'

function Icon({ size = 18, strokeWidth = 2, children }: { size?: number; strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const ChatIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
)

export const UsersIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
)

export const ChevronIcon = ({ up = false, size = 16 }: { up?: boolean; size?: number }) => (
  <Icon size={size}>
    <path d={up ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
  </Icon>
)

export const ArrowDownIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </Icon>
)

export const LogoutIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </Icon>
)

export const SendIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </Icon>
)

export const SpinnerIcon = ({ size = 16 }: { size?: number }) => (
  <span className="spin">
    <Icon size={size} strokeWidth={2.5}>
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </Icon>
  </span>
)

export const AlertIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Icon>
)
