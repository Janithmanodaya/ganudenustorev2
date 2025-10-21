import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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

export default function VerifyEmployeePage() {
  const [sp] = useSearchParams()
  const draftId = sp.get('draftId')
  const [draft, setDraft] = useState(null)
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [seoKeywords, setSeoKeywords] = useState('')
  const [status, setStatus] = useState(null)
  const [submitted, setSubmitted] = useState(null)

  // Publishing essentials
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [description, setDescription] = useState('')

  function getUserEmail() {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null')
      return u?.email || ''
    } catch (_) { return '' }
  }

  useEffect(() => {
    async function load() {
      if (!draftId) return
      try {
        const r = await fetch(`/api/listings/draft/${encodeURIComponent(draftId)}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load draft')
        setDraft(data.draft)
        setSeoTitle(data.draft.seo_title || '')
        setSeoDescription(data.draft.seo_description || '')
        setSeoKeywords(data.draft.seo_keywords || '')
        setDescription(data.draft.description || '')
        try {
          const obj = JSON.parse(data.draft.structured_json || '{}')
          setLocation(String(obj.location || ''))
          setPhone(String(obj.phone || ''))
          setSubCategory(String(obj.sub_category || ''))
        } catch (_) {}
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      }
    }
    load()
  }, [draftId])

  async function submitPost() {
    try {
      // Basic validation required by server
      const loc = String(location || '').trim()
      const ph = String(phone || '').trim()
      const sub = String(subCategory || '').trim()
      const desc = String(description || '').trim()
      if (!sub) { setStatus('Please specify a Job sub-category (e.g., Driver, IT/Software, Sales/Marketing)'); return }
      if (!loc) { setStatus('Location is required'); return }
      if (!/^\+94\d{9}$/.test(ph)) { setStatus('Phone must be in +94XXXXXXXXX format'); return }
      if (!desc || desc.length < 10) { setStatus('Description must be at least 10 characters'); return }

      const obj = { sub_category: sub, location: loc, phone: ph }

      const payload = {
        draftId,
        structured_json: JSON.stringify(obj, null, 2),
        seo_title: seoTitle,
        seo_description: seoDescription,
        seo_keywords: seoKeywords,
        description: desc
      }
      const headers = { 'Content-Type': 'application/json' }
      const email = getUserEmail()
      if (email) headers['X-User-Email'] = email

      const r = await fetch('/api/listings/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to submit')
      setSubmitted(data)
      setStatus('Profile submitted. Status: Pending Approval')
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Review Profile & Publish</div>
        {!draft && <p className="text-muted">Loading profile draft...</p>}

        {draft && (
          <>
            <p className="text-muted">Category: {draft.main_category} • Title: {draft.title}</p>

            <div className="card" style={{ marginTop: 8 }}>
              <div className="h2" style={{ marginTop: 0 }}>Publishing Details</div>
              <div className="grid two">
                <div>
                  <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Job Sub-category</div>
                  <CustomSelect
                    value={subCategory}
                    onChange={v => setSubCategory(v)}
                    ariaLabel="Job sub-category"
                    placeholder="Select or type a sub-category"
                    options={JOB_SUBCATEGORIES.map(v => ({ value: v, label: v }))}
                    searchable={true}
                    allowCustom={true}
                  />
                </div>
                <input
                  className="input"
                  placeholder="Location (e.g., Colombo)"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Contact phone (+94XXXXXXXXX)"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
              <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                Sub-category, location and phone are required to publish.
              </div>
            </div>

            <div className="card" style={{ marginTop: 8 }}>
              <div className="h2" style={{ marginTop: 0 }}>Profile Summary</div>
              <textarea
                className="textarea"
                rows={4}
                placeholder="Add details to help companies match your profile..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="card" style={{ marginTop: 8 }}>
              <div className="h2" style={{ marginTop: 0 }}>SEO Metadata (optional)</div>
              <input className="input" placeholder="SEO Title (max 60 chars)" value={seoTitle} onChange={e => setSeoTitle(e.target.value.slice(0,60))} />
              <input className="input" placeholder="Meta Description (max 160 chars)" value={seoDescription} onChange={e => setSeoDescription(e.target.value.slice(0,160))} style={{ marginTop: 8 }} />
              <input className="input" placeholder="SEO Keywords (comma-separated)" value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} style={{ marginTop: 8 }} />
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={submitPost}>Publish Profile</button>
            </div>
          </>
        )}

        {status && <p style={{ marginTop: 8 }}>{status}</p>}
        {submitted && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="h2">Submission</div>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(submitted, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}