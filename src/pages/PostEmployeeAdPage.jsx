import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay.jsx'

export default function PostEmployeeAdPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [targetTitle, setTargetTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [location, setLocation] = useState('')
  const [images, setImages] = useState([null, null]) // 2 image slots
  const [status, setStatus] = useState(null)
  const [processing, setProcessing] = useState(false)

  // If an employee profile already exists, show management UI instead of the form
  const [existingProfile, setExistingProfile] = useState(null)
  const [checkingExisting, setCheckingExisting] = useState(true)

  const hiddenFileInput = useRef(null)
  const pendingSlotRef = useRef(null)

  function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }

  function buildAuthHeaders() {
    const user = getUser()
    const token = localStorage.getItem('auth_token')
    if (token) return { Authorization: `Bearer ${token}` }
    if (user?.email) return { 'X-User-Email': user.email }
    return {}
  }

  // Heuristic to detect a talent profile listing
  function isTalentProfile(item) {
    try {
      if (String(item.title || '').includes(' • ')) return true
      const sj = JSON.parse(item.structured_json || '{}')
      const hasSkills = !!(sj.skills && ((Array.isArray(sj.skills) && sj.skills.length) || (typeof sj.skills === 'string' && sj.skills.trim())))
      const hasCompany = !!(sj.company && String(sj.company).trim())
      const hasEmploymentType = !!(sj.employment_type && String(sj.employment_type).trim())
      if (hasSkills && !hasCompany && !hasEmploymentType) return true
      if (sj.is_talent === true || sj.type === 'candidate') return true
    } catch (_) {}
    return false
  }

  useEffect(() => {
    async function checkExisting() {
      try {
        const user = getUser()
        if (!user?.email) { setCheckingExisting(false); return }
        const r = await fetch('/api/listings/my', { headers: buildAuthHeaders() })
        const data = await r.json().catch(() => ({}))
        if (r.ok && Array.isArray(data.results)) {
          // Prefer explicit server flag if present, else heuristic
          const found = data.results.find(x => (x.employee_profile === 1 || x.employee_profile === true) || (String(x.main_category || '') === 'Job' && isTalentProfile(x)))
          if (found) setExistingProfile(found)
        }
      } catch (_) {
        // ignore
      } finally {
        setCheckingExisting(false)
      }
    }
    checkExisting()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  function makeSlug(s) {
    const base = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return base || 'listing'
  }

  async function handleDeleteExisting(id) {
    const user = getUser()
    if (!user?.email) { alert('Please login first.'); return }
    const ok = window.confirm('Delete your Employee Profile? This cannot be undone.')
    if (!ok) return
    try {
      const r = await fetch(`/api/listings/${id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders()
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || 'Delete failed')
      setExistingProfile(null)
      setStatus('Profile deleted. You can create a new one now.')
    } catch (e) {
      alert(e.message || 'Failed to delete')
    }
  }

  async function submit(e) {
    e.preventDefault()
    // Require login to enforce one-profile-per-email on server
    let userEmail = ''
    try {
      const user = getUser()
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
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      if (location && location.trim()) fd.append('location', location.trim())
      for (const img of selectedImages) fd.append('images', img)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to process resume images.')
        return
      }
      // Small UX delay to show the processing overlay before navigate
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 900)
    } catch (e) {
      setProcessing(false)
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
      {processing && <LoadingOverlay message="Processing resume..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingProfile ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You already have an Employee Profile. You can view or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingProfile.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Status: {existingProfile.status} {existingProfile.location ? `• ${existingProfile.location}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    const slug = makeSlug(existingProfile.title)
                    navigate(`/listing/${existingProfile.id}-${slug}`)
                  }}
                >
                  Open Profile
                </button>
                <button className="btn" type="button" onClick={() => navigate('/my-ads')}>Manage in My Ads</button>
                <button className="btn" type="button" onClick={() => handleDeleteExisting(existingProfile.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Profile
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted">
              Upload 1–2 images of your resume (minimum 1).
              This feature is completely free. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
              <div>
                <div className="h2" style={{ marginTop: 0 }}>Resume Images</div>
                <ImageSlots />
              </div>
              <div>
                <button className="btn primary" type="submit" disabled={processing}>Continue</button>
              </div>
            </form>
          </>
        )}
        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>
    </div>
  )
}
