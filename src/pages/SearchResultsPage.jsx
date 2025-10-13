import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import CustomSelect from '../components/CustomSelect.jsx'

export default function SearchResultsPage() {
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || ''
  const category = sp.get('category') || ''
  const navigate = useNavigate()

  // Advanced filters (query params aware)
  const [location, setLocation] = useState(sp.get('location') || '')
  const [pricingType, setPricingType] = useState(sp.get('pricing_type') || '')
  const [priceMin, setPriceMin] = useState(sp.get('price_min') || '')
  const [priceMax, setPriceMax] = useState(sp.get('price_max') || '')

  // Pagination/sort
  const [page, setPage] = useState(Number(sp.get('page') || 1))
  const [sort, setSort] = useState(sp.get('sort') || 'latest')
  const limit = 10 // Always show latest 10 results per page

  const [filtersDef, setFiltersDef] = useState({ keys: [], valuesByKey: {} })
  const [filters, setFilters] = useState({})
  const [results, setResults] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  // Location autocomplete
  const [locQuery, setLocQuery] = useState(location)
  const [locSuggestions, setLocSuggestions] = useState([])

  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    async function loadFilters() {
      if (!category) return
      try {
        const r = await fetch(`/api/listings/filters?category=${encodeURIComponent(category)}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load filters')
        setFiltersDef({ keys: data.keys || [], valuesByKey: data.valuesByKey || {} })
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      }
    }
    loadFilters()
  }, [category])

  useEffect(() => {
    async function runSearch() {
      try {
        setLoading(true)
        const query = new URLSearchParams()
        if (q) query.set('q', q)
        if (category) query.set('category', category)
        if (location) query.set('location', location)
        if (pricingType) query.set('pricing_type', pricingType)
        if (priceMin) query.set('price_min', priceMin)
        if (priceMax) query.set('price_max', priceMax)
        if (page) query.set('page', String(page))
        if (sort) query.set('sort', String(sort))
        query.set('limit', String(limit))

        const filtersStr = JSON.stringify(filters)
        if (Object.keys(filters).length) query.set('filters', filtersStr)

        const url = `/api/listings/search?${query.toString()}`
        const r = await fetch(url)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Search failed')
        setResults(data.results || [])
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    runSearch()
  }, [q, category, filters, location, pricingType, priceMin, priceMax, page, sort])

  // Location suggestions fetching (debounced)
  useEffect(() => {
    const term = (locQuery || '').trim()
    if (!term) { setLocSuggestions([]); return }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/listings/locations?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await r.json()
        if (r.ok) setLocSuggestions(Array.isArray(data.results) ? data.results : [])
      } catch (_) {}
    }, 250)
    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [locQuery])

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function onApplyAdvanced(e) {
    e.preventDefault()
    // Do NOT apply any selected advanced filters. Reset to default latest results.
    setLocation('')
    setPricingType('')
    setPriceMin('')
    setPriceMax('')
    setFilters({})
    setSort('latest')
    setPage(1)

    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (category) next.set('category', category)
    next.set('page', '1')
    next.set('sort', 'latest')
    next.set('limit', String(limit))
    setSp(next, { replace: true })
  }

  function resetAdvancedFilters() {
    // Reset state first
    setLocation('');
    setPricingType('');
    setPriceMin('');
    setPriceMax('');
    setFilters({});
    setSort('latest');
    setPage(1);
    // Then force a full page refresh to ensure a pristine state
    window.location.reload();
  }

  const heading = useMemo(() => {
    const base = 'Search Results'
    if (category) return `${base} • ${category}`
    return base
  }, [category])

  // Build pagination window (around 5 pages centered on current)
  const pageWindow = [page - 2, page - 1, page, page + 1, page + 2].filter(p => p >= 1)

  return (
    <div className="center">
      {loading && <LoadingOverlay message="Searching listings..." />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: 18,
          background: 'linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))'
        }}>
          <div className="h1" style={{ textAlign: 'center' }}>{heading}</div>
          <p className="text-muted" style={{ textAlign: 'center', marginTop: 4 }}>{q ? `Query: "${q}"` : 'Browse the latest listings.'}</p>

          {/* Advanced toggle */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <button className="btn" type="button" onClick={() => setShowAdvanced(s => !s)}>
              {showAdvanced ? 'Hide Advanced Search' : 'Advanced Search'}
            </button>
          </div>

          {showAdvanced && (
            <>
              <div className="h2" style={{ marginTop: 8 }}>Advanced</div>
              <form onSubmit={onApplyAdvanced} className="grid two">
                <div>
                  <input
                    className="input"
                    list="location-suggest"
                    placeholder="Location"
                    value={location}
                    onChange={e => { setLocation(e.target.value); setLocQuery(e.target.value) }}
                  />
                  <datalist id="location-suggest">
                    {locSuggestions.map(loc => <option key={loc} value={loc} />)}
                  </datalist>
                </div>
                <CustomSelect
                  value={pricingType}
                  onChange={v => setPricingType(v)}
         <option value="">Pricing (any)</option>
                  <option value="Fixed Price">Fixed Price</option>
                  <option value="Negotiable">Negotiable</option>
                </select>
                <input className="input" type="number" placeholder="Min price" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                <input className="input" type="number" placeholder="Max price" value={priceMax} onChange={e => setPriceMax(e.target.value)} />

                {/* Dynamic filters from structured_json */}
                {category && filtersDef.keys.length > 0 && (
                  <>
                    {(() => {
                      const pretty = (k) => {
                        if (!k) return '';
                        const map = {
                          model: 'Model',
                          model_name: 'Model',
                          manufacture_year: 'Manufacture Year',
                          sub_category: 'Sub-category',
                          pricing_type: 'Pricing',
                        };
                        if (map[k]) return map[k];
                        return String(k).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
                      };
                      const asInputKeys = new Set(['manufacture_year', 'sub_category', 'model', 'model_name']);
                      return filtersDef.keys
                        .filter(k => !['location','pricing_type','price'].includes(k))
                        .map(key => {
                          const values = (filtersDef.valuesByKey[key] || []).map(v => String(v));
                          if (asInputKeys.has(key)) {
                            const listId = `adv-filter-${key}-list`;
                            return (
                              <div key={key}>
                                <input
                                  className="input"
                                  list={listId}
                                  placeholder={`${pretty(key)} (any)`}
                                  value={filters[key] || ''}
                                  onChange={e => updateFilter(key, e.target.value)}
                                  aria-label={key}
                                />
                                <datalist id={listId}>
                                  {values.map(v => <option key={v} value={v} />)}
                                </datalist>
                              </div>
                            );
                          }
                          return (
                           <<CustomSelect
                              key={key}
                              value={filters[key]                        value={filters[key] || ''}
                              onChange={e => updateFilter(key, e.target.value)}
                              aria-label={key}
                            >
                              <option value="">{pretty(key)} (any)</option>
                              {values.map(v => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          );
                        });
                    })()}
                  </>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <CustomSelect
                    value={sort}
                    onChange={v => setSort(v)}
                    ariaLabel>Latest</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>
                  <button className="btn accent" type="submit">Apply</button>
                  <button className="btn" type="button" onClick={resetAdvancedFilters}>Reset</button>
                </div>
              </form>
            </>
          )}
        </div>

        <div style={{ padding: 18 }}>
          <div className="h2" style={{ marginTop: 0 }}>Results</div>
          <div className="grid three">
            {results.map(r => {
              let expires = ''
              if (r.valid_until) {
                const diff = new Date(r.valid_until).getTime() - Date.now()
                const days = Math.max(0, Math.ceil(diff / (1000*60*60*24)))
                expires = `Expires in ${days} day${days === 1 ? '' : 's'}`
              }
              const imgs = Array.isArray(r.small_images) ? r.small_images : []
              const hero = imgs.length ? imgs[0] : (r.thumbnail_url || null)

              return (
                <div
                  key={r.id}
                  className="card"
                  onClick={() => navigate(`/listing/${r.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  {hero && (
                    <img src={hero} alt={r.title} style={{ width: '100%', height: 160, borderRadius: 8, marginBottom: 8, objectFit: 'cover' }} />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div className="h2" style={{ margin: '6px 0' }}>{r.title}</div>
                    {r.price != null && (
                      <div style={{ margin: '6px 0', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 700 }}>
                        {`LKR ${Number(r.price).toLocaleString('en-US')}`}
                      </div>
                    )}
                  </div>
                  <div className="text-muted" style={{ marginBottom: 6 }}>
                    {r.location ? r.location : ''}
                    {r.pricing_type ? ` • ${r.pricing_type}` : ''}
                    {expires ? ` • ${expires}` : ''}
                  </div>
                </div>
              )
            })}
            {results.length === 0 && <p className="text-muted">No results yet.</p>}
          </div>
          {/* Pagination */}
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn page" onClick={() => setPage(Math.max(1, page - 1))} aria-label="Previous page">‹ Prev</button>
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
            <button className="btn page" onClick={() => setPage(page + 1)} aria-label="Next page">Next ›</button>
          </div>

          {status && <p style={{ marginTop: 8 }}>{status}</p>}
        </div>
      </div>
    </div>
  )
}
