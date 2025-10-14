import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal.jsx'

export default function MyAdsPage() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState(null)
  const [rejectModal, setRejectModal] = useState({ open: false, reason: '', title: '' })
  const navigate = useNavigate()

  async function refresh() {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (!user?.email) {
        setStatus('Please login to view your ads.')
        return
      }
      const r = await fetch('/api/listings/my', {
        headers: { 'X-User-Email': user.email }
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load')
      setItems(data.results || [])
      setStatus(null)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(e, id) {
    e.stopPropagation()
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (!user?.email) {
      alert('Please login first.')
      return
    }
    const ok = window.confirm('Are you sure you want to delete this ad? This cannot be undone.')
    if (!ok) return
    try {
      const r = await fetch(`/api/listings/${id}`, {
        method: 'DELETE',
        headers: { 'X-User-Email': user.email }
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Delete failed')
      // Remove item from state
      setItems(prev => prev.filter(x => x.id !== id))
    } catch (err) {
      alert(err.message || 'Failed to delete')
    }
  }

  function handleCardClick(item) {
    const st = String(item.status || '').toLowerCase()
    if (st.includes('pending')) {
      navigate(`/payment/${item.id}`)
    } else if (st.includes('approved')) {
      navigate(`/listing/${item.id}`)
    } else if (st.includes('reject')) {
      const reason = String(item.reject_reason || '').trim()
      setRejectModal({ open: true, reason: reason || 'No reason provided.', title: item.title || 'Rejected Ad' })
    } else {
      navigate(`/listing/${item.id}`)
    }
  }

  function renderCard(item) {
    let expires = ''
    if (item.valid_until) {
      const diff = new Date(item.valid_until).getTime() - Date.now()
      const days = Math.max(0, Math.ceil(diff / (1000*60*60*24)))
      expires = `Expires in ${days} day${days === 1 ? '' : 's'}`
    }
    const imgs = Array.isArray(item.small_images) ? item.small_images : []
    const hero = imgs.length ? imgs[0] : (item.thumbnail_url || null)
    const st = String(item.status || '')
    const badgeColor =
      st === 'Approved' ? '#16a34a' :
      st.includes('Pending') ? '#f59e0b' :
      st === 'Rejected' ? '#ef4444' : '#6b7280'

    return (
      <div
        key={item.id}
        className="card"
        onClick={() => handleCardClick(item)}
        style={{ cursor: 'pointer', position: 'relative' }}
      >
        {hero && (
          <img src={hero} alt={item.title} style={{ width: '100%', borderRadius: 8, marginBottom: 8, objectFit: 'cover' }} />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div className="h2" style={{ margin: '6px 0' }}>{item.title}</div>
          {item.price != null && (
            <div className="price-chip" style={{ margin: '6px 0', whiteSpace: 'nowrap', fontSize: 14 }}>
              {`LKR ${Number(item.price).toLocaleString('en-US')}`}
            </div>
          )}
        </div>
        <div className="text-muted" style={{ marginBottom: 6 }}>
          <span className="pill" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'transparent', color: '#cbd5e1' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: badgeColor, display: 'inline-block' }} /> {st}
          </span>
          {' '}• {item.location || 'N/A'}
          {item.pricing_type ? ` • ${item.pricing_type}` : ''}
          {expires ? ` • ${expires}` : ''}
        </div>
        {st === 'Rejected' && item.reject_reason ? (
          <div className="card" style={{ background: 'rgba(239,68,68,0.08)', borderColor: '#ef44441a' }}>
            <strong>Reject Reason:</strong>
            <div className="text-muted" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{item.reject_reason}</div>
          </div>
        ) : null}
        <button
          onClick={(e) => handleDelete(e, item.id)}
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            background: '#f44336',
            color: 'white',
            border: 'none',
            padding: '6px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          Delete
        </button>
      </div>
    )
  }

  const pending = items.filter(x => String(x.status).toLowerCase().includes('pending'))
  const approved = items.filter(x => String(x.status).toLowerCase().includes('approved'))
  const rejected = items.filter(x => String(x.status).toLowerCase().includes('reject'))

  return (
    <div className="center">
      <div className="card">
        <div className="h1">My Ads</div>
        {status && <p className="text-muted">{status}</p>}

        <div className="card" style={{ marginTop: 8 }}>
          <div className="h2" style={{ marginTop: 0 }}>Pending Approval</div>
          <p className="text-muted" style={{ marginTop: 4 }}>Click a pending ad to go to the payment page and complete publishing.</p>
          <div className="grid three" style={{ marginTop: 12 }}>
            {pending.map(renderCard)}
            {pending.length === 0 && <p className="text-muted">No pending ads.</p>}
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="h2" style={{ marginTop: 0 }}>Approved</div>
          <p className="text-muted" style={{ marginTop: 4 }}>Click an approved ad to view the live listing.</p>
          <div className="grid three" style={{ marginTop: 12 }}>
            {approved.map(renderCard)}
            {approved.length === 0 && <p className="text-muted">No approved ads.</p>}
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="h2" style={{ marginTop: 0 }}>Rejected</div>
          <p className="text-muted" style={{ marginTop: 4 }}>Click a rejected ad to see the reason.</p>
          <div className="grid three" style={{ marginTop: 12 }}>
            {rejected.map(renderCard)}
            {rejected.length === 0 && <p className="text-muted">No rejected ads.</p>}
          </div>
        </div>
      </div>

      <Modal
        open={rejectModal.open}
        title={rejectModal.title}
        onClose={() => setRejectModal({ open: false, reason: '', title: '' })}
      >
        <div className="card" style={{ background: 'rgba(239,68,68,0.08)', borderColor: '#ef44441a' }}>
          <strong>Reject Reason</strong>
          <div className="text-muted" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{rejectModal.reason}</div>
        </div>
      </Modal>
    </div>
  )
}