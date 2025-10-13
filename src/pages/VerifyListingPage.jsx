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

  // Edit toggle: default read-only (user can enable editing)
  const [editMode, setEditMode] = useState(false)

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
    // Enforce required fields: location, price, pricing_type, phone, model_name, manufacture_year, description
    // Vehicle-only: require sub_category (Bike/Car/Van/Bus)
    const s = parseStruct()
    const hasLoc = String(s.location || '').trim().length > 0
    const nPrice = Number(s.price)
    const hasPrice = !Number.isNaN(nPrice) && nPrice >= 0
    const hasPricing = ['Fixed Price', 'Negotiable'].includes(String(s.pricing_type || ''))
    const hasPhone = /^\+94\d{9}$/.test(String(s.phone || '').trim())
    const hasModel = String(s.model_name || '').trim().length >= 2
    const nYear = Number(s.manufacture_year)
    const hasYear = Number.isFinite(nYear) && nYear >= 1950 && nYear <= 2100
    const hasDesc = String(descriptionText || '').trim().length >= 20
    const isVehicle = String(draft?.main_category || '') === 'Vehicle'
    const validSubCats = new Set(['Bike','Car','Van','Bus'])
    const hasSubCat = !isVehicle || validSubCats.has(String(s.sub_category || '').trim())

    if (!hasLoc || !hasPrice || !hasPricing || !hasPhone || !hasModel || !hasYear || !hasDesc || !hasSubCat) {
      const baseMsg = 'Please provide Location, Price, Pricing Type, Phone (+94), Model Name, Manufacture Year (1950-2100), and a Description (min 20 chars).'
      const subMsg = isVehicle ? ' Also select the Vehicle Sub-category (Bike, Car, Van, or Bus).' : ''
      setStatus(baseMsg + subMsg)
      return
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
      setSubmitted(data)
      setStatus('Listing submitted.')
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <small className="text-muted">Auto-filled from AI extraction. Edit only if needed.</small>
                  <button type="button" className="btn" onClick={() => setEditMode(v => !v)}>
                    {editMode ? 'Done' : 'Edit'}
                  </button>
                </div>
                <input
                  className="input"
                  placeholder="Location (required)"
                  value={loc}
                  onChange={e => { const s = parseStruct(); s.location = e.target.value; patchStruct(s) }}
                  disabled={!editMode}
                />
                <input
                  className="input"
                  type="number"
                  placeholder="Price (required)"
                  value={price}
                  onChange={e => { const s = parseStruct(); const v = e.target.value; s.price = v === '' ? '' : Number(v); patchStruct(s) }}
                  style={{ marginTop: 8 }}
                  disabled={!editMode}
                />
                <select
                  className="select"
                  value={pricingType || ''}
                  onChange={e => { const s = parseStruct(); s.pricing_type = e.target.value; patchStruct(s) }}
                  style={{ marginTop: 8 }}
                  disabled={!editMode}
                >
                  <option value="">Select pricing type</option>
                  <option value="Fixed Price">Fixed Price</option>
                  <option value="Negotiable">Negotiable</option>
                </select>
                <input
                  className="input"
                  placeholder="Phone (+94XXXXXXXXX)"
                  value={phone}
                  onChange={e => { const s = parseStruct(); s.phone = e.target.value; patchStruct(s) }}
                  style={{ marginTop: 8 }}
                  disabled={!editMode}
                />
                <input
                  className="input"
                  placeholder="Model Name (required)"
                  value={modelName}
                  onChange={e => { const s = parseStruct(); s.model_name = e.target.value; patchStruct(s) }}
                  style={{ marginTop: 8 }}
                  disabled={!editMode}
                />
                <input
                  className="input"
                  type="number"
                  placeholder="Manufacture Year (required)"
                  value={year}
                  onChange={e => { const s = parseStruct(); const v = e.target.value; s.manufacture_year = v === '' ? '' : Number(v); patchStruct(s) }}
                  style={{ marginTop: 8 }}
                  disabled={!editMode}
                />
                {String(draft?.main_category || '') === 'Vehicle' && (
                  <select
                    className="select"
                    value={subCategory}
                    onChange={e => { const s = parseStruct(); s.sub_category = e.target.value; patchStruct(s) }}
                    style={{ marginTop: 8 }}
                    disabled={!editMode}
                  >
                    <option value="">Vehicle Sub-category (required)</option>
                    <option value="Bike">Bike</option>
                    <option value="Car">Car</option>
                    <option value="Van">Van</option>
                    <option value="Bus">Bus</option>
                  </select>
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

            <textarea
              className="input"
              placeholder="Description (required)"
              value={descriptionText}
              onChange={e => setDescriptionText(e.target.value)}
              rows={6}
              style={{ marginTop: 6 }}
              disabled={!editMode}
            />

            <div className="h2" style={{ marginTop: 12 }}>Images</div>

            {urls.length > 0 ? (
              <div className="card" style={{ padding: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="btn"
                    type="button"
                    aria-label="Previous image"
                    onClick={() => setActiveIdx((idx) => (idx - 1 + urls.length) % urls.length)}
                    disabled={urls.length <= 1}
                  >
                    ‹
                  </button>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    {urls[activeIdx] ? (
                      <img
                        src={urls[activeIdx]}
                        alt={`Image ${activeIdx + 1}`}
                        style={{ maxHeight: 300, width: '100%', objectFit: 'cover', borderRadius: 12 }}
                      />
                    ) : (
                      <div className="text-muted">No preview</div>
                    )}
                    <div className="text-muted" style={{ marginTop: 6 }}>
                      {activeIdx + 1} / {urls.length}
                    </div>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    aria-label="Next image"
                    onClick={() => setActiveIdx((idx) => (idx + 1) % urls.length)}
                    disabled={urls.length <= 1}
                  >
                    ›
                  </button>
                </div>

                {urls.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto' }}>
                    {urls.map((u, i) => (
                      <button
                        key={i}
                        type="button"
                        className="btn"
                        style={{
                          padding: 0,
                          borderRadius: 10,
                          borderColor: i === activeIdx ? 'var(--primary)' : 'var(--border)',
                          background: 'transparent'
                        }}
                        onClick={() => setActiveIdx(i)}
                      >
                        <img
                          src={u}
                          alt={`thumb-${i}`}
                          style={{ height: 54, width: 80, objectFit: 'cover', borderRadius: 10, display: 'block' }}
                        />
                      </button>
                    ))}
                  </div>
                )}
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
