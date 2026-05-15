'use client'
import { useEffect, useRef, useState } from 'react'
import { CHANGELOG, type ChangelogEntry } from '@/data/changelog'

const LS_KEY = 'changelog_last_seen'

function getLastSeen(): string {
  if (typeof window === 'undefined') return CHANGELOG[0]?.date ?? '1970-01-01'
  return localStorage.getItem(LS_KEY) ?? '1970-01-01'
}

function markSeen() {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, CHANGELOG[0]?.date ?? new Date().toISOString().slice(0, 10))
}

export function WhatsNewButton() {
  const [open, setOpen] = useState(false)
  const [hasUnseen, setHasUnseen] = useState(false)
  const [entries] = useState<ChangelogEntry[]>(CHANGELOG)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const lastSeen = getLastSeen()
    setHasUnseen(CHANGELOG.some(e => e.date > lastSeen))
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = () => {
    if (!open && hasUnseen) {
      markSeen()
      setHasUnseen(false)
    }
    setOpen(v => !v)
  }

  return (
    <div ref={ref} className="hide-mobile" style={{ position: 'relative', marginRight: 8 }}>
      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: open ? 'var(--border)' : 'none',
          border: '1px solid ' + (open ? 'var(--border-b)' : 'var(--border)'),
          borderRadius: 7, padding: '3px 10px', cursor: 'pointer',
          fontFamily: 'var(--font-ui)', position: 'relative',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border-b)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>What&apos;s New</span>
        {hasUnseen && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#1BB3BB', flexShrink: 0,
            boxShadow: '0 0 0 2px var(--bg-surface)',
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, width: 360, zIndex: 300,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px 10px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 15 }}>🚀</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)', fontFamily: 'var(--font-ui)' }}>
                What&apos;s New
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-ui)' }}>
                Latest updates to Respark Onboard
              </div>
            </div>
          </div>

          {/* Entries */}
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {entries.map(entry => (
              <div key={entry.date}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: '#5DDDE3', background: '#1BB3BB18',
                    border: '1px solid #1BB3BB30', borderRadius: 4,
                    padding: '1px 6px', letterSpacing: '0.04em', flexShrink: 0,
                  }}>
                    {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', fontFamily: 'var(--font-ui)' }}>
                    {entry.title}
                  </span>
                </div>
                <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {entry.bullets.map((b, i) => (
                    <li key={i} style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, fontFamily: 'var(--font-ui)' }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
