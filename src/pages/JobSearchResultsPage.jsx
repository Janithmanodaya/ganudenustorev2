import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay.jsx'

export default function JobSearchResultsPage() {
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const qParam = sp.get('q') || ''
  const [q, setQ] = useState(qParam)
  const [searchSuggestions, setSearchSuggestions] = useState([])

  // Job-focused filters (server-side / advanced)
  const [location, setLocation] = useState(sp.get('location') || '')
  const [employmentType, setEmploymentType] = useState(sp.get('employment_type') || '')
  const [experience, setExperience] = useState(sp.get('experience_level') || '')
  const [remote, setRemote] = useState(sp.get('remote') === '1')
  const [salaryMin, setSalaryMin] = useState(sp.get('salary_min') || '')
  const [salaryMax, setSalaryMax] = useState(sp.get('salary_max') || '')
  const [sort, setSort] = useState(sp.get('sort') || 'latest')
  const [page, setPage] = useState(Number(sp.get('page') || 1))

  // In-page filter (client-side)
  const [localFilter, setLocalFilter] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [results, setResults] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  // Location autocomplete
  const [locQuery, setLocQuery] = useState(location)
  const [locSuggestions, setLocSuggestions] = useState([])

  useEffect(() => {
    async function runSearch() {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        params.set('category', 'Job')
        if (qParam) params.set('q', qParam)
        if (location) params.set('location', location)
        if (salaryMin) params.set('price_min', salaryMin)
        if (salaryMax) params.set('price_max', salaryMax)
        if (page) params.set('page', String(page))
        if (sort) params.set('sort', sort)

        const filters = {}
        if (employmentType) filters.employment_type = employmentType
        if (experience) filters.experience_level = experience
        if (remote) filters.remote = 'true'

        if (Object.keys(filters).length) {
          params.set('filters', JSON.stringify(filters))
        }

        const r = await fetch(`/api/listings/search?${params.toString()}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data?.error || 'Search failed')
        setResults(Array.isArray(data.results) ? data.results : [])
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    runSearch()
  }, [qParam, location, employmentType, experience, remote, salaryMin, salaryMax, page, sort])

  useEffect(() => {
    const q = locQuery.trim()
    if (!q) { setLocSuggestions([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/listings/locations?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const data = await r.json()
        if (r.ok && Array.isArray(data.results)) setLocSuggestions(data.results)
      } catch (_) {}
    }, 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [locQuery])

  function onSubmit(e) {
    e.preventDefault()
    const next = new URLSearchParams()
    if (q.trim()) next.set('q', q.trim())
    if (location) next.set('location', location)
    if (employmentType) next.set('employment_type', employmentType)
    if (experience) next.set('experience_level', experience)
    if (remote) next.set('remote', '1')
    if (salaryMin) next.set('salary_min', salaryMin)
    if (salaryMax) next.set('salary_max', salaryMax)
    if (sort) next.set('sort', sort)
    next.set('page', '1')
    setPage(1)
    setSp(next, { replace: true })
  }

  const heading = useMemo(() => {
    const base = 'Job Search'
    return qParam ? `${base} • “${qParam}”` : base
  }, [qParam])

  // Apply client-side filter
  const filtered = useMemo(() => {
    const t = (localFilter || '').toLowerCase().trim()
    if (!t) return results
    return results.filter(job => {
      const fields = []
      fields.push(job.title || '')
      fields.push(job.location || '')
      try {
        const sj = JSON.parse(job.structured_json || '{}')
        fields.push(sj.company || sj.employer || '')
        fields.push(sj.employment_type || '')
        fields.push(sj.experience_level || '')
      } catch (_) {}
      return fields.join(' ').toLowerCase().includes(t)
    })
  }, [results, localFilter])

  return (
    <div className="center">
      {loading && <LoadingOverlay message="Searching jobs..." />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
       <div style={{
          padding: 18,
          background: 'linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))'
        }}>
          <div className="h1" style={{ textAlign: 'center' }}>{heading}</div>
          <p className="text-muted" style={{ textAlign: 'center', marginTop: 4 }}>Search roles and refine with job-specific filters.</p>

          {/* In-page filter (client-side) */}
          <div className="grid two" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Filter results on this page (title, company, location...)"
              value={localFilter}
              onChange={e => setLocalFilter(e.target.value)}
            />
            <button className="btn" type="button" onClick={() => setShowAdvanced(s => !s)}>
              {showAdvanced ? 'Hide Advanced Search' : 'Advanced Search'}
            </button>
          </div>

          {/* Advanced (server-side) */}
          {showAdvanced && (
            <form onSubmit={onSubmit} className="grid two" style={{ marginTop: 12 }}>
              <input className="input" list="job-adv-global-suggest" placeholder="Job title, skill, or company" value={q} onChange={e => setQ(e.target.value)} />
              <datalist id="job-adv-global-suggest">
                {searchSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
              <div>
                <input
                  className="input"
                  list="job-location-suggest"
                  placeholder="Location"
                  value={location}
                  onChange={e => { setLocation(e.target.value); setLocQuery(e.target.value) }}
                />
                <datalist id="job-location-suggest">
                  {locSuggestions.map(loc => <option key={loc} value={loc} />)}
                </datalist>
              </div>
              <select className="select" value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
                <option value="">Any</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
                <option value="Temporary">Temporary</option>
              </select>
              <select className="select" value={experience} onChange={e => setExperience(e.target.value)}>
                <option value="">Any</option>
                <option value="Intern">Intern</option>
                <option value="Junior">Junior</option>
                <option value="Mid">Mid</option>
                <option value="Senior">Senior</option>
                <option value="Lead">Lead</option>
              </select>
              <input className="input" type="number" placeholder="Min salary" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} />
              <input className="input" type="number" placeholder="Max salary" value={salaryMax} onChange={e => setSalaryMax(e.target.value)} />
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input id="remote" type="checkbox" checked={remote} onChange={e => setRemote(e.target.checked)} />
                <label htmlFor="remote">Remote only</label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="select" value={sort} onChange={e => setSort(e.target.value)}>
                  <option value="latest">Latest</option>
                  <option value="price_asc">Salary: Low to High</option>
                  <option value="price_desc">Salary: High to Low</option>
                </select>
                <button className="btn primary" type="submit">Apply</button>
              </div>
            </form>
          )}
        </div>

        <div style={{ padding: 18 }}>
          <div className="h2" style={{ marginTop: 0 }}>Results</div>
          <div className="grid two">
            {filtered.map(job => {
              // Extract possible job-specific info from structured_json if present
              let company = ''
              let employment = ''
              let exp = ''
              try {
                const sj = JSON.parse(job.structured_json || '{}')
                company = sj.company || sj.employer || ''
                employment = sj.employment_type || ''
                exp = sj.experience_level || ''
              } catch (_) {}

              const salary =
                job.price != null ? String(job.price) :
                ''

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
            {filtered.length === 0 && <p className="text-muted">No jobs found.</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn" onClick={() => setPage(Math.max(1, page - 1))}>Prev</button>
            <div className="text-muted">Page {page}</div>
            <button className="btn" onClick={() => setPage(page + 1)}>Next</button>
          </div>

          {status && <p style={{ marginTop: 8 }}>{status}</p>}
        </div>
      </div>
    </div>
  )
}