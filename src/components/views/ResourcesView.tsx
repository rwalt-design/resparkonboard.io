'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Resource } from '@/types'

interface Props {
  resources: Resource[]
  onRefresh: () => void
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface2)', border: '1px solid var(--border-b)',
  borderRadius: 6, padding: '7px 10px', color: 'var(--text-h)',
  fontSize: 13, fontFamily: 'var(--font-ui)', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}
const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)', border: 'none', borderRadius: 6,
  padding: '8px 16px', color: '#fff', fontSize: 13,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', flexShrink: 0,
}
const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
  padding: '7px 14px', color: 'var(--text-2)', fontSize: 13,
  cursor: 'pointer', fontFamily: 'var(--font-ui)', flexShrink: 0,
}

function AddResourceForm({ orgId, onSaved }: { orgId: string; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const normalizeUrl = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return trimmed
    if (!/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed
    return trimmed
  }

  const handleSave = async () => {
    if (!title.trim() || !url.trim()) return
    setSaving(true)
    await supabase.from('resources').insert({
      org_id: orgId,
      title: title.trim(),
      url: normalizeUrl(url),
      description: description.trim() || null,
    })
    setSaving(false)
    setTitle(''); setUrl(''); setDescription('')
    onSaved()
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '18px 20px', marginBottom: 20,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', marginBottom: 2 }}>Add link</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: '0 0 220px' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          style={{ ...inputStyle, flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !url.trim()}
          style={{ ...primaryBtn, opacity: !title.trim() || !url.trim() ? 0.4 : 1 }}
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

function ResourceCard({ resource, onRefresh }: { resource: Resource; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(resource.title)
  const [url, setUrl] = useState(resource.url)
  const [description, setDescription] = useState(resource.description || '')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const hostname = (() => {
    try { return new URL(resource.url).hostname.replace('www.', '') }
    catch { return resource.url }
  })()

  const handleSave = async () => {
    if (!title.trim() || !url.trim()) return
    setSaving(true)
    await supabase.from('resources').update({
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || null,
    }).eq('id', resource.id)
    setSaving(false)
    setEditing(false)
    onRefresh()
  }

  const handleDelete = async () => {
    await supabase.from('resources').delete().eq('id', resource.id)
    onRefresh()
  }

  if (editing) {
    return (
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-b)',
        borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
            style={{ ...inputStyle, flex: '0 0 200px' }} autoFocus />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
            style={{ ...inputStyle, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={() => { setEditing(false); setTitle(resource.title); setUrl(resource.url); setDescription(resource.description || '') }} style={ghostBtn}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 16px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-b)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Link icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 7, flexShrink: 0,
        background: 'var(--bg-surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, marginTop: 1,
      }}>🔗</div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 14, fontWeight: 600, color: '#60a5fa',
            textDecoration: 'none', display: 'block',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          {resource.title}
        </a>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
          {hostname}
        </div>
        {resource.description && (
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
            {resource.description}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignSelf: 'flex-start' }}>
        <button
          onClick={() => setEditing(true)}
          title="Edit"
          style={{
            background: 'none', border: 'none', color: 'var(--text-3)',
            fontSize: 13, cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
        >✎</button>
        <button
          onClick={handleDelete}
          title="Delete"
          style={{
            background: 'none', border: 'none', color: 'var(--text-3)',
            fontSize: 15, cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
        >×</button>
      </div>
    </div>
  )
}

export function ResourcesView({ resources, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)

  // Get orgId once
  useState(() => {
    const supabase = createClient()
    supabase.from('org_members').select('org_id').single().then(({ data }) => {
      if (data) setOrgId(data.org_id)
    })
  })

  const filtered = resources.filter(r => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.title.toLowerCase().includes(q) || r.url.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>Resources</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' }}>
            Links you use across accounts — slide decks, templates, forms, and reference docs.
          </p>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {resources.length} link{resources.length !== 1 ? 's' : ''}
        </span>
      </div>

      {orgId && <AddResourceForm orgId={orgId} onSaved={onRefresh} />}

      {resources.length > 4 && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search resources…"
          style={{
            ...inputStyle, marginBottom: 14,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
          }}
        />
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
          {resources.length === 0 ? (
            <>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔗</div>
              <p style={{ fontSize: 14, margin: 0 }}>No resources yet — add your first link above.</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                Good starting points: kickoff slide deck, Pre-Work Form, data template, onboarding checklist.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, margin: 0 }}>No results for &ldquo;{search}&rdquo;</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => (
            <ResourceCard key={r.id} resource={r} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  )
}
