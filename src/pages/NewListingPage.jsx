import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function NewListingPage() {
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const [mainCategory, setMainCategory] = useState('Vehicle')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Store images in fixed-size array of File|null according to maxImages
  const [images, setImages] = useState([])
  const [status, setStatus] = useState(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [processing, setProcessing] = useState(false)

  const hiddenFileInput = useRef(null)
  const pendingSlotRef = useRef(null)

  const maxImages = useMemo(() => {
    if (mainCategory === 'Job') return 1
    if (mainCategory === 'Mobile' || mainCategory === 'Electronic' || mainCategory === 'Home Garden') return 4
    return 5
  }, [mainCategory])

  // Initialize/resize image slots whenever category changes
  useEffect(() => {
    setImages(prev => {
      const arr = Array.from({ length: maxImages }, (_, i) => prev[i] || null)
      return arr
    })
  }, [maxImages])

  // Require login
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (!user || !user.email) {
        setShowAuthPrompt(true)
      }
    } catch (_) {
      setShowAuthPrompt(true)
    }
  }, [])

  // Draft autosave
  useEffect(() => {
    try {
      const raw = localStorage.getItem('new_listing_draft')
      if (raw) {
        const d = JSON.parse(raw)
        if (d && typeof d === 'object') {
          if (d.mainCategory) setMainCategory(d.mainCategory)
          if (d.title) setTitle(d.title)
          if (d.description) setDescription(d.description)
        }
      }
    } catch (_) {}
  }, [])
  useEffect(() => {
    const data = { mainCategory, title, description }
    try { localStorage.setItem('new_listing_draft', JSON.stringify(data)) } catch (_) {}
  }, [mainCategory, title, description])

  useEffect(() => {
    const cat = sp.get('category')
    if (cat && ['Vehicle', 'Property', 'Job', 'Electronic', 'Mobile', 'Home Garden'].includes(cat)) {
      setMainCategory(cat)
    }
  }, [sp])

  function openPickerForSlot(index) {
    pendingSlotRef.current = index
    hiddenFileInput.current?.click()
  }

  function onHiddenFileChange(e) {
    const file = (e.target.files && e.target.files[0]) || null
    e.target.value = ''
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setStatus(`File ${file.name} exceeds 5MB limit.`)
      return
    }
    setStatus(null)

    const idx = pendingSlotRef.current ?? 0
    setImages(prev => {
      const next = [...prev]
      next[idx] = file
      return next
    })
  }

  function clearSlot(index) {
    setImages(prev => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }

  async function onNext(e) {
    e.preventDefault()
    // block when not logged in
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (!user || !user.email) {
        setShowAuthPrompt(true)
        setStatus('Please login to continue.')
        return
      }
    } catch (_) {
      setShowAuthPrompt(true)
      setStatus('Please login to continue.')
      return
    }

    if (!title.trim() || !description.trim()) {
      setStatus('Title and description are required.')
      return
    }
    const selectedImages = images.filter(Boolean)
    if (selectedImages.length < 1) {
      setStatus('At least 1 image is required.')
      return
    }

    try {
      setProcessing(true)
      const fd = new FormData()
      fd.append('main_category', mainCategory)
      fd.append('title', title.trim())
      fd.append('description', description.trim())
      for (const img of selectedImages) fd.append('images', img)

      const user = JSON.parse(localStorage.getItem('user') || 'null')
      const r = await fetch('/api/listings/draft', {
        method: 'POST',
        headers: user?.email ? { 'X-User-Email': user.email } : undefined,
        body: fd
      })
      const ct = r.headers.get('content-type') || ''
      const text = await r.text()
      const data = ct.includes('application/json') && text ? JSON.parse(text) : {}
      if (!r.ok) {
        setProcessing(false)
        setStatus((data && data.error) || 'Failed to create draft.')
        return
      }
      // clear autosave after successful draft
      try { localStorage.removeItem('new_listing_draft') } catch (_) {}
      navigate(`/verify?draftId=${encodeURIComponent(data.draftId)}`)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  const helperText = useMemo(() => {
    if (mainCategory === 'Job') return 'Step 1 • Provide details and 1 company logo/banner image.'
    if (mainCategory === 'Mobile' || mainCategory === 'Electronic' || mainCategory === 'Home Garden') {
      return 'Step 1 • Provide details and up to 4 photos. Continue to review and publish.'
    }
    return 'Step 1 • Provide details and up to 5 photos. Continue to review and publish.'
  }, [mainCategory</]))

  // Render grid of image slots with + for empty
  function ImageSlots() {
    return (
      <div>
        <input
          ref={hiddenFileInput}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onHiddenFileChange}
        />
        <div className="grid five" style={{ gap: 10 }}>
          {images.map((file, i) => {
            const hasFile = !!file
            const url = hasFile ? URL.createObjectURL(file) : null
            return (
              <div key={i} className="card" style={{ padding: 0, position: 'relative', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => openPickerForSlot(i)}>
                {hasFile ? (
                  <>
                    <img
                      src={url}
                      alt={`image-${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
                      onLoad={() => url && URL.revokeObjectURL(url)}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={(e) => { e.stopPropagation(); clearSlot(i) }}
                      style={{ position: 'absolute', top: 6, right: 6 }}
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <div className="text-muted" style={{ fontSize: 28 }}>+</div>
                )}
              </div>
            )
          })}
        </div>
        <div className="text-muted" style={{ marginTop: 6 }}>
          {images.filter(Boolean).length}/{maxImages} selected
        </div>
      </div>
    )
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Create New Listing</div>
        <p className="text-muted">{helperText}</p>

        <form onSubmit={onNext} className="grid two">
          <select id="mainCategory" className="select" value={mainCategory} onChange={e => setMainCategory(e.target.value)}>
            <option>Vehicle</option>
            <option>Property</option>
            <option>Job</option>
            <option>Electronic</option>
            <option>Mobile</option>
            <option>Home Garden</option>
          </select>
          <input id="title" className="input" placeholder="Main Title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea id="description" className="textarea" placeholder="Description (free-form text)" value={description} onChange={e => setDescription(e.target.value)} />

          <div>
            <div className="h2" style={{ marginTop: 0 }}>Photos</div>
            <ImageSlots />
          </div>

          <div>
            <button className="btn primary" type="submit">Continue</button>
          </div>
        </form>

        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>

      {showAuthPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 420 }}>
            <div className="h2">Login required</div>
            <p className="text-muted">You must be logged in to create a listing.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => navigate('/auth')}>Go to Login</button>
              <button className="btn" onClick={() => setShowAuthPrompt(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {processing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div className="h2" style={{ marginTop: 0 }}>Processing your listing</div>
            <p className="text-muted">Extracting details...</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  border: '4px solid rgba(108,127,247,0.2)',
                  borderTopColor: '#6c7ff7',
                  animation: 'spin 1s linear infinite'
                }}
              />
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
    </div>
  )
}