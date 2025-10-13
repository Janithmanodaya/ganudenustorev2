import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function MyAdsPage() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
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
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      }
    }
    load()
  }, [])

  return (
    <div className="center">
      <div className="card">
        <div className="h1">My Ads</div>
        {status && <p className="text-muted">{status}</p>}
        <div className="grid three" style={{ marginTop: 12 }}>
          {items.map(item => {
            let expires = ''
            if (item.valid_until) {
              const diff = new Date(item.valid_until).getTime() - Date.now()
              const days = Math.max(0, Math.ceil(diff / (1000*60*60*24)))
              expires = `Expires in ${days} day${days === 1 ? '' : 's'}`
            }
            const imgs = Array.isArray(item.small_images) ? item.small_images : []
            const hero = imgs.length ? imgs[0] : (item.thumbnail_url || null)

            return (
              <div
                key={item.id}
                className="card"
                onClick={() => navigate(`/listing/${item.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {hero && (
                  <img src={hero} alt={item.title} style={{ width: '100%', borderRadius: 8, marginBottom: 8, objectFit: 'cover' }} />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div className="h2" style={{ margin: '6px 0' }}>{item.title}</div>
                  {item.price != null && (
                    <div className="h2" style={{ margin: '6px 0', whiteSpace: 'nowrap' }}>
                      {`LKR ${Number(item.price).toLocaleString('en-US')}`}
                    </div>
                  )}
                </div>
                <div className="text-muted" style={{ marginBottom: 6 }}>
                  {item.status} • {item.location || 'N/A'}
                  {item.pricing_type ? ` • ${item.pricing_type}` : ''}
                  {expires ? ` • ${expires}` : ''}
                </div>
              </div>
            )
          })}
          {items.length === 0 && !status && (
            <p className="text-muted">You have no ads yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}