import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay.jsx'

export default function ViewListingPage() {
  const { id } = useParams()
  const [listing, setListing] = useState(null)
  const [images, setImages] = useState([])
  const [structured, setStructured] = useState({})
  const [status, setStatus] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [favPulse, setFavPulse] = useState(false)
  const [descOpen, setDescOpen] = useState(false)

  function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch (_) { return null }
  }
  function isLoggedIn() {
    return !!getUser()
  }
  function formatPhoneDisplay(p) {
    const s = String(p || '').trim()
    return s.startsWith('+94') ? ('0' + s.slice(3)) : s
  }
  function formatPrice(n) {
    const v = typeof n === 'number' ? n : Number(n)
    if (!isFinite(v)) return String(n ?? '')
    return v.toLocaleString('en-US')
  }

  // Make a professional Title Case (e.g., "honda dio" -> "Honda Dio")
  function formatTitleCase(s) {
    const str = String(s || '').trim()
    if (!str) return ''
    return str
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  }

  // Load listing
  useEffect(() => {
    async function load() {
      if (!id) return
      try {
        setLoading(true)
        const r = await fetch(`/api/listings/${encodeURIComponent(id)}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load listing')
        setListing(data)
        const imgs = Array.isArray(data.images) ? data.images.filter(Boolean) : []
        setImages(imgs)
        setCurrentIndex(0)
        try {
          const parsed = JSON.parse(data.structured_json || '{}')
          setStructured(parsed)
        } catch (_) {
          setStructured({})
        }
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // Load favorite status from local storage (client-only favorite)
  useEffect(() => {
    const user = getUser()
    if (!user?.email || !id) return
    try {
      const key = `favorites_${user.email}`
      const arr = JSON.parse(localStorage.getItem(key) || '[]')
      setFavorited(arr.includes(Number(id)))
    } catch (_) {}
  }, [id])

  // Dynamic SEO based on listing fields + OpenGraph/Twitter + canonical + JSON-LD
  useEffect(() => {
    if (!listing) return
    const rawTitle = listing.seo_title || listing.title || 'Listing'
    const title = formatTitleCase(rawTitle)
    const desc = listing.seo_description || listing.description || ''
    const url = `https://ganudenu.store/listing/${listing.id}`
    document.title = title

    function setMeta(name, content) {
      let tag = document.querySelector(`meta[name="${name}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', name)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
    }
    function setProperty(property, content) {
      let tag = document.querySelector(`meta[property="${property}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('property', property)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
    }
    function setCanonical(href) {
      let link = document.querySelector('link[rel="canonical"]')
      if (!link) {
        link = document.createElement('link')
        link.setAttribute('rel', 'canonical')
        document.head.appendChild(link)
      }
      link.setAttribute('href', href)
    }

    setMeta('description', desc)
    setMeta('keywords', listing.seo_keywords || '')
    setProperty('og:title', title)
    setProperty('og:description', desc)
    setProperty('og:url', url)
    setProperty('og:type', 'website')
    setMeta('twitter:card', 'summary')
    setMeta('twitter:title', title)
    setMeta('twitter:description', desc)
    setCanonical(url)

    // JSON-LD (Product/Offer style)
    try {
      const scriptId = 'jsonld-listing'
      let script = document.getElementById(scriptId)
      if (!script) {
        script = document.createElement('script')
        script.type = 'application/ld+json'
        script.id = scriptId
        document.head.appendChild(script)
      }
      const price = typeof listing.price === 'number' ? listing.price : undefined
      const jsonld = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: title,
        description: desc,
        offers: price != null ? {
          "@type": "Offer",
          price: String(price),
          priceCurrency: "LKR",
          availability: "https://schema.org/InStock"
        } : undefined
      }
      script.text = JSON.stringify(jsonld)
    } catch (_) {}
  }, [listing])

  const structuredEntries = useMemo(() => {
    return Object.entries(structured || {}).filter(([k]) => k && k !== '')
  }, [structured])

  function prettyLabel(key) {
    // Adjust labels based on category (e.g., Salary for Job)
    const isJob = String(listing?.main_category || '') === 'Job'
    const map = {
      pricing_type: isJob ? 'Salary Type' : 'Price Type',
      sub_category: isJob ? 'Job Sub-category' : 'Sub Category',
      valid_until: 'Valid Until',
      main_category: 'Category',
      phone: 'Phone',
      email: 'Email',
      model: 'Model',
      location: 'Location',
      price: isJob ? 'Salary' : 'Price',
      status: 'Status'
    }
    if (map[key]) return map[key]
    const s = String(key || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    return s.replace(/(^|\s)\w/g, m => m.toUpperCase())
  }

  function onDial() {
    if (!isLoggedIn()) {
      setShowLogin(true)
      return
    }
    // Anchor with tel: will handle the dial action
  }

  async function onReport() {
    if (!isLoggedIn()) {
      setShowLogin(true)
      return
    }
    const reason = window.prompt('Report reason:')
    if (!reason || !reason.trim()) return
    try {
      const user = getUser()
      const r = await fetch('/api/listings/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: Number(id), reason: reason.trim(), reporter_email: user.email })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to report listing')
      setStatus('Thank you. Your report has been submitted.')
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  function onToggleFavorite() {
    if (!isLoggedIn()) {
      setShowLogin(true)
      return
    }
    try {
      const user = getUser()
      const key = `favorites_${user.email}`
      const arr = JSON.parse(localStorage.getItem(key) || '[]')
      const nid = Number(id)
      const exists = arr.includes(nid)
      const next = exists ? arr.filter(v => v !== nid) : [...arr, nid]
      localStorage.setItem(key, JSON.stringify(next))
      setFavorited(!exists)
      setFavPulse(true)
      setTimeout(() => setFavPulse(false), 300)
    } catch (e) {
      setStatus('Failed to update favorites.')
    }
  }

  function prevImage() {
    setCurrentIndex(i => {
      const n = images.length
      return n ? (i - 1 + n) % n : 0
    })
  }
  function nextImage() {
    setCurrentIndex(i => {
      const n = images.length
      return n ? (i + 1) % n : 0
    })
  }
  function selectImage(idx) {
    setCurrentIndex(idx)
  }

  const mainImage = images[currentIndex]

  return (
    <div className="center viewlisting has-actionbar">
      {loading && <LoadingOverlay message="Loading listing..." />}
      {showLogin && (
        <div className="card" style={{ position: 'sticky', top: 8, zIndex: 5, marginBottom: 12 }}>
          <div className="h2">Please login</div>
          <p className="text-muted">You must be logged in to view contact details and interact with sellers.</p>
          <a className="btn primary" href="/auth">Go to Login</a>
          <button className="btn" onClick={() => setShowLogin(false)} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Gradient header to match Home/Job pages */}
        <div
          className="viewlisting-hero"
          style={{
            padding: '32px 18px',
            background:
              'radial-gradient(1000px 300px at 10% -20%, rgba(0,209,255,0.25), transparent 60%), ' +
              'radial-gradient(1000px 300px at 90% 0%, rgba(108,127,247,0.25), transparent 60%), ' +
              'linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="h1 viewlisting-title" style={{ marginBottom: 6 }}>
                {formatTitleCase(listing?.seo_title || listing?.title || 'View Listing')}
              </div>

              {listing && (
                <div className="seo-keys" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {listing.main_category && <span className="pill">{listing.main_category}</span>}
                  {listing.status && <span className="pill">{listing.status}</span>}
                  {listing.location && <span className="pill">{listing.location}</span>}
                  {listing.pricing_type && <span className="pill">Price Type: {listing.pricing_type}</span>}
                </div>
              )}
            </div>
            <div className="viewlisting-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {typeof listing?.price !== 'undefined' && listing?.price !== null && (
                <div className="price-chip large">LKR {formatPrice(listing.price)}</div>
              )}
              <button
                className={`btn fav-btn ${favorited ? 'active' : ''} ${favPulse ? 'pulse' : ''}`}
                onClick={onToggleFavorite}
                aria-label={favorited ? 'Remove favorite' : 'Add favorite'}
                title={favorited ? 'Remove favorite' : 'Add favorite'}
                type="button"
              >
                ★ {favorited ? 'Favorited' : 'Favorite'}
              </button>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ padding: 18 }}>
          {/* Gallery + Details */}
          <div className="grid two" style={{ marginTop: 0 }}>
          {/* Left: Image carousel & description */}
          <div>
            <div className="h2">Gallery</div>
            {images.length > 0 ? (
              <div className="carousel">
                <div className="carousel-main">
                  {mainImage?.url ? (
                    <img src={mainImage.url} alt={mainImage.original_name || 'Image'} />
                  ) : (
                    <div className="carousel-empty text-muted">No preview available</div>
                  )}
                  {images.length > 1 && (
                    <>
                      <button className="btn nav prev" onClick={prevImage} aria-label="Previous image">‹</button>
                      <button className="btn nav next" onClick={nextImage} aria-label="Next image">›</button>
                    </>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="carousel-thumbs">
                    {images.map((img, idx) => (
                      <button
                        key={img.id ?? idx}
                        className={`thumb ${idx === currentIndex ? 'active' : ''}`}
                        onClick={() => selectImage(idx)}
                        aria-label={`Show image ${idx + 1}`}
                        title={img.original_name || `Image ${idx + 1}`}
                      >
                        {img.url ? (
                          <img src={img.url} alt={img.original_name || `Image ${idx + 1}`} />
                        ) : (
                          <span className="text-muted">{img.path || 'Image'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center' }}>
                <div className="text-muted">No images uploaded for this listing.</div>
              </div>
            )}

            {/* Contact (mobile-first duplicate, hidden on desktop via CSS) */}
            {listing?.phone ? (
              <div className="card contact-mobile" style={{ marginTop: 16 }}>
                <div className="h2" style={{ marginTop: 0 }}>Contact</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <a
                    className="btn primary"
                    href={isLoggedIn() ? `tel:${listing.phone}` : '#'}
                    onClick={onDial}
                  >
                    {formatPhoneDisplay(listing.phone)}
                  </a>
                  {listing?.email && <a className="btn" href={`mailto:${listing.email}`}>Email seller</a>}
                </div>
              </div>
            ) : null}

            <div className="h2" style={{ marginTop: 16 }}>Description</div>
            {/* Desktop full description */}
            <div className="desc-desktop">
              <p>{listing?.description}</p>
            </div>
            {/* Mobile collapsible description */}
            <div className="desc-mobile">
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {descOpen ? (listing?.description || '') : String(listing?.description || '').slice(0, 180)}
                {(!descOpen && String(listing?.description || '').length > 180) ? '…' : ''}
              </p>
              {String(listing?.description || '').length > 180 && (
                <button type="button" className="btn" onClick={() => setDescOpen(o => !o)}>
                  {descOpen ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>

            
          </div>

          {/* Right: Key details */}
          <div>
            <div className="h2">Key Details</div>
            {structuredEntries.length === 0 && <p className="text-muted">No structured data available.</p>}
            <div className="details-grid">
              {structuredEntries.map(([k, v]) => (
                <div key={k} className="detail">
                  <div className="label">{prettyLabel(k)}</div>
                  <div className="value">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                </div>
              ))}
            </div>

            {/* Contact info card (desktop) */}
            {listing?.phone && (
              <div className="card contact-desktop" style={{ marginTop: 16 }}>
                <div className="h2" style={{ marginTop: 0 }}>Contact</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <a
                    className="btn primary"
                    href={isLoggedIn() ? `tel:${listing.phone}` : '#'}
                    onClick={onDial}
                  >
                    {formatPhoneDisplay(listing.phone)}
                  </a>
                  {listing?.email && <a className="btn" href={`mailto:${listing.email}`}>Email seller</a>}
                </div>
              </div>
            )}

            {/* Desktop: Report button moved under contact card, right-aligned */}
            <div className="report-desktop" style={{ marginTop: 8, textAlign: 'right' }}>
              <button className="btn" onClick={onReport} type="button">Report this listing</button>
            </div>
          </div>
          </div>
        </div>

        {/* Mobile: Report button moved away from description read-more, placed at bottom of card */}
        <div className="report-mobile" style={{ margin: '12px 18px 0' }}>
          <button className="btn accent" onClick={onReport} type="button">Report this listing</button>
        </div>

        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>

      {/* Mobile sticky action bar (hidden on desktop via CSS) */}
      <div className="mobile-actionbar">
        {typeof listing?.price !== 'undefined' && listing?.price !== null ? (
          <div className="price-chip">LKR {formatPrice(listing.price)}</div>
        ) : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          {listing?.phone && (
            <a
              className="btn accent"
              href={isLoggedIn() ? `tel:${listing.phone}` : '#'}
              onClick={onDial}
              aria-label="Call seller"
              title="Call seller"
            >
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
