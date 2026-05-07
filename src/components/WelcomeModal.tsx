'use client'

import { useEffect, useState } from 'react'

// Bump this key whenever you want everyone to see the modal again
const STORAGE_KEY = 'welcome-seen-v2'

export function WelcomeModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '32px 36px',
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100dvh - 32px)',
        overflowY: 'auto',
        fontFamily: 'var(--font-ui)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-h)', margin: '0 0 6px' }}>
            Welcome to ReSPARK Onboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
            A couple things before you dive in.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <Tip icon="🌗" title="Light &amp; dark mode">
            Use the <strong style={{ color: 'var(--text-h)' }}>☽ Dark / ☀ Light</strong> toggle in your user menu (top-right) to switch themes any time.
          </Tip>

          <Tip icon="💬" title="Tooltips">
            Hover over column headers, status badges, stage names, and health labels to see what they mean. Toggle them on or off from your user menu.
          </Tip>

        </div>

        <button
          onClick={dismiss}
          style={{
            marginTop: 20, width: '100%',
            background: 'var(--accent)',
            border: 'none', borderRadius: 9,
            padding: '12px 20px',
            fontSize: 14, fontWeight: 700,
            color: '#fff', cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          Got it →
        </button>
      </div>
    </div>
  )
}

function Tip({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 14, alignItems: 'flex-start',
      background: 'var(--bg-surface2)',
      border: '1px solid var(--border)',
      borderRadius: 9,
      padding: '14px 16px',
    }}>
      <span style={{ fontSize: 20, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}
