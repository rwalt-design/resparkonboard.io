'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const router = useRouter()
  const [demoLoading, setDemoLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'respark.com' },
      },
    })
  }

  const handleDemo = async () => {
    setDemoLoading(true)
    try {
      const supabase = createClient()
      const { data, error: signInError } = await supabase.auth.signInAnonymously()
      if (signInError) throw signInError

      // Pass access token directly — cookies may not be set yet when the fetch fires
      const token = data.session?.access_token
      await fetch('/api/demo/setup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      router.push('/')
      router.refresh()
    } catch (e) {
      console.error('Demo error:', e)
      setDemoLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0f12',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        background: '#10131a',
        border: '1px solid #1e2330',
        borderRadius: 12,
        padding: '40px 44px',
        width: 380,
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          {/* Login is always dark — always use logoLight (white wordmark) */}
          <img src="/logo-respark-light.svg" alt="ReSpark" height={28} style={{ display: 'block', width: 'auto' }} />
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
          Sign in
        </h1>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 28 }}>
          Use your @respark.com account
        </p>

        {error === 'domain' && (
          <div style={{
            background: '#7f1d1d22', border: '1px solid #7f1d1d66',
            borderRadius: 7, padding: '10px 14px', marginBottom: 20,
            fontSize: 12, color: '#fca5a5',
          }}>
            Access restricted to @respark.com accounts.
          </div>
        )}
        {error === 'auth' && (
          <div style={{
            background: '#7f1d1d22', border: '1px solid #7f1d1d66',
            borderRadius: 7, padding: '10px 14px', marginBottom: 20,
            fontSize: 12, color: '#fca5a5',
          }}>
            Authentication failed. Please try again.
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          style={{
            width: '100%',
            background: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '11px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            color: '#1e293b',
            cursor: 'pointer',
            fontFamily: "'Inter', system-ui, sans-serif",
            marginBottom: 16,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: '#1e2330' }} />
          <span style={{ fontSize: 11, color: '#374151' }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#1e2330' }} />
        </div>

        {/* Demo button */}
        <button
          onClick={handleDemo}
          disabled={demoLoading}
          style={{
            width: '100%',
            background: demoLoading ? '#0d1117' : 'rgba(0,201,212,0.08)',
            border: '1px solid rgba(0,201,212,0.25)',
            borderRadius: 8,
            padding: '11px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: demoLoading ? '#475569' : '#5DDDE3',
            cursor: demoLoading ? 'not-allowed' : 'pointer',
            fontFamily: "'Inter', system-ui, sans-serif",
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!demoLoading) { e.currentTarget.style.background = 'rgba(0,201,212,0.14)'; e.currentTarget.style.borderColor = 'rgba(0,201,212,0.40)' } }}
          onMouseLeave={e => { if (!demoLoading) { e.currentTarget.style.background = 'rgba(0,201,212,0.08)'; e.currentTarget.style.borderColor = 'rgba(0,201,212,0.25)' } }}
        >
          {demoLoading ? 'Loading demo…' : '✦ Skip and try with sample data'}
        </button>

        <p style={{ fontSize: 11, color: '#374151', marginTop: 10 }}>
          No account needed — explore freely with sample accounts
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
