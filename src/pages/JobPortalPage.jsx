import React, { useEffect, useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import CustomSelect from '../components/CustomSelect.jsx'

export default function JobPortalPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState([])

  // Dynamic job filters
  const [filtersDef, setFiltersDef] = useState({ keys: [], valuesByKey: {} })
  const [filters, setFilters] = useState({})

  function onSearch(e) {
    e.preventDefault()
    const query = (q || '').trim()
    const url = query ? `/jobs/search?q=${encodeURIComponent(query)}` : '/jobs/search'
    navigate(url)
  }

  const filtersCardRef = useRef(null)

  function quick(term) {
    // Stay on Job Portal; update in-page filters and search input instead of navigating
    const t = String(term || '').toLowerCase()
    const patch = {}

    if (t.includes('software')) {
      patch.sub_category = 'IT/Software'
    } else if (t.includes('marketing') || t.includes('sales')) {
      patch.sub_category = 'Sales/Marketing'
    } else if (t.includes('account')) {
      patch.sub_category = 'Accounting/Finance'
    } else if (t.includes('intern')) {
      patch.employment_type = 'Internship'
    } else if (t.includes('remote')) {
      // No canonical structured key for remote; set the search box for convenience
    }

    // Reflect selection in the main search box
    setQ(term)

    // Apply structured filter patch
    if (Object.keys(patch).length) {
      setFilters(prev => ({ ...prev, ...patch }))
    }

    // Scroll the filters card into view for immediate refinement on mobile
    try {
      const el = filtersCardRef.current
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch (_) {}
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
    const params = new URLSearchParams()
    params.set('category', 'Job')
    if (Object.keys(filters).length) {
      params.set('filters', JSON.stringify(filters))
    }
    navigate(`/jobs/search?${params.toString()}`)
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

          {/* Dynamic in-page filter: sub_category, model, and any job-specific keys */}
          {filtersDef.keys.length > 0 && (
            <div ref={filtersCardRef} className="card" style={{ padding: 12, marginTop: 12, ...white }}>
              <div className="grid two">
                {filtersDef.keys.filter(k => !['location','pricing_type','price'].includes(k)).map(key => (
                  <div key={key}>
                    <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>
                      {String(key).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                    </div>
                    <CustomSelect
                      value={filters[key] || ''}
                      onChange={val => updateFilter(key, val)}
                      ariaLabel={key}
                      placeholder={String(key).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                      options={[
                        { value: '', label: 'Any' },
                        ...((filtersDef.valuesByKey[key] || []).map(v => ({ value: String(v), label: String(v) })))
                      ]}
                      searchable={true}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setFilters({})}>Clear</button>
                  <button className="btn primary" type="button" onClick={applyJobFilters}>Apply</button>
                </div>
              </div>
            </div>
          )}

          
        </div>
      </div>
    </div>
  )
}