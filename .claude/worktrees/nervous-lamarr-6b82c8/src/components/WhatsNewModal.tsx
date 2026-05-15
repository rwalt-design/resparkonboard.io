'use client'
import { useEffect, useState } from 'react'
import { CHANGELOG, type ChangelogEntry } from '@/data/changelog'

const LS_KEY = 'changelog_last_seen'

function getNewEntries(): ChangelogEntry[] {
  if (typeof window === 'undefined') return []
  const lastSeen = localStorage.getItem(LS_KEY) ?? '1970-01-01'
  return CHANGELOG.filter(e => e.date > lastSeen)
}

function markSeen() {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, CHANGELOG[0]?.date ?? new Date().toISOString().slice(0, 10))
}

export function WhatsNewModal() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([])

  useEffect(() => {
    const newEntries = getNewEntries()
    if (newEntries.length > 0) setEntries(newEntries)
  }, [])

  if (entries.length === 0) return null

  const dismiss = () => {
    markSeen()
    setEntries([])
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 480,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 22px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🚀</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)', fontFamily: 'var(--font-ui)' }}>
              What&apos;s New
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
              Latest updates to Respark Onboard
            </div>
          </div>
          <button
            onClick={dismiss}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Entries */}
        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '60vh', overflowY: 'auto' }}>
          {entries.map(entry => (
            <div key={entry.date}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: '#5DDDE3', background: '#1BB3BB18',
                  border: '1px solid #1BB3BB30', borderRadius: 4,
                  padding: '1px 6px', letterSpacing: '0.04em',
                }}>
                  {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', fontFamily: 'var(--font-ui)' }}>
                  {entry.title}
                </span>
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entry.bullets.map((b, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, fontFamily: 'var(--font-ui)' }}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={dismiss}
            style={{
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 7, padding: '7px 20px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
