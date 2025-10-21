import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import CustomSelect from '../components/CustomSelect.jsx'

const JOB_SUBCATEGORIES = [
  'IT/Software',
  'Accounting/Finance',
  'Sales/Marketing',
  'Customer Service',
  'Administration',
  'HR/Recruitment',
  'Education/Training',
  'Healthcare',
  'Construction/Trades',
  'Logistics/Delivery',
  'Driver',
  'Security',
  'Cleaning/Housekeeping',
  'Hospitality/Food',
  'Design/Creative',
  'Legal',
  'Other'
]

export default function PostEmployeeAdPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [targetTitle, setTargetTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [status, setStatus] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [customSubCategory, setCustomSubCategory] = useState('')
  const [subListVersion, setSubListVersion] = useState(0)

  const jobOptions = React.useMemo(() => {
    let custom = []
    try { custom = JSON.parse(localStorage.getItem('job_subcategories_custom') || '[]') } catch (_) { custom = [] }
    const base = JOB_SUBCATEGORIES.filter(v => v !== 'Other')
    const merged = [...base]
    const lowSet = new Set(base.map(s => String(s).toLowerCase()))
    for (const s of custom) {
      const t = String(s || '').trim()
      if (t && !lowSet.has(t.toLowerCase()) && t.toLowerCase() !== 'other') {
        merged.push(t)
      }
    }
    merged.push('Other')
    return merged
  }, [subListVersion])

  function addCustomSubcategory(val) {
    const t = String(val || '').trim()
    if (!t) return
    const inBase = JOB_SUBCATEGORIES.some(x => String(x).toLowerCase() === t.toLowerCase())
    let arr = []
    try { arr = JSON.parse(localStorage.getItem('job_subcategories_custom') || '[]') } catch (_) { arr = [] }
    const exists = arr.some(x => String(x).toLowerCase() === t.toLowerCase())
    if (!exists && !inBase && t.toLowerCase() !== 'other') {
      arr.push(t)
      try { localStorage.setItem('job_subcategories_custom', JSON.stringify(arr)) } catch (_) {}
      setSubListVersion(v => v + 1)
    }
  }

  // If an employee profile or draft already exists, show management UI instead of the form
  const [existingDraft, setExistingDraft] = useState(null)
  const [existingProfile, setExistingProfile] = useState(null)
  const [checkingExisting, setCheckingExisting] = useState(true)

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
        // Check for existing draft first
        try {
          const rd = await fetch('/api/listings/my-drafts?employee_profile=1', { headers: buildAuthHeaders() })
          const dd = await rd.json().catch(() => ({}))
          if (rd.ok && Array.isArray(dd.results) && dd.results.length > 0) {
            setExistingDraft(dd.results[0])
            return
          }
        } catch (_) {}
        // Then check for an active/pending profile
        const r = await fetch('/api/listings/my', { headers: buildAuthHeaders() })
        const data = await r.json().catch(() => ({}))
        if (r.ok && Array.isArray(data.results)) {
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

  async function handleDeleteDraft(id) {
    const user = getUser()
    if (!user?.email) { alert('Please login first.'); return }
    const ok = window.confirm('Delete your Employee Profile draft? This cannot be undone.')
    if (!ok) return
    try {
      const r = await fetch(`/api/listings/draft/${id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders()
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || 'Delete failed')
      setExistingDraft(null)
      setStatus('Draft deleted. You can create a new one now.')
    } catch (e) {
      alert(e.message || 'Failed to delete draft')
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
    if (!location.trim()) {
      setStatus('Location is required.')
      return
    }
    const phoneVal = phone.trim()
    if (!new RegExp('^\\+94\\d{9}
    let sub = String(subCategory || '').trim()
    if (!sub) {
      setStatus('Please select a Job sub-category or type your own.')
      return
    }
    if (sub === 'Other') {
      const typed = String(customSubCategory || '').trim()
      if (!typed) {
        setStatus('Please type your Job sub-category.')
        return
      }
      sub = typed
    }

    try {
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('location', location.trim())
      fd.append('phone', phoneVal)
      fd.append('sub_category', sub)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to create draft.')
        return
      }
      addCustomSubcategory(sub)
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 400)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      {processing && <LoadingOverlay message="Saving your profile..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingDraft ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You have an Employee Profile draft. You can continue or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingDraft.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Created: {existingDraft.created_at ? new Date(existingDraft.created_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navigate(`/verify-employee?draftId=${encodeURIComponent(existingDraft.id)}`)}
                >
                  Continue to Review & Publish
                </button>
                <button className="btn" type="button" onClick={() => handleDeleteDraft(existingDraft.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Draft
                </button>
              </div>
            </div>
          </>
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
              Create your profile manually. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <input className="input" placeholder="Contact phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                <CustomSelect
                  value={subCategory}
                  onChange={v => setSubCategory(v)}
                  ariaLabel="Job sub-category"
                  placeholder="Select or type a sub-category"
                  options={jobOptions.map(v => ({ value: v, label: v }))}
                  searchable={true}
                  allowCustom={true}
                />
                {String(subCategory) === 'Other' && (
                  <input
                    className="input"
                    placeholder="Type your Job sub-category"
                    value={customSubCategory}
                    onChange={e => setCustomSubCategory(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
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
).test(phoneVal)) {
      setStatus('Phone must be in +94XXXXXXXXX format.')
      return
    }
    let sub = String(subCategory || '').trim()
    if (!sub) {
      setStatus('Please select a Job sub-category or type your own.')
      return
    }
    if (sub === 'Other') {
      const typed = String(customSubCategory || '').trim()
      if (!typed) {
        setStatus('Please type your Job sub-category.')
        return
      }
      sub = typed
    }

    try {
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('location', location.trim())
      fd.append('phone', phoneVal)
      fd.append('sub_category', sub)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to create draft.')
        return
      }
      addCustomSubcategory(sub)
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 400)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      {processing && <LoadingOverlay message="Saving your profile..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingDraft ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You have an Employee Profile draft. You can continue or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingDraft.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Created: {existingDraft.created_at ? new Date(existingDraft.created_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navigate(`/verify-employee?draftId=${encodeURIComponent(existingDraft.id)}`)}
                >
                  Continue to Review & Publish
                </button>
                <button className="btn" type="button" onClick={() => handleDeleteDraft(existingDraft.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Draft
                </button>
              </div>
            </div>
          </>
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
              Create your profile manually. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <input className="input" placeholder="Contact phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                <CustomSelect
                  value={subCategory}
                  onChange={v => setSubCategory(v)}
                  ariaLabel="Job sub-category"
                  placeholder="Select or type a sub-category"
                  options={jobOptions.map(v => ({ value: v, label: v }))}
                  searchable={true}
                  allowCustom={true}
                />
                {String(subCategory) === 'Other' && (
                  <input
                    className="input"
                    placeholder="Type your Job sub-category"
                    value={customSubCategory}
                    onChange={e => setCustomSubCategory(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
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
).test(phoneVal)) {
      setStatus('Phone must be in +94XXXXXXXXX format.')
      return
    }
    let sub = String(subCategory || '').trim()
    if (!sub) {
      setStatus('Please select a Job sub-category or type your own.')
      return
    }
    if (sub === 'Other') {
      const typed = String(customSubCategory || '').trim()
      if (!typed) {
        setStatus('Please type your Job sub-category.')
        return
      }
      sub = typed
    }

    try {
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('location', location.trim())
      fd.append('phone', phoneVal)
      fd.append('sub_category', sub)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to create draft.')
        return
      }
      addCustomSubcategory(sub)
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 400)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      {processing && <LoadingOverlay message="Saving your profile..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingDraft ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You have an Employee Profile draft. You can continue or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingDraft.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Created: {existingDraft.created_at ? new Date(existingDraft.created_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navigate(`/verify-employee?draftId=${encodeURIComponent(existingDraft.id)}`)}
                >
                  Continue to Review & Publish
                </button>
                <button className="btn" type="button" onClick={() => handleDeleteDraft(existingDraft.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Draft
                </button>
              </div>
            </div>
          </>
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
              Create your profile manually. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <input className="input" placeholder="Contact phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                <CustomSelect
                  value={subCategory}
                  onChange={v => setSubCategory(v)}
                  ariaLabel="Job sub-category"
                  placeholder="Select or type a sub-category"
                  options={jobOptions.map(v => ({ value: v, label: v }))}
                  searchable={true}
                  allowCustom={true}
                />
                {String(subCategory) === 'Other' && (
                  <input
                    className="input"
                    placeholder="Type your Job sub-category"
                    value={customSubCategory}
                    onChange={e => setCustomSubCategory(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
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
).test(phoneVal)) {
      setStatus('Phone must be in +94XXXXXXXXX format.')
      return
    }
    let sub = String(subCategory || '').trim()
    if (!sub) {
      setStatus('Please select a Job sub-category or type your own.')
      return
    }
    if (sub === 'Other') {
      const typed = String(customSubCategory || '').trim()
      if (!typed) {
        setStatus('Please type your Job sub-category.')
        return
      }
      sub = typed
    }

    try {
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('location', location.trim())
      fd.append('phone', phoneVal)
      fd.append('sub_category', sub)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to create draft.')
        return
      }
      addCustomSubcategory(sub)
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 400)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      {processing && <LoadingOverlay message="Saving your profile..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingDraft ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You have an Employee Profile draft. You can continue or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingDraft.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Created: {existingDraft.created_at ? new Date(existingDraft.created_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navigate(`/verify-employee?draftId=${encodeURIComponent(existingDraft.id)}`)}
                >
                  Continue to Review & Publish
                </button>
                <button className="btn" type="button" onClick={() => handleDeleteDraft(existingDraft.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Draft
                </button>
              </div>
            </div>
          </>
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
              Create your profile manually. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <input className="input" placeholder="Contact phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                <CustomSelect
                  value={subCategory}
                  onChange={v => setSubCategory(v)}
                  ariaLabel="Job sub-category"
                  placeholder="Select or type a sub-category"
                  options={jobOptions.map(v => ({ value: v, label: v }))}
                  searchable={true}
                  allowCustom={true}
                />
                {String(subCategory) === 'Other' && (
                  <input
                    className="input"
                    placeholder="Type your Job sub-category"
                    value={customSubCategory}
                    onChange={e => setCustomSubCategory(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
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
    let sub = String(subCategory || '').trim()
    if (!sub) {
      setStatus('Please select a Job sub-category or type your own.')
      return
    }
    if (sub === 'Other') {
      const typed = String(customSubCategory || '').trim()
      if (!typed) {
        setStatus('Please type your Job sub-category.')
        return
      }
      sub = typed
    }

    try {
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('location', location.trim())
      fd.append('phone', phoneVal)
      fd.append('sub_category', sub)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to create draft.')
        return
      }
      addCustomSubcategory(sub)
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 400)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      {processing && <LoadingOverlay message="Saving your profile..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingDraft ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You have an Employee Profile draft. You can continue or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingDraft.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Created: {existingDraft.created_at ? new Date(existingDraft.created_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navigate(`/verify-employee?draftId=${encodeURIComponent(existingDraft.id)}`)}
                >
                  Continue to Review & Publish
                </button>
                <button className="btn" type="button" onClick={() => handleDeleteDraft(existingDraft.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Draft
                </button>
              </div>
            </div>
          </>
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
              Create your profile manually. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <input className="input" placeholder="Contact phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                <CustomSelect
                  value={subCategory}
                  onChange={v => setSubCategory(v)}
                  ariaLabel="Job sub-category"
                  placeholder="Select or type a sub-category"
                  options={jobOptions.map(v => ({ value: v, label: v }))}
                  searchable={true}
                  allowCustom={true}
                />
                {String(subCategory) === 'Other' && (
                  <input
                    className="input"
                    placeholder="Type your Job sub-category"
                    value={customSubCategory}
                    onChange={e => setCustomSubCategory(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
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
).test(phoneVal)) {
      setStatus('Phone must be in +94XXXXXXXXX format.')
      return
    }
    let sub = String(subCategory || '').trim()
    if (!sub) {
      setStatus('Please select a Job sub-category or type your own.')
      return
    }
    if (sub === 'Other') {
      const typed = String(customSubCategory || '').trim()
      if (!typed) {
        setStatus('Please type your Job sub-category.')
        return
      }
      sub = typed
    }

    try {
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('location', location.trim())
      fd.append('phone', phoneVal)
      fd.append('sub_category', sub)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to create draft.')
        return
      }
      addCustomSubcategory(sub)
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 400)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      {processing && <LoadingOverlay message="Saving your profile..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingDraft ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You have an Employee Profile draft. You can continue or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingDraft.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Created: {existingDraft.created_at ? new Date(existingDraft.created_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navigate(`/verify-employee?draftId=${encodeURIComponent(existingDraft.id)}`)}
                >
                  Continue to Review & Publish
                </button>
                <button className="btn" type="button" onClick={() => handleDeleteDraft(existingDraft.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Draft
                </button>
              </div>
            </div>
          </>
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
              Create your profile manually. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <input className="input" placeholder="Contact phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                <CustomSelect
                  value={subCategory}
                  onChange={v => setSubCategory(v)}
                  ariaLabel="Job sub-category"
                  placeholder="Select or type a sub-category"
                  options={jobOptions.map(v => ({ value: v, label: v }))}
                  searchable={true}
                  allowCustom={true}
                />
                {String(subCategory) === 'Other' && (
                  <input
                    className="input"
                    placeholder="Type your Job sub-category"
                    value={customSubCategory}
                    onChange={e => setCustomSubCategory(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
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
).test(phoneVal)) {
      setStatus('Phone must be in +94XXXXXXXXX format.')
      return
    }
    let sub = String(subCategory || '').trim()
    if (!sub) {
      setStatus('Please select a Job sub-category or type your own.')
      return
    }
    if (sub === 'Other') {
      const typed = String(customSubCategory || '').trim()
      if (!typed) {
        setStatus('Please type your Job sub-category.')
        return
      }
      sub = typed
    }

    try {
      setProcessing(true)
      setStatus(null)
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('location', location.trim())
      fd.append('phone', phoneVal)
      fd.append('sub_category', sub)
      const r = await fetch('/api/jobs/employee/draft', {
        method: 'POST',
        headers: { 'X-User-Email': userEmail },
        body: fd
      })
      const data = await r.json()
      if (!r.ok) {
        setProcessing(false)
        setStatus(data.error || 'Failed to create draft.')
        return
      }
      addCustomSubcategory(sub)
      setTimeout(() => {
        navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
      }, 400)
    } catch (e) {
      setProcessing(false)
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      {processing && <LoadingOverlay message="Saving your profile..." />}
      <div className="card">
        <div className="h1">Post Employee Profile (Free)</div>
        {checkingExisting ? (
          <p className="text-muted">Checking for an existing profile...</p>
        ) : existingDraft ? (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>
              You have an Employee Profile draft. You can continue or delete it below.
            </p>
            <div className="card">
              <div className="h2" style={{ marginTop: 0 }}>{existingDraft.title}</div>
              <div className="text-muted" style={{ marginBottom: 6 }}>
                Created: {existingDraft.created_at ? new Date(existingDraft.created_at).toLocaleString() : '—'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => navigate(`/verify-employee?draftId=${encodeURIComponent(existingDraft.id)}`)}
                >
                  Continue to Review & Publish
                </button>
                <button className="btn" type="button" onClick={() => handleDeleteDraft(existingDraft.id)} style={{ background: '#f44336', color: '#fff' }}>
                  Delete Draft
                </button>
              </div>
            </div>
          </>
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
              Create your profile manually. One profile per email. Profiles expire after 3 months.
            </p>
            <form onSubmit={submit} className="grid two">
              <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
              <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
              <input className="input" placeholder="Location (e.g., Colombo)" value={location} onChange={e => setLocation(e.target.value)} />
              <input className="input" placeholder="Contact phone (+94XXXXXXXXX)" value={phone} onChange={e => setPhone(e.target.value)} />
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                <CustomSelect
                  value={subCategory}
                  onChange={v => setSubCategory(v)}
                  ariaLabel="Job sub-category"
                  placeholder="Select or type a sub-category"
                  options={jobOptions.map(v => ({ value: v, label: v }))}
                  searchable={true}
                  allowCustom={true}
                />
                {String(subCategory) === 'Other' && (
                  <input
                    className="input"
                    placeholder="Type your Job sub-category"
                    value={customSubCategory}
                    onChange={e => setCustomSubCategory(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>
              <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
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
