import React, { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function PostEmployeeAdPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [targetTitle, setTargetTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState(null)
  const [images, setImages] = useState([null, null])
  const hiddenInputRef = useRef(null)
  const pendingIndexRef = useRef(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)

  // LinkedIn-like extras
  const [school, setSchool] = useState('')
  const [university, setUniversity] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [experience, setExperience] = useState('')
  const [profileUrl, setProfileUrl] = useState('')

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (!user || !user.email) setShowAuthPrompt(true)
    } catch (_) {
      setShowAuthPrompt(true)
    }
  }, [])

  function openPicker(i) {
    pendingIndexRef.current = i
    hiddenInputRef.current?.click()
  }

  function onPick(e) {
    const file = e.target.files?.[0] || null
    e.target.value = ''
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      setStatus('Only images are allowed.')
      return
    }
    // Soft cap at 4MB to keep text readable when processed further
    if (file.size > 4 * 1024 * 1024) {
      setStatus('Each image must be <= 4MB.')
      return
    }
    setStatus(null)
    const idx = pendingIndexRef.current ?? 0
    setImages(prev => {
      const next = [...prev]
      next[idx] = file
      return next
    })
  }

  function clearSlot(i) {
    setImages(prev => {
      const next = [...prev]
      next[i] = null
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !targetTitle.trim() || !summary.trim()) {
      setStatus('Name, Target Title, and Summary are required.')
      return
    }
    const chosen = images.filter(Boolean)
    if (chosen.length < 1) {
      setStatus('Please upload at least 1 image of your resume.')
      return
    }
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (!user || !user.email) {
        setShowAuthPrompt(true)
        setStatus('Please login to continue.')
        return
      }
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      if (school.trim()) fd.append('school', school.trim())
      if (university.trim()) fd.append('university', university.trim())
      if (qualifications.trim()) fd.append('qualifications', qualifications.trim())
      if (experience.trim()) fd.append('experience', experience.trim())
      if (profileUrl.trim()) fd.append('profile_url', profileUrl.trim())
      for (const img of chosen) fd.append('images', img)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': user.email },
        body: fd
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setStatus(data.error || 'Failed to create draft.')
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
          ref={hiddenInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPick}
        />
        <div className="grid two" style={{ gap: 10 }}>
          {images.map((file, i) => {
            const url = file ? URL.createObjectURL(file) : null
            return (
              <div
                key={i}
                className="card"
                style={{ padding: 0, position: 'relative', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={() => openPicker(i)}
              >
                {file ? (
                  <>
                    <img
                      src={url}
                      alt={`resume-${i + 1}`}
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
          Upload 1–2 clear images of your resume. Avoid heavy compression so text remains readable.
          This feature is completely free. One profile per email.
        </p>
        <form onSubmit={submit} className="grid two">
          <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
          <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
          <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
          <input className="input" placeholder="School / College (optional)" value={school} onChange={e => setSchool(e.target.value)} />
          <input className="input" placeholder="University (optional)" value={university} onChange={e => setUniversity(e.target.value)} />
          <textarea className="textarea" placeholder="Other qualifications (optional)" value={qualifications} onChange={e => setQualifications(e.target.value)} />
          <textarea className="textarea" placeholder="Experience (optional)" value={experience} onChange={e => setExperience(e.target.value)} />
          <input className="input" placeholder="Personal Website or Profile URL (optional)" value={profileUrl} onChange={e => setProfileUrl(e.target.value)} />
          <div>
            <div className="h2" style={{ marginTop: 0 }}>Resume Images (1–2)</div>
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
            <p className="text-muted">You must be logged in to post your employee profile.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={() => navigate('/auth')}>Go to Login</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}