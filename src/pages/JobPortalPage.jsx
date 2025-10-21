import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import CustomSelect from '../components/CustomSelect.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import useSEO from '../components/useSEO.js'
import { useI18n } from '../components/i18n.jsx'

export default function JobPortalPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [q, setQ] = useState('')
  // Dynamic job filters

  // NEW: search mode toggle for Vacancies vs Talent
  // 'vacancy' = search job openings, 'talent' = search candidate profiles
  const [searchMode, setSearchMode] = useState('vacancy')

  // SEO for job portal via helper
  useSEO({
    title: 'Jobs — Ganudenu Marketplace',
    description: t('jobPortal.heroVacancySub'),
    canonical: 'https://ganudenu.store/jobs'
  })
  const [filtersDef, setFiltersDef] = useState({ keys: [], valuesByKey: {} })
  const [filters, setFilters] = useState({})
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [page, setPage] = useState(1)
  const limit = 10
  const [cardSlideIndex, setCardSlideIndex] = useState({})
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [checkingTalent, setCheckingTalent] = useState(false)

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

  async function handleListTalent() {
    try {
      const user = getUser()
      if (!user?.email) {
        navigate('/jobs/post-employee')
        return
      }
      setCheckingTalent(true)
      // First: if a draft exists, continue it
      try {
        const rd = await fetch('/api/listings/my-drafts?employee_profile=1', { headers: buildAuthHeaders() })
        const dd = await rd.json().catch(() => ({}))
        if (rd.ok && Array.isArray(dd.results) && dd.results.length > 0) {
          const d = dd.results[0]
          navigate(`/verify-employee?draftId=${encodeURIComponent(d.id)}`)
          return
        }
      } catch (_) {}
      // Then: if an active/pending profile exists, open it
      const r = await fetch('/api/listings/my', { headers: buildAuthHeaders() })
      const data = await r.json().catch(() => ({}))
      if (r.ok && Array.isArray(data.results)) {
        const found = data.results.find(x => (x.employee_profile === 1 || x.employee_profile === true) || (String(x.main_category || '') === 'Job' && isTalentProfile(x)))
        if (found) {
          const slug = String(found.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'listing'
          navigate(`/listing/${found.id}-${slug}`)
          return
        }
      }
      // Else: go to create
      navigate('/jobs/post-employee')
    } catch (_) {
      navigate('/jobs/post-employee')
    } finally {
      setCheckingTalent(false)
    }
  }

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

    // Reset to first page and refresh results on the portal based on the quick selection
    setPage(1)
    runPortalSearch(extra, term)
  }

  // Heuristic to detect whether a listing looks like a candidate profile
  function isTalentProfile(item) {
    try {
      // Name • Target Title pattern created from resume flow
      if (String(item.title || '').includes(' • ')) return true
      const sj = JSON.parse(item.structured_json || '{}')
      const hasSkills = !!(sj.skills && ((Array.isArray(sj.skills) && sj.skills.length) || (typeof sj.skills === 'string' && sj.skills.trim())))
      const hasCompany = !!(sj.company && String(sj.company).trim())
      const hasEmploymentType = !!(sj.employment_type && String(sj.employment_type).trim())
      // Candidate profiles often have skills but no company/employment_type
      if (hasSkills && !hasCompany && !hasEmploymentType) return true
      // If explicitly tagged by backend at some point
      if (sj.is_talent === true || sj.type === 'candidate') return true
    } catch (_) {}
    return false
  }

  // Apply client-side filtering based on searchMode without changing API
  const visibleResults = useMemo(() => {
    if (!Array.isArray(results) || results.length === 0) return []
    if (searchMode === 'talent') return results.filter(isTalentProfile)
    if (searchMode === 'vacancy') return results.filter(r => !isTalentProfile(r))
    return results
  }, [results, searchMode])

  async function runPortalSearch(extraFilters = {}, queryOverride = null) {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('category', 'Job')
      const query = String(queryOverride != null ? queryOverride : q).trim()
      if (query) params.set('q', query)

      // Pagination
      params.set('limit', String(limit))
      params.set('page', String(page))

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

  function nextImage(item) {
    const imgs = Array.isArray(item.small_images) ? item.small_images : []
    const len = imgs.length || 1
    setCardSlideIndex(prev => ({ ...prev, [item.id]: ((prev[item.id] || 0) + 1) % len }))
  }

  function prevImage(item) {
    const imgs = Array.isArray(item.small_images) ? item.small_images : []
    const len = imgs.length || 1
    setCardSlideIndex(prev => {
      const cur = prev[item.id] || 0
      const nxt = (cur - 1 + len) % len
      return { ...prev, [item.id]: nxt }
    })
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

  // Suggestions for job-only search terms (titles, locations, sub_category limited to Job)
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

  // Re-run when page changes
  useEffect(() => {
    runPortalSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // If user switches between modes, keep page at 1 and refresh search
  useEffect(() => {
    setPage(1)
    runPortalSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode])

  function applyJobFilters() {
    // Refresh results within the Job Portal (no navigation)
    setPage(1)
    runPortalSearch()
  }

  function resetJobFilters() {
    try {
      setQ('');
      setSalaryMin('');
      setSalaryMax('');
      setFilters({});
      setPage(1);
      runPortalSearch({}, '');
      // Scroll back to top of results
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (_) {}
    } catch (_) {}
  }

  const white = { color: '#fff' }
  const pageWindow = [page - 2, page - 1, page, page + 1, page + 2].filter(p => p >= 1)

  const hasActiveJobFilters = React.useMemo(() => {
    return !!(q || salaryMin || salaryMax || Object.keys(filters || {}).length)
  }, [q, salaryMin, salaryMax, filters])

  const searchPlaceholder = searchMode === 'talent'
    ? 'Search talent (e.g., React developer, 5 years, skills)...'
    : 'Search jobs (e.g., React developer, accountant, remote)...'

  return (
    <>
    <div className="center">
      {loading && <LoadingOverlay message={t('jobPortal.loading')} />}
      {checkingTalent && <LoadingOverlay message={t('jobPortal.checkingProfile')} />}
      <div className="card" style={{ padding: 0, overflow: 'hidden', ...white }}>
        <div style={{
          background: 'radial-gradient(1000px 300px at 10% -20%, rgba(0,209,255,0.25), transparent 60%), radial-gradient(1000px 300px at 90% 0%, rgba(108,127,247,0.25), transparent 60%), linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))',
          padding: '36px 18px',
          ...white
        }}>
          <div className="h1" style={{ textAlign: 'center', marginBottom: 8, ...white }}>
            {searchMode === 'talent' ? t('jobPortal.heroTalent') : t('jobPortal.heroVacancy')}
          </div>
          <p style={{ textAlign: 'center', marginTop: 0, ...white }}>
            {searchMode === 'talent'
              ? t('jobPortal.heroTalentSub')
              : t('jobPortal.heroVacancySub')}
          </p>

          {/* Mode toggle: Search Vacancies vs Search Talent */}
          <div className="grid two" style={{ margin: '8px auto 0', maxWidth: 720 }}>
            <button
              className={`btn ${searchMode === 'vacancy' ? 'primary' : ''}`}
              type="button"
              onClick={() => setSearchMode('vacancy')}
              title={t('jobPortal.searchVacancies')}
            >
              {t('jobPortal.searchVacancies')}
            </button>
            <button
              className={`btn ${searchMode === 'talent' ? 'primary' : ''}`}
              type="button"
              onClick={() => setSearchMode('talent')}
              title={t('jobPortal.searchTalent')}
            >
              {t('jobPortal.searchTalent')}
            </button>
          </div>

          <form onSubmit={onSearch} className="searchbar" style={{ margin: '12px auto 0', maxWidth: 720 }}>
            <input
              className="input"
              list="job-suggest"
              placeholder={searchPlaceholder}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <datalist id="job-suggest">
              {Array.isArray(searchSuggestions) ? searchSuggestions.map(s => <option key={s} value={s} />) : null}
            </datalist>
            <button className="btn primary" type="submit" style={white}>{t('common.search')}</button>
          </form>

          <div className="grid two" style={{ marginTop: 18 }}>
            <button
              className="btn accent"
              onClick={handleListTalent}
              style={{ padding: '18px', fontSize: 16, ...white }}
            >
              {t('jobPortal.listTalent')}
              <div style={{ fontWeight: 500, marginTop: 4, fontSize: 13, ...white }}>{t('jobPortal.listTalentSub')}</div>
            </button>
            <button
              className="btn primary"
              onClick={() => navigate('/new?category=Job')}
              style={{ padding: '18px', fontSize: 16, ...white }}
            >
              {t('jobPortal.listVacancy')}
              <div style={{ fontWeight: 500, marginTop: 4, fontSize: 13, ...white }}>{t('jobPortal.listVacancySub')}</div>
            </button>
          </div>
        </div>

        <div style={{ padding: 18, ...white }}>
          <div className="h2" style={{ marginTop: 0, ...white }}>{t('jobPortal.quickFilters')}</div>
          <div className="quick-cats" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" onClick={() => quick('Software Engineer')} style={white}>💻 Software</button>
            <button className="btn" onClick={() => quick('Marketing')} style={white}>📣 Marketing</button>
            <button className="btn" onClick={() => quick('Sales')} style={white}>🤝 Sales</button>
            <button className="btn" onClick={() => quick('Accounting')} style={white}>📊 Finance</button>
            <button className="btn" onClick={() => quick('Remote')} style={white}>🌍 Remote</button>
            <button className="btn" onClick={() => quick('Internship')} style={white}>🎓 Internship</button>
          </div>

          {/* In-page filters: Title, Salary Type, Salary range, and other job-specific keys (no Category, Sub Category, Model, or Description) */}
          <div ref={filtersCardRef} className="card" style={{ padding: 12, marginTop: 12, ...white }}>
            <div className="grid two">
              {/* Title selector (searchable, allows custom) */}
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>{t('jobPortal.titleLabel')}</div>
                <CustomSelect
                  value={q}
                  onChange={val => setQ(val)}
                  ariaLabel="Title"
                  placeholder="Title"
                  options={[
                    { value: '', label: 'Any' },
                    ...Array.from(new Set((filtersDef.valuesByKey['sub_category'] || []).map(v => String(v))))
                      .map(v => ({ value: v, label: v }))
                  ]}
                  searchable={true}
                  allowCustom={true}
                  virtualized={true}
                  maxDropdownHeight={420}
                />
              </div>

              {/* Salary Type (normalized: pricing_type) */}
              <div>
                <div className="text-muted" style={{ marginBottom: 4, fontSize: 12 }}>{t('jobPortal.salaryType')}</div>
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
                  virtualized={true}
                  maxDropdownHeight={420}
                />
              </div>

              {/* Salary range (normalized: price_min / price_max) */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  type="number"
                  placeholder={t('jobPortal.minSalary')}
                  value={salaryMin}
                  onChange={e => setSalaryMin(e.target.value)}
                  style={{ width: 160 }}
                />
                <input
                  className="input"
                  type="number"
                  placeholder={t('jobPortal.maxSalary')}
                  value={salaryMax}
                  onChange={e => setSalaryMax(e.target.value)}
                  style={{ width: 160 }}
                />
              </div>

              {/* Other dynamic keys from backend (excluding duplicates and hidden fields) */}
              {filtersDef.keys
                .filter(k => !['location','pricing_type','price','description','enhanced_description','sub_category','model','model_name','title','category'].includes(k))
                .map(key => (
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
                <button className="btn compact" type="button" onClick={() => setFilters({})} style={{ flex: '0 0 auto' }}>{t('common.reset')}</button>
                <button className="btn compact" type="button" onClick={resetJobFilters} title="Reset all job filters" style={{ flex: '0 0 auto' }}>{t('common.resetFilters')}</button>
                <button className="btn primary compact" type="button" onClick={applyJobFilters} style={{ flex: '0 0 auto' }}>{t('common.apply')}</button>
              </div>
            </div>
          </div>

          <div className="h2" style={{ marginTop: 12, ...white }}>{t('common.results')}</div>
          <div className="grid three">
            {visibleResults.map(item => {
              const imgs = Array.isArray(item.small_images) ? item.small_images : []
              const idx = cardSlideIndex[item.id] || 0
              const hero = imgs.length ? imgs[idx % imgs.length] : (item.thumbnail_url || null)

              function makeSlug(s) {
                const base = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                return base || 'listing';
              }
              function permalinkForItem(it) {
                const titleSlug = makeSlug(it.title || '');
                let year = '';
                try {
                  const sj = JSON.parse(it.structured_json || '{}');
                  const y = sj.manufacture_year || sj.year || sj.model_year || null;
                  if (y) year = String(y);
                } catch (_) {}
                const idCode = Number(it.id).toString(36).toUpperCase();
                const parts = [titleSlug, year, idCode].filter(Boolean);
                return `/listing/${it.id}-${parts.join('-')}`;
              }
              const talent = isTalentProfile(item)
              return (
                <div
                  key={item.id}
                  className="card"
                  onClick={() => navigate(permalinkForItem(item))}
                  style={{ cursor: 'pointer' }}
                >
                  {hero && (
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <img
                        src={hero}
                        alt={item.title}
                        loading="lazy"
                        sizes="(max-width: 780px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        style={{ width: '100%', borderRadius: 8, objectFit: 'cover', height: 180 }}
                      />
                      {imgs.length > 1 && (
                        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                          <button
                            className="btn"
                            type="button"
                            onClick={(e) => { e.stopPropagation(); prevImage(item) }}
                            aria-label="Previous image"
                          >‹</button>
                          <button
                            className="btn"
                            type="button"
                            onClick={(e) => { e.stopPropagation(); nextImage(item) }}
                            aria-label="Next image"
                          >›</button>
                        </div>
                      )}
                      {talent && (
                        <div style={{ position: 'absolute', left: 8, top: 8 }}>
                          <span className="badge" style={{ background: '#0ea5e9', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
                            Talent
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div className="h2" style={{ marginTop: 0, marginBottom: 0 }}>{item.title}</div>
                    {!talent && item.price != null && (
                      <div style={{ margin: 0, whiteSpace: 'nowrap', fontSize: 14, fontWeight: 700 }}>
                        {`LKR ${Number(item.price).toLocaleString('en-US')}`}
                      </div>
                    )}
                  </div>
                  <div className="text-muted" style={{ marginBottom: 6, marginTop: 4 }}>
                    {item.location ? item.location : ''}
                    {!talent && item.pricing_type ? ` • ${item.pricing_type}` : ''}
                  </div>
                </div>
              )
            })}
            {visibleResults.length === 0 && (
             <xp className="text-muted">
                {searchMode === 'talent' ? t('jobPortal.noTalent') : t('jobPortal.noVacancies')}
            </  p>
          _code  new)</}
p>}
          </div>

          {/* Pagination */}
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn page" onClick={() => setPage(Math.max(1, page - 1))} aria-label="Previous page">{t('common.prev')}</button>
            {pageWindow.map(p => (
              <button
                key={p}
                className={`btn page ${p === page ? 'primary' : ''}`}
                onClick={() => setPage(p)}
                aria-label={`Go to page ${p}`}
              >
                {p}
              </button>
            ))}
            <button className="btn page" onClick={() => setPage(page + 1)} aria-label="Next page">{t('common.next')}</button>
          </div>

          {status && <p style={{ marginTop: 8 }}>{status}</p>}
        </div>
      </div>
    </div>

    {/* Mobile sticky reset action bar for Job Portal */}
    {hasActiveJobFilters && (
      <div className="mobile-actionbar" aria-label="Job filter actions">
        <button className="btn" type="button" onClick={resetJobFilters} title="Reset all job filters">{t('common.resetFilters')}</button>
        <button
          className="btn"
          type="button"
          onClick={() => { try { const el = filtersCardRef.current; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (_) {} }}
          title={t('common.filters')}
        >
          {t('common.filters')}
        </button>
      </div>
    )}
  </>
)
}
