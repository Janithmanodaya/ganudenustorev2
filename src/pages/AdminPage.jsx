import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AdminPage() {
  const navigate = useNavigate()
  const [adminEmail, setAdminEmail] = useState('')
  const [maskedKey, setMaskedKey] = useState(null)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [status, setStatus] = useState(null)
  const [allowed, setAllowed] = useState(false)

  // Approval queue state
  const [pending, setPending] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [editStructured, setEditStructured] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  // Banners
  const [banners, setBanners] = useState([])
  const fileRef = useRef(null)

  async function fetchConfig() {
    try {
      const r = await fetch('/api/admin/config', { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load config')
      setMaskedKey(data.gemini_api_key_masked)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function saveConfig() {
    try {
      const r = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': adminEmail
        },
        body: JSON.stringify({ geminiApiKey })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to save config')
      setStatus('API key saved.')
      setGeminiApiKey('')
      fetchConfig()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function testGemini() {
    try {
      const r = await fetch('/api/admin/test-gemini', {
        method: 'POST',
        headers: { 'X-Admin-Email': adminEmail }
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error?.message || data.error || 'Failed to test API key')
      setStatus(`API key OK. Models available: ${data.models_count}`)
    } catch (e) {
      setStatus(`Test failed: ${e.message}`)
    }
  }

  async function loadPending() {
    try {
      const r = await fetch('/api/admin/pending', { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load pending')
      setPending(data.items || [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function loadDetail(id) {
    try {
      const r = await fetch(`/api/admin/pending/${encodeURIComponent(id)}`, { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load item')
      setDetail(data)
      setEditStructured(data.listing.structured_json || '')
      setSelectedId(id)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function saveEdits() {
    try {
      const r = await fetch(`/api/admin/pending/${encodeURIComponent(selectedId)}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': adminEmail
        },
        body: JSON.stringify({
          structured_json: editStructured
        })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to save edits')
      setStatus('Edits saved.')
      await loadDetail(selectedId)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function approve() {
    try {
      const r = await fetch(`/api/admin/pending/${encodeURIComponent(selectedId)}/approve`, {
        method: 'POST',
        headers: { 'X-Admin-Email': adminEmail }
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to approve')
      setStatus('Approved.')
      setDetail(null)
      setSelectedId(null)
      await loadPending()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function reject() {
    try {
      const r = await fetch(`/api/admin/pending/${encodeURIComponent(selectedId)}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Email': adminEmail
        },
        body: JSON.stringify({ reason: rejectReason })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to reject')
      setStatus('Rejected.')
      setDetail(null)
      setSelectedId(null)
      setRejectReason('')
      await loadPending()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function loadBanners() {
    try {
      const r = await fetch('/api/admin/banners', { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load banners')
      setBanners(data.results || [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function onUploadBanner(file) {
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('image', file)
      const r = await fetch('/api/admin/banners', {
        method: 'POST',
        headers: { 'X-Admin-Email': adminEmail },
        body: fd
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Failed to upload banner')
      setStatus('Banner uploaded.')
      loadBanners()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function toggleBanner(id, active) {
    try {
      const r = await fetch(`/api/admin/banners/${id}/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Email': adminEmail },
        body: JSON.stringify({ active: !active })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to update banner')
      loadBanners()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function deleteBanner(id) {
    const yes = window.confirm('Delete this banner?')
    if (!yes) return
    try {
      const r = await fetch(`/api/admin/banners/${id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Email': adminEmail }
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to delete banner')
      loadBanners()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  // On mount, require logged-in admin
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (user && user.is_admin && user.email) {
        setAllowed(true)
        setAdminEmail(user.email)
      } else {
        setAllowed(false)
      }
    } catch (_) {
      setAllowed(false)
    }
  }, [])

  useEffect(() => {
    if (allowed && adminEmail) {
      fetchConfig()
      loadPending()
      loadBanners()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, adminEmail])

  if (!allowed) {
    return (
      <div className="center">
        <div className="card">
          <div className="h1">Admin Dashboard</div>
          <p className="text-muted">Access denied. Admins only.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={() => navigate('/auth')}>Go to Login</button>
            <button className="btn" onClick={() => navigate('/')}>Home</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Admin Dashboard</div>
        <p className="text-muted">Configure API access and review listings.</p>

        <div className="h2" style={{ marginTop: 16 }}>Homepage Banners</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>Upload Banner</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onUploadBanner(e.target.files?.[0] || null)} />
          <small className="text-muted">Recommended wide ratio (e.g., 3:1). JPG or PNG, up to 5MB.</small>
        </div>
        <div className="grid three">
          {banners.map(b => (
            <div key={b.id} className="card">
              {b.url && <img src={b.url} alt={`Banner ${b.id}`} style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }} />}
              <div className="text-muted" style={{ marginTop: 6 }}>Active: {b.active ? 'Yes' : 'No'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={() => toggleBanner(b.id, b.active)}>{b.active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn" onClick={() => deleteBanner(b.id)}>Delete</button>
              </div>
            </div>
          ))}
          {banners.length === 0 && <p className="text-muted">No banners yet.</p>}
        </div>

        <div className="h2" style={{ marginTop: 16 }}>AI API Configuration</div>
        <div className="grid two">
          <input className="input" placeholder="API Key" value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)} />
          <button className="btn primary" onClick={saveConfig}>Save Key</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={testGemini}>Test API Key</button>
          <div className="text-muted" style={{ marginTop: 8 }}>
            Current key: {maskedKey || 'none'}
          </div>
        </div>

        <div className="h2" style={{ marginTop: 16 }}>Pending Approval Queue</div>
        <div className="grid two">
          <div>
            <div className="h2">Items</div>
            {pending.length === 0 && <p className="text-muted">No pending items.</p>}
            {pending.map(item => (
              <div key={item.id} className="card" style={{ marginBottom: 8 }}>
                <div><strong>{item.title}</strong></div>
                <div className="text-muted">Category: {item.main_category}</div>
                <div className="text-muted">{item.seo_description || item.description?.slice(0,160)}</div>
                <button className="btn" style={{ marginTop: 8 }} onClick={() => loadDetail(item.id)}>Review</button>
              </div>
            ))}
          </div>
          <div>
            <div className="h2">Review & Edit</div>
            {!detail && <p className="text-muted">Select an item to review.</p>}
            {detail && (
              <>
                <p className="text-muted">Title: {detail.listing.title} • Category: {detail.listing.main_category}</p>
                <div className="grid two">
                  <div>
                    <div className="h2">Original User Input</div>
                    <div className="card">
                      <div><strong>Title</strong>: {detail.listing.title}</div>
                      <div><strong>Description</strong>:</div>
                      <p>{detail.listing.description}</p>
                      {detail.listing.resume_file_url && (
                        <div className="text-muted">Resume File: {detail.listing.resume_file_url}</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="h2">Structured JSON</div>
                    <textarea className="textarea" value={editStructured} onChange={e => setEditStructured(e.target.value)} />
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={saveEdits}>Save Edits</button>
                  <button className="btn primary" onClick={approve} style={{ marginLeft: 8 }}>Approve</button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <input className="input" placeholder="Reject reason (required)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                  <button className="btn" onClick={reject} style={{ marginTop: 6 }}>Reject</button>
                </div>
              </>
            )}
          </div>
        </div>

        {status && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="h2">Status</div>
            <p>{status}</p>
          </div>
        )}
      </div>
    </div>
  )
}