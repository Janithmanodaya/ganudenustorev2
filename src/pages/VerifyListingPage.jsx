import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function VerifyListingPage() {
  const [sp] = useSearchParams()
  const draftId = sp.get('draftId')
  const [draft, setDraft] = useState(null)
  const [images, setImages] = useState([])
  const [structuredJSON, setStructuredJSON] = useState('')
  const [status, setStatus] = useState(null)
  const [submitted, setSubmitted] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)

  // Optional SEO states (fixes setSeoTitle/Description/Keywords not defined)
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [seoKeywords, setSeoKeywords] = useState('')

  // Description (editable)
  const [descriptionText, setDescriptionText] = useState('')

  

  // One-time generator controls
  const [genBusy, setGenBusy] = useState(false)
  const [genUsed, setGenUsed] = useState(false)

  // Convenience accessors for required fields in structuredJSON
  function parseStruct() {
    try { return JSON.parse(structuredJSON || '{}') } catch (_) { return {} }
  }
  function patchStruct(next) {
    setStructuredJSON(JSON.stringify(next, null, 2))
  }

  const struct = parseStruct()
  const loc = String(struct.location || '')
  const price = struct.price != null && struct.price !== '' ? String(struct.price) : ''
  const pricingType = String(struct.pricing_type || '')
  const phone = String(struct.phone || '')
  const modelName = String(struct.model_name || '')
  const year = struct.manufacture_year != null && struct.manufacture_year !== '' ? String(struct.manufacture_year) : ''
  const subCategory = String(struct.sub_category || '')

  // Category flags
  const isVehicle = String(draft?.main_category || '') === 'Vehicle'
  const isJob = String(draft?.main_category || '') === 'Job'

  // Job-specific fields
  const employmentType = String(struct.employment_type || '')
  const company = String(struct.company || '')

  useEffect(() => {
    async function load() {
      if (!draftId) return;
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const email = user?.email || '';

      try {
        const url = `/api/listings/draft/${encodeURIComponent(draftId)}?email=${encodeURIComponent(email)}`;
        const r = await fetch(url);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load draft');
        setDraft(data.draft);
        setImages(data.images || []);
        setStructuredJSON(data.draft.structured_json || '');
        setSeoTitle(data.draft.seo_title || '');
        setSeoDescription(data.draft.seo_description || '');
        setSeoKeywords(data.draft.seo_keywords || '');
        setDescriptionText(data.draft.enhanced_description || data.draft.description || '');
      } catch (e) {
        setStatus(`Error: ${e.message}`);
      }
    }
    load();
  }, [draftId]);

  // Init one-time flag from localStorage
  useEffect(() => {
    if (!draftId) return;
    const key = `desc_gen_used_${draftId}`;
    try {
      const raw = localStorage.getItem(key);
      setGenUsed(raw === '1');
    } catch (_) {}
  }, [draftId]);

  // Reset active index if images change size
  useEffect(() => {
    if (activeIdx >= images.length) setActiveIdx(0)
  }, [images, activeIdx])

  const urls = useMemo(() => {
    // Use server-provided URL if available; fall back to filename extraction supporting Windows paths
    return images.map(img => {
      if (img.url) return img.url
      const filename = String(img.path || '').split(/[\\\/]/).pop()
      return filename ? `/uploads/${filename}` : ''
    })
  }, [images])

  async function submitPost() {
    // Category-aware field validation
    const s = parseStruct()
    const hasLoc = String(s.location || '').trim().length > 0
    const nPrice = Number(s.price)
    const hasPrice = !Number.isNaN(nPrice) && nPrice >= 0
    const hasPricing = ['Fixed Price', 'Negotiable'].includes(String(s.pricing_type || ''))
    const hasPhone = /^\+94\d{9}$/.test(String(s.phone || '').trim())
    const hasDesc = String(descriptionText || '').trim().length >= 20

    if (isVehicle) {
      const hasModel = String(s.model_name || '').trim().length >= 2
      const nYear = Number(s.manufacture_year)
      const hasYear = Number.isFinite(nYear) && nYear >= 1950 && nYear <= 2100
      const validSubCats = new Set(['Bike','Car','Van','Bus'])
      const hasSubCat = validSubCats.has(String(s.sub_category || '').trim())

      if (!hasLoc || !hasPrice || !hasPricing || !hasPhone || !hasModel || !hasYear || !hasDesc || !hasSubCat) {
        setStatus('Please provide Location, Price, Pricing Type, Phone (+94), Model Name, Manufacture Year (1950-2100), Vehicle Sub-category (Bike/Car/Van/Bus), and a Description (min 20 chars).')
        return
      }
    } else if (isJob) {
      const hasSubCat = String(s.sub_category || '').trim().length > 0
      const hasEmpType = String(s.employment_type || '').trim().length > 0
      if (!hasLoc || !hasPhone || !hasDesc || !hasSubCat || !hasEmpType) {
        setStatus('For Job: please provide Location, Phone (+94), Employment Type, Job Sub-category (e.g., Driver), and a Description (min 20 chars). Salary is optional.')
        return
      }
    } else {
      // Other categories: require base commerce fields but not vehicle specifics
      if (!hasLoc || !hasPrice || !hasPricing || !hasPhone || !hasDesc) {
        setStatus('Please provide Location, Price, Pricing Type, Phone (+94), and a Description (min 20 chars).')
        return
      }
    }

    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      const r = await fetch('/api/listings/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.email ? { 'X-User-Email': user.email } : {}) },
        body: JSON.stringify({
          draftId,
          structured_json: structuredJSON,
          description: descriptionText
        })
      })
      const text = await r.text()
      const ct = r.headers.get('content-type') || ''
      const data = ct.includes('application/json') && text ? JSON.parse(text) : {}
      if (!r.ok) throw new Error((data && data.error) || 'Failed to submit')
      // Redirect to payment instructions page with listing ID
      const listingId = data.listingId
      if (listingId) {
        window.location.href = `/payment/${encodeURIComponent(listingId)}`
      } else {
        setStatus('Submitted. Redirecting...')
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  async function generateDescription() {
    if (genUsed || genBusy) return;
    setGenBusy(true);
    setStatus(null);
    try {
      const r = await fetch('/api/listings/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, structured_json: structuredJSON })
      });
      const text = await r.text();
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') && text ? JSON.parse(text) : {};
      if (!r.ok) throw new Error((data && data.error) || 'Failed to generate description');
      const desc = String(data.description || '').trim();
      if (!desc) throw new Error('Empty description');

      // Safety: ensure no '*' characters are used for emphasis/bullets.
      // Convert any asterisks to '•' to avoid markdown styling.
      const safeDesc = desc.replace(/\*/g, '•');

      setDescriptionText(safeDesc);
      setGenUsed(true);
      try { localStorage.setItem(`desc_gen_used_${draftId}`, '1'); } catch (_) {}
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Review & Publish</div>
        {!draft && <p className="text-muted">Loading draft...</p>}

        {draft && (
          <>
            <div className="grid two">
              <div>
                <div className="h2">Required Details</div>
                <div style={{ marginBottom: 6 }}>
                  <small className="text-muted">Please review and complete the details below.</small>
                </div>

                {/* Location (always required) */}
                <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Location</label>
                <input
                  className="input"
                  placeholder="Location (required)"
                  value={loc}
                  onChange={e => { const s = parseStruct(); s.location = e.target.value; patchStruct(s) }}
                />

                {/* Category-specific fields */}
                {isVehicle && (
                  <>
                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Price</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="Price (required)"
                      value={price}
                      onChange={e => { const s = parseStruct(); const v = e.target.value; s.price = v === '' ? '' : Number(v); patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Pricing Type</label>
                    <select
                      className="select"
                      value={pricingType || ''}
                      onChange={e => { const s = parseStruct(); s.pricing_type = e.target.value; patchStruct(s) }}
                    >
                      <option value="">Select pricing type</option>
                      <option value="Fixed Price">Fixed Price</option>
                      <option value="Negotiable">Negotiable</option>
                    </select>

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Phone</label>
                    <input
                      className="input"
                      placeholder="Phone (+94XXXXXXXXX)"
                      value={phone}
                      onChange={e => { const s = parseStruct(); s.phone = e.target.value; patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Model Name</label>
                    <input
                      className="input"
                      placeholder="Model Name (required)"
                      value={modelName}
                      onChange={e => { const s = parseStruct(); s.model_name = e.target.value; patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Manufacture Year</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="Manufacture Year (required)"
                      value={year}
                      onChange={e => { const s = parseStruct(); const v = e.target.value; s.manufacture_year = v === '' ? '' : Number(v); patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Sub-category</label>
                    <select className="select" value={subCategory} disabled>
                      <option value="">Vehicle Sub-category</option>
                      <option value="Bike">Bike</option>
                      <option value="Car">Car</option>
                      <option value="Van">Van</option>
                      <option value="Bus">Bus</option>
                    </select>
                  </>
                )}

                {isJob && (
                  <>
                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Salary</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="Salary (optional)"
                      value={price}
                      onChange={e => { const s = parseStruct(); const v = e.target.value; s.price = v === '' ? '' : Number(v); patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Salary Type</label>
                    <select
                      className="select"
                      value={pricingType || ''}
                      onChange={e => { const s = parseStruct(); s.pricing_type = e.target.value; patchStruct(s) }}
                    >
                      <option value="">Select salary type</option>
                      <option value="Negotiable">Negotiable</option>
                      <option value="Fixed Price">Fixed Salary</option>
                    </select>

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Phone</label>
                    <input
                      className="input"
                      placeholder="Phone (+94XXXXXXXXX)"
                      value={phone}
                      onChange={e => { const s = parseStruct(); s.phone = e.target.value; patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Company</label>
                    <input
                      className="input"
                      placeholder="Company or employer name"
                      value={company}
                      onChange={e => { const s = parseStruct(); s.company = e.target.value; patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Employment Type</label>
                    <select
                      className="select"
                      value={employmentType || ''}
                      onChange={e => { const s = parseStruct(); s.employment_type = e.target.value; patchStruct(s) }}
                    >
                      <option value="">Select employment type</option>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Internship">Internship</option>
                      <option value="Temporary">Temporary</option>
                    </select>

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Job Sub-category</label>
                    <select
                      className="select"
                      value={subCategory || ''}
                      onChange={e => { const s = parseStruct(); s.sub_category = e.target.value; patchStruct(s) }}
                    >
                      <option value="">Select job sub-category</option>
                      <option value="Driver">Driver</option>
                      <option value="IT/Software">IT/Software</option>
                      <option value="Sales/Marketing">Sales/Marketing</option>
                      <option value="Education">Education</option>
                      <option value="Logistics/Delivery">Logistics/Delivery</option>
                      <option value="Accounting/Finance">Accounting/Finance</option>
                      <option value="Healthcare">Healthcare</option>
                      <option value="Construction/Trades">Construction/Trades</option>
                      <option value="Customer Service">Customer Service</option>
                      <option value="Security">Security</option>
                      <option value="Cleaning/Housekeeping">Cleaning/Housekeeping</option>
                      <option value="Other">Other</option>
                    </select>
                  </>
                )}

                {!isVehicle && !isJob && (
                  <>
                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Price</label>
                    <input
                      className="input"
                      type="number"
                      placeholder="Price (required)"
                      value={price}
                      onChange={e => { const s = parseStruct(); const v = e.target.value; s.price = v === '' ? '' : Number(v); patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Pricing Type</label>
                    <select
                      className="select"
                      value={pricingType || ''}
                      onChange={e => { const s = parseStruct(); s.pricing_type = e.target.value; patchStruct(s) }}
                    >
                      <option value="">Select pricing type</option>
                      <option value="Fixed Price">Fixed Price</option>
                      <option value="Negotiable">Negotiable</option>
                    </select>

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Phone</label>
                    <input
                      className="input"
                      placeholder="Phone (+94XXXXXXXXX)"
                      value={phone}
                      onChange={e => { const s = parseStruct(); s.phone = e.target.value; patchStruct(s) }}
                    />

                    <label className="text-muted" style={{ display: 'block', marginTop: 8 }}>Sub-category</label>
                    <select className="select" value={subCategory || ''} disabled>
                      <option value="">{subCategory ? subCategory : 'None'}</option>
                    </select>
                  </>
                )}
              </div>
            </div>

            <div className="h2" style={{ marginTop: 12 }}>Description</div>

            {!genUsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={generateDescription}
                  disabled={genBusy}
                  aria-label="Generate description"
                >
                  {genBusy ? 'Generating…' : 'Generate Description ✨'}
                </button>
                {genBusy && (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: '3px solid rgba(108,127,247,0.2)',
                      borderTopColor: '#6c7ff7',
                      animation: 'spin 1s linear infinite'
                    }}
                  />
                )}
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                <small className="text-muted">One-time use. Adds emojis and bullet points for clarity.</small>
              </div>
            )}

            <label className="text-muted" style={{ display: 'block', marginTop: 6 }}>Description</label>
            <textarea
              className="input"
              placeholder="Description (required)"
              value={descriptionText}
              onChange={e => setDescriptionText(e.target.value)}
              rows={6}
              style={{ marginTop: 6 }}
            />

            <div className="h2" style={{ marginTop: 12 }}>Images</div>

            {urls.length > 0 ? (
              <div className="card" style={{ padding: 8 }}>
                <div style={{ position: 'relative' }}>
                  {urls[activeIdx] ? (
                    <img
                      src={urls[activeIdx]}
                      alt={`Image ${activeIdx + 1}`}
                      style={{ maxHeight: 300, width: '100%', objectFit: 'cover', borderRadius: 12 }}
                    />
                  ) : (
                    <div className="text-muted">No preview</div>
                  )}
                  {urls.length > 1 && (
                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                      <button
                        className="btn"
                        type="button"
                        aria-label="Previous image"
                        onClick={() => setActiveIdx((idx) => (idx - 1 + urls.length) % urls.length)}
                      >
                        ‹
                      </button>
                      <button
                        className="btn"
                        type="button"
                        aria-label="Next image"
                        onClick={() => setActiveIdx((idx) => (idx + 1) % urls.length)}
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-muted" style={{ marginTop: 6, textAlign: 'center' }}>
                  {activeIdx + 1} / {urls.length}
                </div>
              </div>
            ) : (
              <p className="text-muted">No images.</p>
            )}

            <div style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={submitPost}>Publish</button>
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
