import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function VerifyEmployeePage() {
  const [sp] = useSearchParams()
  const draftId = sp.get('draftId')
  const [draft, setDraft] = useState(null)
  const [structuredJSON, setStructuredJSON] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [seoKeywords, setSeoKeywords] = useState('')
  const [status, setStatus] = useState(null)
  const [submitted, setSubmitted] = useState(null)

  // Publishing essentials
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')

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
        setStructuredJSON(data.draft.structured_json || '')
        setSeoTitle(data.draft.seo_title || '')
        setSeoDescription(data.draft.seo_description || '')
        setSeoKeywords(data.draft.seo_keywords || '')
        try {
          const obj = JSON.parse(data.draft.structured_json || '{}')
          setLocation(String(obj.location || ''))
          setPhone(String(obj.phone || ''))
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
      if (!loc) { setStatus('Location is required'); return }
      if (!/^\+94\d{9}$/.test(ph)) { setStatus('Phone must be in +94XXXXXXXXX format'); return }

      let obj = {}
      try { obj = structuredJSON ? JSON.parse(structuredJSON) : {} } catch (_) { obj = {} }
      obj.location = loc
      obj.phone = ph
      if (obj.price != null && !obj.pricing_type) obj.pricing_type = 'Negotiable'

      const payload = {
        draftId,
        structured_json: JSON.stringify(obj, null, 2),
        seo_title: seoTitle,
        seo_description: seoDescription,
        seo_keywords: seoKeywords
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
        <div className="h1">Review Resume & Publish</div>
        {!draft && <p className="text-muted">Loading resume draft...</p>}

        {draft && (
          <>
            <p className="text-muted">Category: {draft.main_category} • Title: {draft.title}</p>

            <div className="card" style={{ marginTop: 8 }}>
              <div className="h2" style={{ marginTop: 0 }}>Publishing Details</div>
              <div className="grid two">
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
                Location and phone are required to publish.
              </div>
            </div>

            <div className="grid two" style={{ marginTop: 8 }}>
              <div>
                <div className="h2">Structured Resume Data (editable)</div>
                <textarea className="textarea" value={structuredJSON} onChange={e => setStructuredJSON(e.target.value)} />
              </div>
              <div>
                <div className="h2">SEO Metadata (editable)</div>
                <input className="input" placeholder="SEO Title (max 60 chars)" value={seoTitle} onChange={e => setSeoTitle(e.target.value.slice(0,60))} />
                <input className="input" placeholder="Meta Description (max 160 chars)" value={seoDescription} onChange={e => setSeoDescription(e.target.value.slice(0,160))} style={{ marginTop: 8 }} />
                <input className="input" placeholder="SEO Keywords (comma-separated)" value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} style={{ marginTop: 8 }} />
              </div>
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