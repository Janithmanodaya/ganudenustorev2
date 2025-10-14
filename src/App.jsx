import React, { useEffect, useRef, useState } from 'react'
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import ViewListingPage from './pages/ViewListingPage.jsx'
import NewListingPage from './pages/NewListingPage.jsx'
import VerifyListingPage from './pages/VerifyListingPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import JobPortalPage from './pages/JobPortalPage.jsx'
import PostEmployeeAdPage from './pages/PostEmployeeAdPage.jsx'
import SearchResultsPage from './pages/SearchResultsPage.jsx'
import VerifyEmployeePage from './pages/VerifyEmployeePage.jsx'
import MyAdsPage from './pages/MyAdsPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import JobSearchResultsPage from './pages/JobSearchResultsPage.jsx'
import PolicyPage from './pages/PolicyPage.jsx'
import PaymentPendingPage from './pages/PaymentPendingPage.jsx'

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'

  // Notifications state (top-right bell)
  const [userEmail, setUserEmail] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const notifBtnRef = useRef(null)
  const notifPanelRef = useRef(null)

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      setUserEmail(user?.email || '')
    } catch (_) {
      setUserEmail('')
    }
  }, [location])

  async function loadUnread() {
    if (!userEmail) { setUnreadCount(0); return }
    try {
      const r = await fetch('/api/notifications/unread-count', { headers: { 'X-User-Email': userEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setUnreadCount(Number(data.unread_count || 0))
    } catch (_) {
      setUnreadCount(0)
    }
  }

  async function loadNotifications() {
    if (!userEmail) { setNotifications([]); return { results: [], unread: 0 } }
    try {
      const r = await fetch('/api/notifications', { headers: { 'X-User-Email': userEmail } })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      const results = Array.isArray(data.results) ? data.results : []
      const unread = Number(data.unread_count || 0)
      setNotifications(results)
      setUnreadCount(unread)
      return { results, unread }
    } catch (_) {
      setNotifications([])
      return { results: [], unread: 0 }
    }
  }

  useEffect(() => {
    loadUnread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail])

  async function markAllRead() {
    if (!userEmail) return
    const unread = notifications.filter(n => !n.is_read)
    for (const n of unread) {
      try {
        await fetch(`/api/notifications/${n.id}/read`, {
          method: 'POST',
          headers: { 'X-User-Email': userEmail }
        })
      } catch (_) {}
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
    setUnreadCount(0)
  }

  // Auto-mark as read when opening the dropdown
  async function toggleNotif() {
    const next = !notifOpen
    setNotifOpen(next)
    if (next) {
      const { results } = await loadNotifications()
      if (userEmail && Array.isArray(results) && results.length) {
        const unreadItems = results.filter(n => !n.is_read)
        if (unreadItems.length) {
          try {
            await Promise.all(
              unreadItems.map(n =>
                fetch(`/api/notifications/${n.id}/read`, {
                  method: 'POST',
                  headers: { 'X-User-Email': userEmail }
                }).catch(() => {})
              )
            )
          } catch (_) {}
          setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
          setUnreadCount(0)
        }
      }
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!notifOpen) return
    function onDocMouseDown(e) {
      const panel = notifPanelRef.current
      const btn = notifBtnRef.current
      const target = e.target
      if (panel && panel.contains(target)) return
      if (btn && btn.contains(target)) return
      setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
    }
  }, [notifOpen])

  async function handleNotificationClick(n) {
    if (!userEmail) return
    const type = String(n.type || '').toLowerCase()
    const listingId = n.listing_id
    let dest = null
    if (type === 'pending' && listingId) {
      dest = `/payment/${listingId}`
    } else if (type === 'approved' && listingId) {
      dest = `/listing/${listingId}`
    }
    try {
      await fetch(`/api/notifications/${n.id}/read`, {
        method: 'POST',
        headers: { 'X-User-Email': userEmail }
      })
    } catch (_) {}
    setNotifications(prev => prev.map(x => x.id === n.id ? ({ ...x, is_read: 1 }) : x))
    setUnreadCount(c => c - (n.is_read ? 0 : 1))
    setNotifOpen(false)
    if (dest) navigate(dest)
  }

  return (
    <div className="app light">
      <header className="topbar" style={{ position: 'sticky' }}>
        <div className="topbar-left">
          {!isHome && (
            <button
              className="back-btn"
              type="button"
              aria-label="Back"
              onClick={() => navigate(-1)}
              title="Back"
            >
              ‹
            </button>
          )}
          <div className="brand">
            <Link to="/">Ganudenu</Link>
            <span className="domain">Marketplace</span>
          </div>
        </div>
        <nav className="nav" style={{ alignItems: 'center', gap: 10 }}>
          <Link to="/">Home</Link>
          <Link to="/new">Sell</Link>
          <Link to="/jobs">Jobs</Link>
          <Link to="/my-ads">My Ads</Link>
          <Link to="/account">Account</Link>

          {/* Bell icon for notifications (only visible when logged in) */}
          {userEmail ? (
            <div style={{ position: 'relative' }}>
              <button
                ref={notifBtnRef}
                className="back-btn"
                type="button"
                aria-label="Notifications"
                title="Notifications"
                onClick={toggleNotif}
              >
                🔔
              </button>
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 16,
                    height: 16,
                    borderRadius: '999px',
                    background: '#ef4444',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    boxShadow: '0 0 0 2px rgba(10,12,18,0.9)'
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
          ) : null}
        </nav>

        {/* Dropdown panel */}
        {notifOpen && (
          <div ref={notifPanelRef} style={{ position: 'absolute', top: 62, right: 14, zIndex: 20 }}>
            <div className="card" style={{ width: 340, maxHeight: 420, overflow: 'auto' }}>
              <div className="h2" style={{ marginTop: 0 }}>Notifications</div>
              {notifications.length === 0 && <p className="text-muted">No notifications.</p>}
              {notifications.map(n => (
                <div
                  key={n.id}
                  className="card"
                  onClick={() => handleNotificationClick(n)}
                  style={{ marginBottom: 8, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong>{n.title}</strong>
                    {!n.is_read && <span className="pill" style={{ background: 'rgba(108,127,247,0.15)', borderColor: 'transparent', color: '#c9d1ff' }}>New</span>}
                  </div>
                  <div className="text-muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.message}</div>
                  <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                    {new Date(n.created_at).toLocaleString()}
                    {n.target_email ? <span> • to {n.target_email}</span> : <span> • to All</span>}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={() => setNotifOpen(false)}>Close</button>
                <button className="btn" onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</button>
              </div>
            </div>
          </div>
        )}
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/listing/:id" element={<ViewListingPage />} />
          <Route path="/new" element={<NewListingPage />} />
          <Route path="/verify" element={<VerifyListingPage />} />
          <Route path="/verify-employee" element={<VerifyEmployeePage />} />
          <Route path="/janithmanodya" element={<AdminPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/my-ads" element={<MyAdsPage />} />
          <Route path="/jobs" element={<JobPortalPage />} />
          <Route path="/jobs/search" element={<JobSearchResultsPage />} />
          <Route path="/jobs/post-employee" element={<PostEmployeeAdPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/policy" element={<PolicyPage />} />
          <Route path="/payment/:id" element={<PaymentPendingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%' }}>
          <small>© {new Date().getFullYear()} Ganudenu Marketplace</small>
          <Link to="/policy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Service Policy</Link>
        </div>
      </footer>
    </div>
  )
}