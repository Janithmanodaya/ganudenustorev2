import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function EditTalentProfilePage() {
  const [sp] = useSearchParams()
  const listingId = Number(sp.get('listingId') || '0')
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const [displayName, setDisplayName] = useState('')
  const [headline, setHeadline] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [school, setSchool] = useState('')
  const [university, setUniversity] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [experience, setExperience] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [talentHandle, setTalentHandle] = useState('')

  useEffect(() => {
    async function load() {
      if (!listingId) { setStatus('Missing listingId'); setLoading(false); return }
      try {
        setLoading(true)
        const r = await fetch(`/api/listings/${listingId}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load profile')
        setProfile(data)
        // Parse
        const t = String(data.title || '')
        if (t.includes(' • ')) {
          const [n, h] = t.split(' • ', 2)
          setDisplayName(n)
          setHeadline(h)
        } else {
          setDisplayName(t)
          setHeadline('')
        }
        const sj = JSON.parse(data.structured_json || '{}')
        setLocation(data.location || sj.location || '')
        setPhone(sj.phone || '')
        setSchool(sj.education?.school || '')
        setUniversity(sj.education?.university || '')
        setQualifications(sj.qualifications || '')
        setExperience(sj.experience || '')
        setProfileUrl(sj.profile_url || '')
        setTalentHandle(data.talent_handle || '')
        setStatus(null)
      } catch (e) {
        setStatus(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [listingId])

  const canSave = useMemo(() => {
    return displayName.trim().length >= 2 && (headline.trim().length >= 2 || true) && location.trim().length >= 2 && phone.trim().length >= 4
  }, [displayName, headline, location, phone])

  async function onSave(e) {
    e.preventDefault()
    if (!profile) return
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      const token = localStorage.getItem('auth_token') || ''
      if (!user?.email || !token) { navigate('/auth'); return }
      setStatus(null)

      const title = `${displayName.trim()}${headline.trim() ? ' • ' + headline.trim() : ''}`
      const sj = {
        ...(JSON.parse(profile.structured_json || '{}') || {}),
        is_talent: true,
        location: location.trim(),
        phone: phone.trim(),
        education: { school: school.trim(), university: university.trim() },
        qualifications: qualifications.trim(),
        experience: experience.trim(),
        profile_url: profileUrl.trim()
      }

      const r = await fetch(`/api/listings/talent/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description: profile.description || '',
          structured_json: JSON.stringify(sj),
          talent_handle: talentHandle
        })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Save failed')
      setStatus('Saved.')
      navigate(`/${encodeURIComponent(talentHandle || profile.talent_handle)}`, { replace: true })
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Edit Talent Profile</div>
        {loading && <p className="text-muted">Loading...</p>}
        {status && !loading && <p className="text-muted">{status}</p>}

        {!loading && profile && (
          <form onSubmit={onSave} className="grid two">
            <input className="input" placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            <input className="input" placeholder="Headline (e.g., React Developer)" value={headline} onChange={e => setHeadline(e.target.value)} />
            <input className="input" placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} />
            <input className="input" placeholder="Phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
            <input className="input" placeholder="School / College (optional)" value={school} onChange={e => setSchool(e.target.value)} />
            <input className="input" placeholder="University (optional)" value={university} onChange={e => setUniversity(e.target.value)} />
            <textarea className="textarea" placeholder="Other qualifications (optional)" value={qualifications} onChange={e => setQualifications(e.target.value)} />
            <textarea className="textarea" placeholder="Experience (optional)" value={experience} onChange={e => setExperience(e.target.value)} />
            <input className="input" placeholder="Personal Website or Profile URL (optional)" value={profileUrl} onChange={e => setProfileUrl(e.target.value)} />
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Profile URL Handle</div>
              <input className="input" placeholder="e.g., janith_manodya" value={talentHandle} onChange={e => setTalentHandle(e.target.value)} />
              <small className="text-muted">Your profile URL: https://ganudenu.store/{talentHandle || 'your_name'}</small>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button className="btn primary" type="submit" disabled={!canSave}>Save</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}