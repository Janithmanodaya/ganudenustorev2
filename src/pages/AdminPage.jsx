import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AdminPage() {
  const navigate = useNavigate()
  const [adminEmail, setAdminEmail] = useState('')
  const [maskedKey, setMaskedKey] = useState(null)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [bankDetails, setBankDetails] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
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

  // Dashboard metrics
  const [metrics, setMetrics] = useState(null)
  const [rangeDays, setRangeDays] = useState(7)

  // Users management
  const [users, setUsers] = useState([])
  const [userQuery, setUserQuery] = useState('')
  const [suspendDays, setSuspendDays] = useState(7)

  // Reports management
  const [reports, setReports] = useState([])
  const [reportFilter, setReportFilter] = useState('pending')

  // Notifications (admin)
  const [notificationsAdmin, setNotificationsAdmin] = useState([])
  const [notifyTitle, setNotifyTitle] = useState('')
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifyTargetType, setNotifyTargetType] = useState('all') // 'all' | 'email'
  const [notifyEmail, setNotifyEmail] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // Chat management (admin)
  const [conversations, setConversations] = useState([])
  const [selectedChatEmail, setSelectedChatEmail] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')

  // Tabs
  const [activeTab, setActiveTab] = useState('dashboard')

  async function fetchConfig() {
    try {
      const r = await fetch('/api/admin/config', { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load config')
      setMaskedKey(data.gemini_api_key_masked)
      setBankDetails(data.bank_details || '')
      setWhatsappNumber(data.whatsapp_number || '')
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
        body: JSON.stringify({ geminiApiKey, bankDetails, whatsappNumber })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to save config')
      setStatus('Configuration saved.')
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

  async function loadMetrics(days = rangeDays) {
    try {
      const r = await fetch(`/api/admin/metrics?days=${encodeURIComponent(days)}`, { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load metrics')
      setMetrics(data)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function loadUsers(q = '') {
    try {
      const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load users')
      setUsers(data.results || [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function banUser(id) {
    try {
      const r = await fetch(`/api/admin/users/${id}/ban`, { method: 'POST', headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to ban user')
      loadUsers(userQuery)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function unbanUser(id) {
    try {
      const r = await fetch(`/api/admin/users/${id}/unban`, { method: 'POST', headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to unban user')
      loadUsers(userQuery)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function suspend7Days(id) {
    try {
      const r = await fetch(`/api/admin/users/${id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Email': adminEmail },
        body: JSON.stringify({ days: Number(suspendDays) || 7 })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to suspend user')
      loadUsers(userQuery)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function unsuspendUser(id) {
    try {
      const r = await fetch(`/api/admin/users/${id}/unsuspend`, { method: 'POST', headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to unsuspend user')
      loadUsers(userQuery)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function loadReports(filter = 'pending') {
    try {
      const r = await fetch(`/api/admin/reports?status=${encodeURIComponent(filter)}`, { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load reports')
      setReports(data.results || [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function resolveReport(id) {
    try {
      const r = await fetch(`/api/admin/reports/${id}/resolve`, { method: 'POST', headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to resolve report')
      loadReports(reportFilter)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function deleteReport(id) {
    const yes = window.confirm('Delete this report?')
    if (!yes) return
    try {
      const r = await fetch(`/api/admin/reports/${id}`, { method: 'DELETE', headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to delete report')
      loadReports(reportFilter)
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

  // Notifications (admin)
  async function loadAdminNotifications() {
    try {
      const r = await fetch('/api/admin/notifications', { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load notifications')
      setNotificationsAdmin(data.results || [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function sendNotification() {
    if (!notifyTitle.trim() || !notifyMessage.trim()) {
      setStatus('Title and message are required.')
      return
    }
    try {
      const payload = {
        title: notifyTitle.trim(),
        message: notifyMessage.trim(),
        targetEmail: notifyTargetType === 'email' ? notifyEmail.trim().toLowerCase() : null
      }
      const r = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Email': adminEmail },
        body: JSON.stringify(payload)
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to send notification')
      setStatus('Notification sent.')
      setNotifyTitle('')
      setNotifyMessage('')
      setNotifyTargetType('all')
      setNotifyEmail('')
      loadAdminNotifications()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function deleteNotification(id) {
    const yes = window.confirm('Delete this notification?')
    if (!yes) return
    try {
      const r = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE', headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to delete notification')
      loadAdminNotifications()
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  // Chat management (admin)
  async function loadConversations() {
    try {
      const r = await fetch('/api/chats/admin/conversations', { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load conversations')
      setConversations(Array.isArray(data.results) ? data.results : [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function loadChatMessages(email) {
    try {
      const r = await fetch(`/api/chats/admin/${encodeURIComponent(email)}`, { headers: { 'X-Admin-Email': adminEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load messages')
      setSelectedChatEmail(email)
      setChatMessages(Array.isArray(data.results) ? data.results : [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function sendAdminReply() {
    const msg = chatInput.trim()
    if (!msg || !selectedChatEmail) return
    try {
      const r = await fetch(`/api/chats/admin/${encodeURIComponent(selectedChatEmail)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Email': adminEmail },
        body: JSON.stringify({ message: msg })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Failed to send')
      setChatInput('')
      setChatMessages(prev => [...prev, { id: Date.now(), sender: 'admin', message: msg, created_at: new Date().toISOString() }])
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
      loadMetrics(rangeDays)
      loadUsers('')
      loadReports(reportFilter)
      loadAdminNotifications()
      // preload conversations
      loadConversations()
      // initial unread count
      fetch('/api/notifications/unread-count', { headers: { 'X-User-Email': adminEmail } })
        .then(r => r.json())
        .then(d => setUnreadCount(Number(d.unread_count) || 0))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, adminEmail])

  // Auto-refresh notifications when on the Notifications tab (and update unread count)
  useEffect(() => {
    if (!allowed || !adminEmail) return
    if (activeTab !== 'notifications') return
    const refresh = () => {
      loadAdminNotifications()
      fetch('/api/notifications/unread-count', { headers: { 'X-User-Email': adminEmail } })
        .then(r => r.json())
        .then(d => setUnreadCount(Number(d.unread_count) || 0))
        .catch(() => {})
    }
    // initial refresh on entering tab
    refresh()
    const timer = setInterval(refresh, 15000) // every 15s
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, adminEmail, activeTab])

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

  function BarChart({ data, color = '#6c7ff7' }) {
    if (!Array.isArray(data) || data.length === 0) return <p className="text-muted">No data</p>
    const max = Math.max(1, ...data.map(d => d.count || 0))
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140 }}>
        {data.map((d, idx) => {
          const h = Math.round(((d.count || 0) / max) * 120)
          return (
            <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', background: color, height: h, borderRadius: 8, opacity: 0.9 }} title={`${d.date || d.label}: ${d.count || 0}`} />
              <small className="text-muted">{(d.date || '').slice(5)}</small>
            </div>
          )
        })}
      </div>
    )
  }

  function SparklineBars({ data, color = '#6c7ff7' }) {
    if (!Array.isArray(data) || data.length === 0) return null
    const max = Math.max(1, ...data.map(d => d.count || 0))
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 40 }}>
        {data.map((d, idx) => {
          const h = Math.round(((d.count || 0) / max) * 36)
          return <div key={idx} style={{ flex: 1, height: h, background: color, borderRadius: 4, opacity: 0.9 }} />
        })}
      </div>
    )
  }

  function StackedBars({ a, b, aLabel = 'A', bLabel = 'B', aColor = '#34d399', bColor = '#ef4444' }) {
    const len = Math.max((a && a.length) || 0, (b && b.length) || 0)
    const merged = Array.from({ length: len }, (_, i) => {
      const ai = Array.isArray(a) ? a[i] : undefined
      const bi = Array.isArray(b) ? b[i] : undefined
      return {
        date: (ai && ai.date) || (bi && bi.date) || '',
        a: (ai && ai.count) || 0,
        b: (bi && bi.count) || 0
      }
    })
    const max = Math.max(1, ...merged.map(x => x.a + x.b))
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <span className="pill" style={{ borderColor: 'transparent', background: 'rgba(52,211,153,0.15)', color: '#a7f3d0' }}>
            <span style={{ width: 10, height: 10, background: aColor, borderRadius: 2 }} /> {aLabel}
          </span>
          <span className="pill" style={{ borderColor: 'transparent', background: 'rgba(239,68,68,0.15)', color: '#fecaca' }}>
            <span style={{ width: 10, height: 10, background: bColor, borderRadius: 2 }} /> {bLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140 }}>
          {merged.map((d, idx) => {
            const totalH = Math.round(((d.a + d.b) / max) * 120)
            const aH = totalH > 0 ? Math.round((d.a / (d.a + d.b)) * totalH) : 0
            const bH = totalH - aH
            return (
              <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: '100%', height: totalH, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} title={`${d.date}: ${d.a} / ${d.b}`}>
                  <div style={{ background: aColor, height: aH }} />
                  <div style={{ background: bColor, height: bH }} />
                </div>
                <small className="text-muted">{(d.date || '').slice(5)}</small>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function HorizontalBars({ items }) {
    if (!Array.isArray(items) || items.length === 0) return <p className="text-muted">No data</p>
    const max = Math.max(1, ...items.map(i => i.value || 0))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((i, idx) => {
          const w = Math.round(((i.value || 0) / max) * 100)
          return (
            <div key={idx}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div className="text-muted">{i.label}</div>
                <div className="text-muted">{i.value}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', height: 10 }}>
                <div style={{ width: `${w}%`, height: '100%', background: 'linear-gradient(90deg,#6c7ff7,#00d1ff)' }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function AdminPaymentRules({ adminEmail, onStatus }) {
    const [rules, setRules] = useState([])
    const [loading, setLoading] = useState(false)

    async function loadRules() {
      setLoading(true)
      try {
        const r = await fetch('/api/admin/config', { headers: { 'X-Admin-Email': adminEmail } })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load rules')
        setRules(Array.isArray(data.payment_rules) ? data.payment_rules : [])
      } catch (e) {
        onStatus && onStatus(`Error: ${e.message}`)
      } finally {
        setLoading(false)
      }
    }

    useEffect(() => {
      if (adminEmail) loadRules()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminEmail])

    function updateRule(idx, patch) {
      setRules(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
    }

    async function saveRules() {
      try {
        const payload = {
          paymentRules: rules.map(r => ({
            category: r.category,
            amount: Number(r.amount) || 0,
            enabled: !!r.enabled
          }))
        }
        const r = await fetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Email': adminEmail },
          body: JSON.stringify(payload)
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to save rules')
        onStatus && onStatus('Payment rules updated.')
        loadRules()
      } catch (e) {
        onStatus && onStatus(`Error: ${e.message}`)
      }
    }

    return (
      <div className="card" style={{ marginTop: 8 }}>
        {loading && <p className="text-muted">Loading payment rules...</p>}
        {!loading && rules.length === 0 && <p className="text-muted">No rules found.</p>}
        {!loading && rules.length > 0 && (
          <>
            {rules.map((r, idx) => (
              <div key={r.category} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong>{r.category}</strong>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!r.enabled}
                      onChange={e => updateRule(idx, { enabled: e.target.checked ? 1 : 0 })}
                    />
                    <span className="text-muted">Enabled</span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="text-muted">Amount (Rs.)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={r.amount}
                      onChange={e => updateRule(idx, { amount: Math.max(0, Number(e.target.value || 0)) })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={saveRules}>Save Payment Rules</button>
              <button className="btn" onClick={loadRules}>Refresh</button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Admin Dashboard</div>
        <p className="text-muted">Configure, monitor, and manage users, listings, and reports.</p>

        {/* Tabs */}
       <<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
          {[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'users', label: 'Users' },
            { key: 'reports', label: 'Reports' },
            { key: 'banners', label: 'Banners' },
            { key: 'notifications', label: (unreadCount > 0 ? `Notifications (${unreadCount})` : 'Notifications') },
            { key: 'chat', label: 'Chat' },
            { key: 'ai', label: 'AI Config' },
            { key: 'approvals', label: 'Approvals' }
          ].map(t => (
           < button
              key={t.key}
              className="btn"
              onClick={() => setActiveTab(t.key)}
              style={{
                borderColor: 'var(--border)',
                backgroundeg, var(--primary), #5569e2)' : 'rgba(22,28,38,0.7)',
                color: activeTab === t.key ? '#fff' : 'var(--text)'
              }}
            >
              {t.key === 'notifications' ? (
                <>
                  <span>Notifications</span>
                  {unreadCount > 0 && <span className="pill" style={{ marginLeft: 6 }}>{unreadCount}</span>}
                </>
              ) : t.label}
            </button>
          ))}
        </div>

        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>Dashboard</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span className="text-muted">Range:</span>
              <select className="select" style={{ maxWidth: 180 }} value={String(rangeDays)} onChange={e => { const v = Number(e.target.value); setRangeDays(v); loadMetrics(v); }}>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
              <button className="btn" onClick={() => loadMetrics(rangeDays)}>Refresh</button>
            </div>

            {!metrics && <p className="text-muted">Loading analytics...</p>}
            {metrics && (
              <>
                <div className="grid three">
                  <div className="card">
                    <div className="h2">Users</div>
                    <div className="text-muted">Total: {metrics.totals.totalUsers}</div>
                    <div className="text-muted">Banned: {metrics.totals.bannedUsers}</div>
                    <div className="text-muted">Suspended: {metrics.totals.suspendedUsers}</div>
                  </div>
                  <div className="card">
                    <div className="h2">Listings</div>
                    <div className="text-muted">Total: {metrics.totals.totalListings}</div>
                    <div className="text-muted">Active: {metrics.totals.activeListings}</div>
                    <div className="text-muted">Pending: {metrics.totals.pendingListings}</div>
                    <div className="text-muted">Rejected: {metrics.totals.rejectedListings}</div>
                  </div>
                  <div className="card">
                    <div className="h2">Reports</div>
                    <div className="text-muted">Pending: {metrics.totals.reportPending}</div>
                    <div className="text-muted">Resolved: {metrics.totals.reportResolved}</div>
                  </div>
                </div>

                <div className="grid three" style={{ marginTop: 12 }}>
                  <div className="card">
                    <div className="h2">New Users (last {metrics.params?.days}d): {metrics.rangeTotals.usersNewInRange}</div>
                    <SparklineBars data={metrics.series.signups} color="#6c7ff7" />
                  </div>
                  <div className="card">
                    <div className="h2">New Ads (last {metrics.params?.days}d): {metrics.rangeTotals.listingsNewInRange}</div>
                    <SparklineBars data={metrics.series.listingsCreated} color="#00d1ff" />
                  </div>
                  <div className="card">
                    <div className="h2">Reports (last {metrics.params?.days}d): {metrics.rangeTotals.reportsInRange}</div>
                    <SparklineBars data={metrics.series.reports} color="#e58e26" />
                  </div>
                </div>

                <div className="grid three" style={{ marginTop: 12 }}>
                  <div className="card">
                    <div className="h2">Signups (last {metrics.params?.days} days)</div>
                    <BarChart data={metrics.series.signups} color="#6c7ff7" />
                  </div>
                  <div className="card">
                    <div className="h2">Listings Created (last {metrics.params?.days} days)</div>
                    <BarChart data={metrics.series.listingsCreated} color="#00d1ff" />
                  </div>
                  <div className="card">
                    <div className="h2">Reports (last {metrics.params?.days} days)</div>
                    <BarChart data={metrics.series.reports} color="#e58e26" />
                  </div>
                </div>

                <div className="grid two" style={{ marginTop: 12 }}>
                  <div className="card">
                    <div className="h2">Approvals vs Rejections (last {metrics.params?.days} days)</div>
                    <StackedBars a={metrics.series.approvals} b={metrics.series.rejections} aLabel="Approve" bLabel="Reject" aColor="#34d399" bColor="#ef4444" />
                    <div className="text-muted" style={{ marginTop: 8 }}>
                      Total approvals: {metrics.rangeTotals.approvalsInRange} • Total rejections: {metrics.rangeTotals.rejectionsInRange}
                    </div>
                  </div>
                  <div className="card">
                    <div className="h2">Top Categories</div>
                    <HorizontalBars items={metrics.topCategories.map(c => ({ label: c.category, value: c.cnt }))} />
                    <div className="h2" style={{ marginTop: 16 }}>Status Breakdown</div>
                    <HorizontalBars items={metrics.statusBreakdown.map(s => ({ label: s.status, value: s.count }))} />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Users */}
        {activeTab === 'users' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>User Management</div>
            <div className="grid two">
              <input className="input" placeholder="Search by email or username..." value={userQuery} onChange={e => setUserQuery(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => loadUsers(userQuery)}>Search</button>
                <button className="btn" onClick={() => { setUserQuery(''); loadUsers(''); }}>Reset</button>
              </div>
            </div>
            <div className="grid two" style={{ marginTop: 8 }}>
              <div>
                <label className="text-muted">Suspend days</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="365"
                  value={suspendDays}
                  onChange={e => setSuspendDays(Math.max(1, Math.min(365, Number(e.target.value || 1))))}
                />
              </div>
              <div className="text-muted" style={{ display: 'flex', alignItems: 'center' }}>
                This value is used when clicking “Suspend” on a user.
              </div>
            </div>
            <div className="grid two" style={{ marginTop: 8 }}>
              <div className="card">
                <div className="h2">Results</div>
                {users.length === 0 && <p className="text-muted">No users.</p>}
                {users.map(u => (
                  <div key={u.id} className="card" style={{ marginBottom: 8 }}>
                    <div><strong>{u.email}</strong> {u.username ? <span className="text-muted">• @{u.username}</span> : null}</div>
                    <div className="text-muted">ID: {u.id} • Admin: {u.is_admin ? 'Yes' : 'No'} • Created: {new Date(u.created_at).toLocaleString()}</div>
                    <div className="text-muted">
                      Status: {u.is_banned ? 'Banned' : (u.suspended_until && u.suspended_until > new Date().toISOString() ? `Suspended until ${new Date(u.suspended_until).toLocaleString()}` : 'Active')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {!u.is_banned && <button className="btn" onClick={() => banUser(u.id)}>Ban</button>}
                      {u.is_banned && <button className="btn" onClick={() => unbanUser(u.id)}>Unban</button>}
                      {/* Show Unsuspend if currently suspended */}
                      {u.suspended_until && (new Date(u.suspended_until) > new Date()) ? (
                        <button className="btn" onClick={() => unsuspendUser(u.id)}>Unsuspend</button>
                      ) : (
                        <button className="btn" onClick={() => suspend7Days(u.id)}>Suspend 7 days</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="h2">Reports</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select className="select" value={reportFilter} onChange={e => { setReportFilter(e.target.value); loadReports(e.target.value); }}>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="">All</option>
                  </select>
                  <button className="btn" onClick={() => loadReports(reportFilter)}>Refresh</button>
                </div>
                {reports.length === 0 && <p className="text-muted">No reports.</p>}
                {reports.map(r => (
                  <div key={r.id} className="card" style={{ marginBottom: 8 }}>
                    <div><strong>Listing #{r.listing_id}</strong> • <span className="text-muted">{new Date(r.ts).toLocaleString()}</span></div>
                    <div className="text-muted">Reporter: {r.reporter_email || 'anonymous'}</div>
                    <div style={{ marginTop: 6 }}>{r.reason}</div>
                    <div className="text-muted" style={{ marginTop: 6 }}>Status: {r.status || 'pending'}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {r.status !== 'resolved' && <button className="btn" onClick={() => resolveReport(r.id)}>Mark Resolved</button>}
                      <button className="btn" onClick={() => deleteReport(r.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Reports */}
        {activeTab === 'reports' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>Reports</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select className="select" value={reportFilter} onChange={e => { setReportFilter(e.target.value); loadReports(e.target.value); }}>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="">All</option>
              </select>
              <button className="btn" onClick={() => loadReports(reportFilter)}>Refresh</button>
            </div>
            {reports.length === 0 && <p className="text-muted">No reports.</p>}
            {reports.map(r => (
              <div key={r.id} className="card" style={{ marginBottom: 8 }}>
                <div><strong>Listing #{r.listing_id}</strong> • <span className="text-muted">{new Date(r.ts).toLocaleString()}</span></div>
                <div className="text-muted">Reporter: {r.reporter_email || 'anonymous'}</div>
                <div style={{ marginTop: 6 }}>{r.reason}</div>
                <div className="text-muted" style={{ marginTop: 6 }}>Status: {r.status || 'pending'}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {r.status !== 'resolved' && <button className="btn" onClick={() => resolveReport(r.id)}>Mark Resolved</button>}
                  <button className="btn" onClick={() => deleteReport(r.id)}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Banners */}
        {activeTab === 'banners' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>Homepage Banners</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <button className="btn" onClick={() => fileRef.current?.click()}>Upload Banner</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onUploadBanner((e.target.files && e.target.files[0]) || null)} />
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
          </>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>Send Notification</div>
            <div className="grid two">
              <input className="input" placeholder="Title" value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} />
              <select className="select" value={notifyTargetType} onChange={e => setNotifyTargetType(e.target.value)}>
                <option value="all">Send to all users</option>
                <option value="email">Send to specific email</option>
              </select>
            </div>
            {notifyTargetType === 'email' && (
              <input className="input" placeholder="Target email (exact match)" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)} style={{ marginTop: 8 }} />
            )}
            <textarea className="textarea" placeholder="Message" value={notifyMessage} onChange={e => setNotifyMessage(e.target.value)} style={{ marginTop: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn primary" onClick={sendNotification}>Send</button>
              <button className="btn" onClick={loadAdminNotifications}>Refresh</button>
            </div>

            <div className="h2" style={{ marginTop: 16 }}>Recent Notifications</div>
            {notificationsAdmin.length === 0 && <p className="text-muted">No notifications yet.</p>}
            {notificationsAdmin.map(n => (
              <div key={n.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{n.title}</strong>
                  <small className="text-muted">{new Date(n.created_at).toLocaleString()}</small>
                </div>
                <div className="text-muted" style={{ marginTop: 6 }}>To: {n.target_email ? n.target_email : 'All users'}</div>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.message}</div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => deleteNotification(n.id)}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Chat Management */}
        {activeTab === 'chat' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>User Chat (last 7 days)</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn" onClick={loadConversations}>Refresh</button>
                </div>
                {conversations.length === 0 && <p className="text-muted" style={{ marginTop: 8 }}>No conversations.</p>}
                {conversations.map(c => (
                  <div key={c.user_email} className="card" style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{c.user_email}</strong>
                      <small className="text-muted">{new Date(c.last_ts).toLocaleString()}</small>
                    </div>
                    <div className="text-muted" style={{ marginTop: 6 }}>{c.last_sender === 'admin' ? 'Admin: ' : 'User: '}{c.last_message}</div>
                    <div style={{ marginTop: 8 }}>
                      <button className="btn" onClick={() => loadChatMessages(c.user_email)}>Open</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1 }}>
                <div className="h2">Conversation</div>
                {!selectedChatEmail && <p className="text-muted">Select a conversation.</p>}
                {selectedChatEmail && (
                  <>
                    <div className="pill">With: {selectedChatEmail}</div>
                    <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 8 }}>
                      {chatMessages.map(m => (
                        <div key={m.id} className="card" style={{ marginBottom: 6, background: m.sender === 'admin' ? 'rgba(108,127,247,0.12)' : 'rgba(0,209,255,0.10)', borderColor: 'transparent' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                            <strong>{m.sender === 'admin' ? 'Admin' : selectedChatEmail}</strong>
                            <small className="text-muted">{new Date(m.created_at).toLocaleString()}</small>
                          </div>
                          <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{m.message}</div>
                        </div>
                      ))}
                      {chatMessages.length === 0 && <p className="text-muted">No messages yet.</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input className="input" placeholder="Type a reply..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendAdminReply(); } }} />
                      <button className="btn primary" onClick={sendAdminReply}>Send</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* AI Config */}
        {activeTab === 'ai' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>AI & Payments Configuration</div>
            <div className="grid two">
              <input className="input" placeholder="Gemini API Key" value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)} />
              <button className="btn primary" onClick={saveConfig}>Save Configuration</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={testGemini}>Test API Key</button>
              <div className="text-muted" style={{ marginTop: 8 }}>
                Current key: {maskedKey || 'none'}
              </div>
            </div>
            <div className="h2" style={{ marginTop: 12 }}>Bank Details (shown to user for payment)</div>
            <textarea className="textarea" placeholder="Bank details (Account Name, Number, Bank/Branch)" value={bankDetails} onChange={e => setBankDetails(e.target.value)} />
            <div className="h2" style={{ marginTop: 12 }}>WhatsApp Number (for receipts)</div>
            <input className="input" placeholder="+94XXXXXXXXX" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} />

            <div className="h2" style={{ marginTop: 16 }}>Category Payment Rules</div>
            <AdminPaymentRules adminEmail={adminEmail} onStatus={setStatus} />

            <div style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={saveConfig}>Save Configuration</button>
            </div>
          </>
        )}

        {/* Approvals */}
        {activeTab === 'approvals' && (
          <>
            <div className="h2" style={{ marginTop: 8 }}>Pending Approval Queue</div>
            <div className="grid two">
              <div>
                <div className="h2">Items</div>
                {pending.length === 0 && <p className="text-muted">No pending items.</p>}
                {pending.map(item => (
                  <div key={item.id} className="card" style={{ marginBottom: 8 }}>
                    <div><strong>{item.title}</strong></div>
                    <div className="text-muted">Category: {item.main_category}</div>
                    <div className="text-muted">Price: {item.price != null ? item.price : 'N/A'}</div>
                    <div className="text-muted">Owner: {item.owner_email || 'unknown'}</div>
                    <div className="pill" style={{ marginTop: 6 }}>Bank Remark: {item.remark_number || '—'}</div>
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
                    <div className="pill">Bank Remark: {detail.listing.remark_number || '—'}</div>
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
          </>
        )}

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
