import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function PostEmployeeAdPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [targetTitle, setTargetTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [images, setImages] = useState([null, null]) // 2 image slots
  const [status, setStatus] = useState(null)
  const hiddenFileInput = useRef(null)
  const pendingSlotRef = useRef(null)

  function openPickerForSlot(index) {
    pendingSlotRef.current = index
    hiddenFileInput.current?.click()
  }

  function onHiddenFileChange(e) {
    const file = (e.target.files && e.target.files[0]) || null
    e.target.value = ''
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      setStatus('Only image files are allowed.')
      return
    }
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

  async function submit(e) {
    e.preventDefault()
    // Require login to enforce one-profile-per-email on server
    let userEmail = ''
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      userEmail = user?.email || ''
    } catch (_) {}
    if (!userEmail) {
      setStatus('Please login to continue.')
      return
    }

    if (!name.trim() || !targetTitle.trim() || !summary.trim()) {
      setStatus('Name, Target Title, and Summary are required.')
      return
    }
    const selectedImages = images.filter(Boolean)
    if (selectedImages.length < 1) {
      setStatus('At least 1 resume image is required.')
      return
    }

    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      for (const img of selectedImages) fd.append('images', img)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setStatus(data.error || 'Failed to process resume images.')
        return
      }
      navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
    } catch (e) {
      setStatus('Network error.')
    }
  }

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
        <div className="grid two" style={{ gap: 10 }}>
          {images.map((file, i) => {
            const hasFile = !!file
            const url = hasFile ? URL.createObjectURL(file) : null
            return (
              <div
                key={i}
                className="card"
                style={{ padding: 0, position: 'relative', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={() => openPickerForSlot(i)}
              >
                {hasFile ? (
                  <>
                    <img
                      src={url}
                      alt={`resume-image-${i + 1}`}
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
          {images.filter(Boolean).length}/2 selected
        </div>
      </div>
    )
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Post Employee Profile</div>
        <p className="text-muted">
          Upload 1–2 images of your resume (minimum 1). Avoid heavy compression that makes text unreadable.
          This feature is completely free. One profile per email. Profiles expire after 3 months.
        </p>
        <form onSubmit={submit} className="grid two">
          <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
          <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
          <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
          <div>
            <div className="h2" style={{ marginTop: 0 }}>Resume Images</div>
            <ImageSlots />
          </div>
          <div>
            <button className="btn primary" type="submit">Continue</button>
          </div>
        </form>
        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>
    </div>
  )
}