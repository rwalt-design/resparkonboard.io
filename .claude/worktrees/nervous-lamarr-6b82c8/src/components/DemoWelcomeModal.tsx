'use client'

import { useState } from 'react'

export function DemoWelcomeModal() {
  const [visible, setVisible] = useState(true)

  const dismiss = () => {
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#10131a',
        border: '1px solid #1e2330',
        borderRadius: 14,
        padding: '36px 40px',
        width: 520,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* Logo + heading */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-respark-light.svg" alt="ReSPARK" height={22} style={{ display: 'inline-block', marginBottom: 18 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px' }}>
            Welcome to the Demo
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
            This is a live sandbox loaded with two sample accounts.<br />
            Here&rsquo;s what to know before you explore.
          </p>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <Section icon="💬" title="Tooltips everywhere">
            Hover over column headers, status badges, stage names, and health labels throughout the app to see what they mean. Most data points in the dashboard and account views have contextual tooltips built in.
          </Section>

          <Section icon="✦" title="AI Suggestions">
            The <strong style={{ color: '#e2e8f0' }}>AI Suggestions</strong> tab (inside Action Items) analyzes your interaction history to surface action items and flag plan completions. In a live org it connects to Gmail, Slack, and OpenPhone to detect what needs to happen next — in the demo, sample interactions are pre-loaded so you can see exactly how the suggestions panel works.
          </Section>

          <Section icon="⚡" title="Connectors">
            In a live org, ReSPARK syncs with <strong style={{ color: '#e2e8f0' }}>Gmail, Google Calendar, Slack,</strong> and <strong style={{ color: '#e2e8f0' }}>Quo</strong> to automatically pull in email threads, call summaries, and messages tied to your accounts. Connector authentication is disabled in demo mode, but you can explore the UI in the Connectors section from the sidebar.
          </Section>

        </div>

        {/* CTA */}
        <button
          onClick={dismiss}
          style={{
            marginTop: 28,
            width: '100%',
            background: 'rgba(0,201,212,0.10)',
            border: '1px solid rgba(0,201,212,0.35)',
            borderRadius: 9,
            padding: '13px 20px',
            fontSize: 15,
            fontWeight: 700,
            color: '#5DDDE3',
            cursor: 'pointer',
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: '0.01em',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(0,201,212,0.18)'
            e.currentTarget.style.borderColor = 'rgba(0,201,212,0.55)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(0,201,212,0.10)'
            e.currentTarget.style.borderColor = 'rgba(0,201,212,0.35)'
          }}
        >
          Start exploring →
        </button>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 14, alignItems: 'flex-start',
      background: '#0d0f12',
      border: '1px solid #1e2330',
      borderRadius: 9,
      padding: '16px 18px',
    }}>
      <span style={{ fontSize: 20, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 5 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}
