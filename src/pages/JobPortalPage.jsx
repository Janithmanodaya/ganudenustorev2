import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import CustomSelect from '../components/CustomSelect.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'

export default function JobPortalPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState([])

  // Dynamic job filters
  const [filtersDef, setFiltersDef] = useState({ keys: [], valuesByKey: {} })
  const [filters, setFilters] = useState({})
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')

  function onSearch(e) {
    e.preventDefault()
    const query = (q || '').trim()
    const url = query ? `/jobs/search?q=${encodeURIComponent(query)}` : '/jobs/search'
    navigate(url)
  }

  const filtersCardRef = useRef(null)

  function quick(term) {
    // Stay on Job Portal; set the Title (search text) instead of navigating
    const t = String(term || '').toLowerCase()
    setQ(term)

    // Special case: Internship maps to employment_type
    let extra = {}
    if (t.includes('intern')) {
      extra = { employment_type: 'Internship' }
      setFilters(prev => ({ ...prev, ...extra }))
    }

    // Scroll the filters card into view for immediate refinement on mobile
    try {
      const el = filtersCardRef.current
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch (_) {}

    // Immediately refresh results on the portal based on the quick selection
    runPortalSearch(extra, term)
  }

  async function runPortalSearch(extraFilters = {}, queryOverride = null) {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('category', 'Job')
      const query = String(queryOverride != null ? queryOverride : q).trim()
      if (query) params.set('q', query)

      // Salary range as normalized query params
      if (salaryMin) params.set('price_min', String(salaryMin))
      if (salaryMax) params.set('price_max', String(salaryMax))

      const eff = { ...(filters || {}), ...(extraFilters || {}) }
      const effClean = Object.fromEntries(Object.entries(eff).filter(([_, v]) => v != null && String(v) !== ''))
      if (Object.keys(effClean).length) {
        params.set('filters', JSON.stringify(effClean))
      }

      const r = await fetch(`/api/listings/search?${params.toString()}`)
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || 'Failed to load jobs')
      setResults(Array.isArray(data.results) ? data.results : [])
      setStatus(null)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    async function loadFilters() {
      try {
        const r = await fetch('/api/listings/filters?category=Job')
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load job filters')
        setFiltersDef({ keys: data.keys || [], valuesByKey: data.valuesByKey || {} })
      } catch (_) {}
    }
    loadFilters()
  }, [])

  // Initial jobs load on portal
  useEffect(() => {
    runPortalSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Suggestions for the job search input (includes titles, locations, sub_category, model)
  useEffect(() => {
    const term = (q || '').trim()
    if (!term) { setSearchSuggestions([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/listings/suggestions?q=${encodeURIComponent(term)}&category=Job`, { signal: ctrl.signal })
        const data = await r.json()
        if (r.ok && Array.isArray(data.results)) setSearchSuggestions(data.results)
      } catch (_) {}
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  function applyJobFilters() {
    // Refresh results within the Job Portal (no navigation)
    runPortalSearch()
  }

  const white = { color: '#fff' }

  return (
    <div className="center">
      <div className="card" style={{ padding: 0, overflow: 'hidden', ...white }}>
        <div style={{
          background: 'radial-gradient(1000px 300px at 10% -20%, rgba(0,209,255,0.25), transparent 60%), radial-gradient(1000px 300px at 90% 0%, rgba(108,127,247,0.25), transparent 60%), linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))',
          padding: '36px 18px',
          ...white
        }}>
          <div className="h1" style={{ textAlign: 'center', marginBottom: 8, ...white }}>Find your next role or list your vacancy</div>
          <p style={{ textAlign: 'center', marginTop: 0, ...white }}>
            Explore opportunities or publish openings in minutes.
          </p>

          <form onSubmit={onSearch} className="searchbar" style={{ margin: '16px auto 0', maxWidth: 720 }}>
            <input
              className="input"
              placeholder="Search jobs (e.g., React developer, accountant, remote)..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <button className="btn primary" type="submit" style={white}>Search</button>
          </form>

          <div className="grid two" style={{ marginTop: 18 }}>
            <button
              className="btn accent"
              onClick={() => navigate('/jobs/post-employee')}
              style={{ padding: '18px', fontSize: 16, ...white }}
            >
              👤 List Talent
              <div style={{ fontWeight: 500, marginTop: 4, fontSize: 13, ...white }}>Upload your profile to get discovered</div>
            </button>
            <button
              className="btn primary"
              onClick={() => navigate('/new?category=Job')}
              style={{ padding: '18px', fontSize: 16, ...white }}
            >
              📢 List Vacancy
              <div style={{ fontWeight: 500, marginTop: 4, fontSize: 13, ...white }}>Post your job and reach candidates</div>
            </button>
          </div>
        </div>

        <div style={{ padding: 18, ...white }}>
          <div className="h2" style={{ marginTop: 0, ...white }}>Quick filters</div>
          <div className="quick-cats" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" onClick={() => quick('Software Engineer')} style={white}>💻 Software</button>
            <button className="btn" onClick={() => quick('Marketing')} style={white}>📣 Marketing</button>
            <button className="btn" onClick={() => quick('Sales')} style={white}>🤝 Sales</button>
            <button className="btn" onClick={() => quick('Accounting')} style={white}>📊 Finance</button>
            <button className="btn" onClick={() => quick('Remote')} style={white}>🌍 Remote</button>
            <button className="btn" onClick={() => quick('Internship')} style={white}>🎓 Internship</button>
          </div>

          {/* In-page filters: Salary, Salary Type, and other job-specific keys (no Category, Sub Category, Model, or Description) */}
          <div ref={filtersCardRef} className="card" style={{ padding: 12, marginTop: 12, ...white }}>
            <div className="grid two">
              {/* Salary Type (normalized: pricing_type) */}
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>Salary Type</div>
                <CustomSelect
                  value={filters['pricing_type'] || ''}
                  onChange={val => updateFilter('pricing_type', val)}
                  ariaLabel="Salary Type"
                  placeholder="Salary Type"
                  options={[
                    { value: '', label: 'Any' },
                    ...((filtersDef.valuesByKey['pricing_type'] || []).map(v => ({ value: String(v), label: String(v) })))
                  ]}
                  searchable={true}
                />
              </div>

              {/* Salary range (normalized: price_min / price_max) */}
              <input
                className="input"
                type="number"
                placeholder="Min salary"
                value={salaryMin}
                onChange={e => setSalaryMin(e.target.value)}
              />
              <input
                className="input"
                type="number"
                placeholder="Max salary"
                value={salaryMax}
                onChange={e => setSalaryMax(e.target.value)}
              />

              {/* Other dynamic keys from backend (excluding duplicates and hidden fields) */}
              {filtersDef.keys
                .filter(k => !['location','pricing_type','price','description','enhanced_description','sub_category','model','model_name','title'].includes(k))
                .map(key => (
                  <div key={key}>
                    <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>
                  (e.target.value)}
              />
             </input
                className="input"
                type="number"
                placeholder="Max salary"
                value={salaryMax}
                onChange={e => setSalaryMax(e.target.value)}
              />

              {/* Other dynamic keys from backend (excluding duplicates and hidden fields) */}
              {filtersDef.keys
                .filter(k => !['location','pricing_type','price','description','enhanced_description','sub_category','model','model_name','title'].includes(k))
                .map(key => (
                 < div key={key}>
                   < div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>
                      {String(key).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                  </e=div>
                   <eCustomSelect
>Clear</button>
                <button className="btn primary" type="button" onClick={applyJobFilters}>Apply</button>
              </div>
            </div>
          </div>

          
        <div className="h2" style={{ marginTop: 12, ...white }}>Results</div>
          <div className="grid two">
            {results.map(job => {
              let company = ''
              let employment = ''
              let exp = ''
              try {
                const sj = JSON.parse(job.structured_json || '{}')
                company = sj.company || sj.employer || ''
                employment = sj.employment_type || ''
                exp = sj.experience_level || ''
              } catch (_) {}
              const salary = job.price != null ? String(job.price) : ''
              return (
                <div key={job.id} className="card">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {job.thumbnail_url && (
                      <img src={job.thumbnail_url} alt={job.title} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
                    )}
                    <div>
                      <div className="h2" style={{ margin: 0 }}>{job.title}</div>
                      <div className="text-muted" style={{ marginTop: 2 }}>
                        {company ? company + ' • ' : ''}{employment || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="text-muted" style={{ marginTop: 8 }}>
                    {job.location ? job.location : ''}{exp ? ` • ${exp}` : ''}{salary ? ` • ${salary}` : ''}{job.pricing_type ? ` • ${job.pricing_type}` : ''}
                  </div>

                  <p className="text-muted" style={{ marginTop: 8 }}>{job.seo_description || (job.description || '').slice(0, 180)}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link className="btn" to={`/listing/${job.id}`}>View</Link>
                    <button className="btn" onClick={() => navigate(`/listing/${job.id}`)}>Apply</button>
                  </div>
                </div>
              )
            })}
            {results.length === 0 && <p className="text-muted">No jobs found.</p>}
          </div>

          {status && <p style={{ marginTop: 8 }}>{status}</p>}
        </div>
      </div>
    </div>
  )
}