'use client'

import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'onboard_tooltips'

export function getTooltipsEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(STORAGE_KEY) !== 'false'
}

export function setTooltipsEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
  window.dispatchEvent(new CustomEvent('tooltips-changed', { detail: enabled }))
}

export function useTooltipsEnabled() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    setEnabled(getTooltipsEnabled())
    const handler = (e: Event) => setEnabled((e as CustomEvent<boolean>).detail)
    window.addEventListener('tooltips-changed', handler)
    return () => window.removeEventListener('tooltips-changed', handler)
  }, [])
  return enabled
}

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: string
  children: React.ReactNode
  placement?: Placement
  delay?: number
}

export function Tooltip({ content, children, placement = 'top', delay = 400 }: TooltipProps) {
  const enabled = useTooltipsEnabled()
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      let top = 0, left = 0
      const gap = 6
      if (placement === 'top') {
        top = rect.top - gap
        left = rect.left + rect.width / 2
      } else if (placement === 'bottom') {
        top = rect.bottom + gap
        left = rect.left + rect.width / 2
      } else if (placement === 'left') {
        top = rect.top + rect.height / 2
        left = rect.left - gap
      } else {
        top = rect.top + rect.height / 2
        left = rect.right + gap
      }
      setCoords({ top, left })
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  if (!enabled) return <>{children}</>

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    width: 0, height: 0,
    border: '4px solid transparent',
    ...(placement === 'top'    ? { top: '100%',  left: '50%', transform: 'translateX(-50%)', borderTopColor:    'var(--bg-surface3)' } : {}),
    ...(placement === 'bottom' ? { bottom: '100%',left: '50%', transform: 'translateX(-50%)', borderBottomColor: 'var(--bg-surface3)' } : {}),
    ...(placement === 'left'   ? { left: '100%',  top: '50%',  transform: 'translateY(-50%)', borderLeftColor:   'var(--bg-surface3)' } : {}),
    ...(placement === 'right'  ? { right: '100%', top: '50%',  transform: 'translateY(-50%)', borderRightColor:  'var(--bg-surface3)' } : {}),
  }

  const boxStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 99999,
    pointerEvents: 'none',
    background: 'var(--bg-surface3)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '5px 9px',
    fontSize: 11,
    fontFamily: 'var(--font-ui)',
    lineHeight: 1.4,
    whiteSpace: 'normal' as React.CSSProperties['whiteSpace'],
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    maxWidth: 240,
    ...(coords ? {
      ...(placement === 'top'    ? { bottom: `calc(100vh - ${coords.top}px)`, left: coords.left, transform: 'translateX(-50%)' } : {}),
      ...(placement === 'bottom' ? { top: coords.top, left: coords.left, transform: 'translateX(-50%)' } : {}),
      ...(placement === 'left'   ? { top: coords.top, right: `calc(100vw - ${coords.left}px)`, transform: 'translateY(-50%)' } : {}),
      ...(placement === 'right'  ? { top: coords.top, left: coords.left, transform: 'translateY(-50%)' } : {}),
    } : { opacity: 0 }),
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'contents' }}
      >
        {children}
      </span>
      {visible && coords && (
        <span style={boxStyle}>
          {content}
          <span style={arrowStyle} />
        </span>
      )}
    </>
  )
}
