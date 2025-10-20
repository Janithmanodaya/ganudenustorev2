import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomSelect from '../components/CustomSelect.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import useSEO from '../components/useSEO.js'

export default function JobTalentPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)

  // Filters and definitions (from backend dynamic filters for Job)
  const [filtersDef, setFiltersDef] = useState({ keys: [], valuesByKey: {} })
  const [filters, setFilters] = useState({})
  const [location, setLocation] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [page, setPage] = useState(1)
  const limit = 10

  // Suggestions
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [locQuery, setLocQuery] = useState('')
  const [locSuggestions, setLocSuggestions] = useState([])

  // UI helpers
  const filtersCardRef = useRef(null)
  const pageWindow = [page - 2, page - 1, page, page + 1, page + 2].filter(p => p >= 1)

  // SEO for talent page
  useSEO({
    title: 'Talent — Find Employees and Freelancers',
    description: 'Browse Sri Lankan talent profiles. Filter by skills, experience, location, and salary expectations.',
    canonical: 'https://ganudenu.store/jobs/talent'
  })

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function onSearch(e) {
    e.preventDefault()
    setPage(1)
    runTalentSearch()
  }

  function quick(term) {
    const v = String(term || '').trim()
    if (!v) return
    setQ(v)
    try {
      const el = filtersCardRef.current
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch (_) {}
    setPage(1)
    runTalentSearch()
  }

  async function runTalentSearch() {
    try {
      setLoading(true)
      setStatus(null)
      const params = new URLSearchParams()
      params.set('category', 'Job')
      params.set('limit', String(limit))
      params.set('page', String(page))
      const query = (q || '').trim()
      if (query) params.set('q', query)
      if (location) params.set('location', location)
      if (salaryMin) params.set('price_min', salaryMin)
      if (salaryMax) params.set('price_max', salaryMax)

      // Prefer backend-side filter to distinguish talent profiles if supported
      const eff = { ...(filters || {}), profile_type: 'Employee' }
      const effClean = Object.fromEntries(Object.entries(eff).filter(([_, v]) => v != null && String(v) !== ''))
      if (Object.keys(effClean).length) params.set('filters', JSON.stringify(effClean))

      const r = await fetch(`/api/listings/search?${params.toString()}`)
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || 'Failed to load talent')
      setResults(Array.isArray(data.results) ? data.results : [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function loadFilters() {
      try {
        const r = await fetch('/api/listings/filters?category=Job')
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load filters')
        setFiltersDef({ keys: data.keys || [], valuesByKey: data.valuesByKey || {} })
      } catch (_) {}
    }
    loadFilters()
  }, [])

  useEffect(() => {
    runTalentSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const term = (q || '').trim()
    if (!term) { setSearchSuggestions([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/listings/suggestions?q=${encodeURIComponent(term)}&category=Job`, { signal: ctrl.signal })
        const data = await r.json()
        if (r.ok && Array.isArray(data.results)) {
          const arr = data.results.map(x => (typeof x === 'string' ? x : String(x.value || ''))).filter(Boolean)
          setSearchSuggestions(arr)
        }
      } catch (_) {}
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  useEffect(() => {
    const term = (locQuery || '').trim()
    if (!term) { setLocSuggestions([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/listings/locations?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await r.json()
        if (r.ok) setLocSuggestions(Array.isArray(data.results) ? data.results : [])
      } catch (_) {}
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [locQuery])

  const hasActiveFilters = useMemo(() => {
    return !!(q || location || salaryMin || salaryMax || Object.keys(filters).length)
  }, [q, location, salaryMin, salaryMax, filters])

  function applyFilters() {
    setPage(1)
    runTalentSearch()
  }

  function resetFilters() {
    try {
      setQ('')
      setLocation('')
      setSalaryMin('')
      setSalaryMax('')
      setFilters({})
      setPage(1)
      runTalentSearch()
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (_) {}
    } catch (_) {}
  }

  // Client-side in-page text filter
  const [localFilter, setLocalFilter] = useState('')
  const filtered = useMemo(() => {
    const t = (localFilter || '').toLowerCase().trim()
    if (!t) return results
    return results.filter(item => {
      const parts = [item.title || '', item.location || '', item.seo_description || item.description || '']
      try {
        const sj = JSON.parse(item.structured_json || '{}')
        parts.push(sj.name || '')
        parts.push(sj.target_title || '')
        if (Array.isArray(sj.skills)) parts.push(String(sj.skills.join(' ')))
        parts.push(sj.experience_level || '')
      } catch (_) {}
      return parts.join(' ').toLowerCase().includes(t)
    })
  }, [results, localFilter])

  return (
    <>
    <div className="center">
      {loading && <LoadingOverlay message="Loading talent..." />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '36px 18px',
            background:
              'radial-gradient(1000px 300px at 10% -20%, rgba(0,209,255,0.25), transparent 60%), ' +
              'radial-gradient(1000px 300px at 90% 0%, rgba(108,127,247,0.25), transparent 60%), ' +
              'linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))',
            color: '#fff'
          }}
        >
          <div className="h1" style={{ textAlign: 'center', marginBottom: 8, color: '#fff' }}>
            Discover Talent
          </div>
          <p style={{ textAlign: 'center', marginTop: 0, color: '#fff' }}>
            Search employee and freelancer profiles. Filter by skills, experience, and location.
          </p>

          <form onSubmit={onSearch} className="searchbar" style={{ margin: '16px auto 0', maxWidth: 720 }}>
            <input
              className="input"
              list="talent-suggest"
              placeholder="Search talent (e.g., React, Accountant, Designer, Kandy)..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <datalist id="talent-suggest">
              {Array.isArray(searchSuggestions) ? searchSuggestions.map(s => <option key={s} value={s} />) : null}
            </datalist>
            <button className="btn primary" type="submit" style={{ color: '#fff' }}>Search</button>
          </form>

          <div className="quick-cats" style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={() => quick('Developer')} style={{ color: '#fff' }}>💻 Developer</button>
            <button className="btn" type="button" onClick={() => quick('Designer')} style={{ color: '#fff' }}>🎨 Designer</button>
            <button className="btn" type="button" onClick={() => quick('Marketing')} style={{ color: '#fff' }}>📣 Marketing</button>
            <button className="btn" type="button" onClick={() => quick('Accounting')} style={{ color: '#fff' }}>📊 Accounting</button>
            <button className="btn" type="button" onClick={() => quick('Remote')} style={{ color: '#fff' }}>🌍 Remote</button>
            <button className="btn" type="button" onClick={() => quick('Intern')} style={{ color: '#fff' }}>🎓 Intern</button>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div className="h2" style={{ marginTop: 0 }}>Talent Filters</div>

          <div ref={filtersCardRef} className="card" style={{ padding: 12 }}>
            <div className="grid two">
              {/* Title / Role (from sub_category values, allow custom) */}
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Role</div>
                <CustomSelect
                  value={filters['sub_category'] || ''}
                  onChange={val => updateFilter('sub_category', val)}
                  ariaLabel="Role"
                  placeholder="Role"
                  options={[
                    { value: '', label: 'Any' },
                    ...Array.from(new Set((filtersDef.valuesByKey['sub_category'] || []).map(v => String(v))))
                      .map(v => ({ value: v, label: v }))
                  ]}
                  searchable={true}
                  allowCustom={true}
                />
              </div>

              {/* Location */}
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Location</div>
                <input
                  className="input"
                  list="talent-location-suggest"
                  placeholder="Location"
                  value={location}
                  onChange={e => { setLocation(e.target.value); setLocQuery(e.target.value) }}
                />
                <datalist id="talent-location-suggest">
                  {locSuggestions.map(loc => <option key={loc} value={loc} />)}
                </datalist>
              </div>

              {/* Experience level */}
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Experience</div>
                <CustomSelect
                  value={filters['experience_level'] || ''}
                  onChange={val => updateFilter('experience_level', val)}
                  ariaLabel="Experience"
                  placeholder="Experience"
                  options={[
                    { value: '', label: 'Any' },
                    ...['Intern','Junior','Mid','Senior','Lead'].map(v => ({ value: v, label: v }))
                  ]}
                />
              </div>

              {/* Employment type */}
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Employment Type</div>
                <CustomSelect
                  value={filters['employment_type'] || ''}
                  onChange={val => updateFilter('employment_type', val)}
                  ariaLabel="Employment Type"
                  placeholder="Employment Type"
                  options={[
                    { value: '', label: 'Any' },
                    ...['Full-time','Part-time','Contract','Freelance','Internship','Temporary'].map(v => ({ value: v, label: v }))
                  ]}
                />
              </div>

              {/* Skills (if backend provides values) */}
              {Array.isArray(filtersDef.valuesByKey['skills']) && filtersDef.valuesByKey['skills'].length > 0 && (
                <div>
                  <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Skills</div>
                  <CustomSelect
                    value={filters['skills'] || ''}
                    onChange={val => updateFilter('skills', val)}
                    ariaLabel="Skills"
                    placeholder="Skills"
                    options={[
                      { value: '', label: 'Any' },
                      ...Array.from(new Set((filtersDef.valuesByKey['skills'] || []).map(v => String(v))))
                        .map(v => ({ value: v, label: v }))
                    ]}
                    searchable={true}
                    allowCustom={true}
                  />
                </div>
              )}

              {/* Expected salary range */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  type="number"
                  placeholder="Min expected salary"
                  value={salaryMin}
                  onChange={e => setSalaryMin(e.target.value)}
                  style={{ width: 160 }}
                />
                <input
                  className="input"
                  type="number"
                  placeholder="Max expected salary"
                  value={salaryMax}
                  onChange={e => setSalaryMax(e.target.value)}
                  style={{ width: 160 }}
                />
              </div>

              {/* Apply/Reset */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn compact" type="button" onClick={() => setFilters({})} style={{ flex: '0 0 auto' }}>Clear</button>
                <button className="btn compact" type="button" onClick={resetFilters} title="Reset all talent filters" style={{ flex: '0 0 auto' }}>Reset</button>
                <button className="btn primary compact" type="button" onClick={applyFilters} style={{ flex: '0 0 auto' }}>Apply</button>
              </div>
            </div>
          </div>

          {/* In-page filter */}
          <div className="grid two" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Filter on this page (name, role, skills, location...)"
              value={localFilter}
              onChange={e => setLocalFilter(e.target.value)}
            />
            <button className="btn" type="button" onClick={() => {
              try { const el = filtersCardRef.current; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (_) {}
            }}>
              Show Filters
            </button>
          </div>

          {/* Results */}
          <div className="h2" style={{ marginTop: 12 }}>Results</div>
          <div className="grid three">
            {filtered.map(item => {
              // Derive display fields from structured_json if present
              let name = ''
              let role = ''
              let skills = []
              let exp = ''
              let company = ''
              try {
                const sj = JSON.parse(item.structured_json || '{}')
                name = sj.name || ''
                role = sj.target_title || ''
                skills = Array.isArray(sj.skills) ? sj.skills.slice(0, 8) : []
                exp = sj.experience_level || ''
                company = sj.current_company || sj.employer || ''
              } catch (_) {}

              const salary = item.price != null ? `LKR ${Number(item.price).toLocaleString('en-US')}` : ''

              return (
                <div key={item.id} className="card">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {item.thumbnail_url && (
                      <img
                        src={item.thumbnail_url}
                        alt={item.title}
                        loading="lazy"
                        style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }}
                      />
                    )}
                    <div>
                      <div className="h2" style={{ margin: 0 }}>{name || item.title}</div>
                      <div className="text-muted" style={{ marginTop: 2 }}>
                        {role || '—'}{company ? ` • ${company}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-muted" style={{ marginTop: 8 }}>
                    {item.location ? item.location : ''}{exp ? ` • ${exp}` : ''}{salary ? ` • ${salary}` : ''}{item.pricing_type ? ` • ${item.pricing_type}` : ''}
                  </div>

                  {/* Skills pills */}
                  {skills.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {skills.map((s, idx) => (
                        <span key={`${item.id}-skill-${idx}`} className="pill" style={{ fontSize: 12 }}>{String(s)}</span>
                      ))}
                    </div>
                  )}

                  <p className="text-muted" style={{ marginTop: 8 }}>
                    {item.seo_description || (item.description || '').slice(0, 180)}
                  </p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => navigate(`/listing/${item.id}`)}>View</button>
                    <button className="btn" onClick={() => navigate('/jobs/post-employee')}>Contact / Hire</button>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && <p className="text-muted">No talent found.</p>}
          </div>

          {/* Pagination */}
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn page" onClick={() => setPage(Math.max(1, page - 1))} aria-label="Previous page">‹ Prev</button>
            {pageWindow.map(p => (
              <button
                key={p}
                className={`btn page ${p === page ? 'primary' : ''}`}
                onClick={() => { setPage(p); runTalentSearch() }}
                aria-label={`Go to page ${p}`}
              >
                {p}
              </button>
            ))}
            <button className="btn page" onClick={() => { setPage(page + 1); runTalentSearch() }} aria-label="Next page">Next ›</button>
          </div>

          {status && <p style={{ marginTop: 8 }}>{status}</p>}
        </div>
      </div>
    </div>

    {/* Mobile sticky action bar when filters active */}
    {hasActiveFilters && (
      <div className="mobile-actionbar" aria-label="Talent filter actions">
        <button className="btn" type="button" onClick={resetFilters} title="Reset all talent filters">Reset filters</button>
        <button
          className="btn"
          type="button"
          onClick={() => { try { const el = filtersCardRef.current; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (_) {} }}
          title="Show filters"
        >
          Filters
        </button>
      </div>
    )}

    {/* Floating CTA at bottom center: Create Talent Profile */}
    {(() => {
      const [show, setShow] = [true, () => {}]
      return (
        <div
          role="dialog"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 22,
            transform: 'translateX(-50%)',
            zIndex: 1100,
            pointerEvents: 'none'
          }}
        >
          <div
            className="card"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/jobs/post-employee')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/jobs/post-employee') } }}
            style={{
              pointerEvents: 'auto',
              display: show ? 'flex' : 'none',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 16,
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              background:
                'radial-gradient(300px 120px at 20% 0%, rgba(108,127,247,0.25), transparent 60%), ' +
                'radial-gradient(300px 120px at 80% 100%, rgba(0,209,255,0.25), transparent 60%), ' +
                'linear-gradient(180deg, rgba(29,35,48,0.98), rgba(29,35,48,0.92))',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.06)',
              animation: 'cta-pop 0.6s ease-out',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <button
                className="btn primary"
                onClick={() => navigate('/jobs/post-employee')}
                aria-label="Create Talent Profile"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  padding: 0,
                  fontSize: 18,
                  display: 'grid',
                  placeItems: 'center',
                  background:
                    'radial-gradient(120px 80px at 30% 0%, rgba(255,255,255,0.25), transparent 60%), ' +
                    '#6c7ff7',
                  boxShadow: '0 10px 25px rgba(108,127,247,0.55)',
                  position: 'relative',
                  overflow: 'visible'
                }}
                title="Create Talent Profile"
              >
                +
                <span
                  aria-hidden="true"
                  style={{
                    content: '""',
                    position: 'absolute',
                    inset: -6,
                    borderRadius: '50%',
                    boxShadow: '0 0 0 0 rgba(108,127,247,0.6)',
                    animation: 'pulse 1.6s ease-out infinite'
                  }}
                />
              </button>
              <div style={{ fontWeight: 700, fontSize: 12 }}>Create talent profile</div>
            </div>
            <style>{`
              @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(108,127,247,0.6); }
                70% { box-shadow: 0 0 0 12px rgba(108,127,247,0); }
                100% { box-shadow: 0 0 0 0 rgba(108,127,247,0); }
              }
              @keyframes cta-pop {
                0% { transform: translateY(20px) scale(0.96); opacity: 0; }
                100% { transform: translateY(0) scale(1); opacity: 1; }
              }
            `}</style>
          </div>
        </div>
      )
    })()}
    </>
  )
}