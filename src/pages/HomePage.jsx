import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay.jsx'

import CustomSelect from '../components/CustomSelect.jsx'

export default function HomePage() {
  const [q, setQ] = useState('')
  const [latest, setLatest] = useState([])
  const [status, setStatus] = useState(null)
  const [localFilter, setLocalFilter] = useState('')
  const [banners, setBanners] = useState([])
  const [slide, setSlide] = useState(0)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [showFilters, setShowFilters] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterPriceMin, setFilterPriceMin] = useState('')
  const [filterPriceMax, setFilterPriceMax] = useState('')
  const [filtersDef, setFiltersDef] = useState({ keys: [], valuesByKey: {} })
  const [filters, setFilters] = useState({})
  const [locQuery, setLocQuery] = useState('')
  const [locSuggestions, setLocSuggestions] = useState([])
  const [sort, setSort] = useState('latest')

  // Global search suggestions
  const [searchSuggestions, setSearchSuggestions] = useState([])

  // Autocomplete queries for sub_category and model
  const [subCategoryQuery, setSubCategoryQuery] = useState('')
  const [modelQuery, setModelQuery] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const limit = 10

  // Suggestions derived from filtersDef values
  const subCategoryOptions = useMemo(() => {
    const arr = (filtersDef.valuesByKey['sub_category'] || []).map(v => String(v))
    const q = (subCategoryQuery || '').toLowerCase().trim()
    if (!q) return arr.slice(0, 25)
    return arr.filter(v => v.toLowerCase().includes(q)).slice(0, 25)
  }, [filtersDef, subCategoryQuery])
  const modelOptions = useMemo(() => {
    const arr = (filtersDef.valuesByKey['model'] || []).map(v => String(v))
    const q = (modelQuery || '').toLowerCase().trim()
    if (!q) return arr.slice(0, 25)
    return arr.filter(v => v.toLowerCase().includes(q)).slice(0, 25)
  }, [filtersDef, modelQuery])

  function onSearch(e) {
    e.preventDefault()
    const query = q.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  useEffect(() => {
    async function loadAll() {
      try {
        setLoading(true)
        const initialSort = filterCategory ? 'latest' : 'random'
        const [lr, br] = await Promise.all([
          fetch(`/api/listings/search?limit=${limit}&page=${page}&sort=${initialSort}`),
          fetch('/api/banners')
        ])
        // listings
        if (lr.status === 204) {
          setLatest([])
        } else {
          const ct = lr.headers.get('content-type') || ''
          const ltext = await lr.text()
          const ldata = ct.includes('application/json') && ltext ? JSON.parse(ltext) : {}
          if (!lr.ok) throw new Error((ldata && ldata.error) || 'Failed to load listings')
          const items = Array.isArray(ldata.results) ? ldata.results : []
          setLatest(items)
        }
        // banners
        const bdata = await br.json().catch(() => ({}))
        if (br.ok && Array.isArray(bdata.results)) {
          setBanners(bdata.results)
        }
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [page, refreshKey])

  // Load dynamic filters when a category is selected
  useEffect(() => {
    async function loadFilters() {
      if (!filterCategory) { setFiltersDef({ keys: [], valuesByKey: {} }); setFilters({}); return }
      try {
        const r = await fetch(`/api/listings/filters?category=${encodeURIComponent(filterCategory)}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load filters')
        setFiltersDef({ keys: data.keys || [], valuesByKey: data.valuesByKey || {} })
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      }
    }
    loadFilters()
  }, [filterCategory])

  useEffect(() => {
    if (!banners.length) return
    const timer = setInterval(() => {
      setSlide(s => (s + 1) % banners.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [banners])

  // NOTE: We intentionally DO NOT refetch listings when filters change on the Home page.
  // Pressing "Apply" will show the default latest 10 listings.

  // Fetch global search suggestions (titles, locations, sub_category, model)
  useEffect(() => {
    const term = (q || '').trim()
    if (!term) { setSearchSuggestions([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/listings/suggestions?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await r.json()
        if (r.ok && Array.isArray(data.results)) setSearchSuggestions(data.results)
      } catch (_) {}
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  // Location suggestions fetching (debounced) for Home filters
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

  const [cardSlideIndex, setCardSlideIndex] = useState({})
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

  // Client-side filtering with AND logic across multiple selected filters.
  const filtered = useMemo(() => {
    const t = (localFilter || '').toLowerCase().trim()
    return latest.filter(item => {
      const parts = [
        item.title || '',
        item.main_category || '',
        item.location || '',
        item.seo_description || item.description || ''
      ]
      const textMatch = t ? parts.join(' ').toLowerCase().includes(t) : true

      const categoryOk = filterCategory ? (item.main_category || '') === filterCategory : true
      const locationOk = filterLocation ? (item.location || '').toLowerCase().includes(filterLocation.toLowerCase()) : true
      const priceVal = item.price != null ? Number(item.price) : null
      const priceMinOk = filterPriceMin ? (priceVal != null && priceVal >= Number(filterPriceMin)) : true
      const priceMaxOk = filterPriceMax ? (priceVal != null && priceVal <= Number(filterPriceMax)) : true

      // Structured filters (exact match except partial for model/sub_category)
      let structuredOk = true
      if (Object.keys(filters).length) {
        try {
          const raw = JSON.parse(item.structured_json || '{}')
          const sj = Object.fromEntries(Object.entries(raw).map(([k, v]) => [String(k).toLowerCase(), v]))
          for (const [k, v] of Object.entries(filters)) {
            const key = String(k).toLowerCase()
            const val = String(v || '').toLowerCase()
            if (!val) continue
            // Map UI key 'model' to stored 'model_name'
            const lookupKey = key === 'model' ? 'model_name' : key
            const target = sj[lookupKey]
            const targetStr = String(target || '').toLowerCase()
            if (lookupKey === 'model_name' || lookupKey === 'sub_category') {
              if (!targetStr.includes(val)) { structuredOk = false; break }
            } else {
              if (targetStr !== val) { structuredOk = false; break }
            }
          }
        } catch (_) {}
      }

      // AND all conditions
      return textMatch && categoryOk && locationOk && priceMinOk && priceMaxOk && structuredOk
    })
  }, [latest, localFilter, filterCategory, filterLocation, filterPriceMin, filterPriceMax, filters])

  // Compute 3-wide window for banners
  const visibleBanners = useMemo(() => {
    if (!banners.length) return []
    const arr = []
    for (let i = 0; i < Math.min(3, banners.length); i++) {
      const idx = (slide + i) % banners.length
      arr.push(banners[idx])
    }
    return arr
  }, [banners, slide])

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  async function applyHomeFilters() {
    try {
      setLoading(true)
      setShowFilters(false)
      // Build server-side query based on current filter selections and keep current page
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('page', String(page))
      const effectiveSort = filterCategory ? String(sort || 'latest') : 'random'
      params.set('sort', effectiveSort)
      if (filterCategory) params.set('category', filterCategory)
      if (filterLocation) params.set('location', filterLocation)
      if (filterPriceMin) params.set('price_min', filterPriceMin)
      if (filterPriceMax) params.set('price_max', filterPriceMax)
      if (Object.keys(filters).length) params.set('filters', JSON.stringify(filters))

      const r = await fetch(`/api/listings/search?${params.toString()}`)
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || 'Failed to load filtered listings')
      setLatest(Array.isArray(data.results) ? data.results : [])
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  function resetHomeFilters() {
    try {
      setFilterCategory('');
      setFilterLocation('');
      setFilterPriceMin('');
      setFilterPriceMax('');
      setFilters({});
      setShowFilters(false);
      // Trigger reload of latest listings
      setRefreshKey(k => k + 1)
    } catch (_) {}
  }

  // Build pagination window (around 5 pages centered on current)
  const pageWindow = [page - 2, page - 1, page, page + 1, page + 2].filter(p => p >= 1)

  return (
    <div className="center">
      {loading && <LoadingOverlay message="Loading latest listings..." />}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: '42px 18px',
            background:
              'radial-gradient(1000px 300px at 10% -20%, rgba(0,209,255,0.25), transparent 60%), ' +
              'radial-gradient(1000px 300px at 90% 0%, rgba(108,127,247,0.25), transparent 60%), ' +
              'linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))'
          }}
        >
          <h1 className="h1" style={{ textAlign: 'center', marginBottom: 8 }}>Buy • Sell • Hire</h1>
          <p className="text-muted" style={{ textAlign: 'center', marginTop: 0 }}>
            Discover great deals on vehicles, property, jobs, electronics, mobiles, and home &amp; garden.
          </p>

          <form onSubmit={onSearch} className="searchbar" style={{ margin: '16px auto 0', maxWidth: 720 }}>
            <input
              className="input"
              type="text"
              list="global-suggest"
              placeholder="Search anything (e.g., Toyota, House in Kandy, Accountant)..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <datalist id="global-suggest">
              {(function() {
                // Inline render: suggestions computed via useEffect below
                return (globalThis && Array.isArray(globalThis.__home_suggestions)) ? globalThis.__home_suggestions.map(s => <option key={s} value={s} />) : null
              })()}
            </datalist>
            <button className="btn primary" type="submit">Search</button>
          </form>

          <div className="quick-cats" style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={`btn ${filterCategory === 'Vehicle' ? 'accent' : ''}`} type="button" onClick={() => { setFilterCategory('Vehicle'); setShowFilters(true); }}>🚗 Vehicles</button>
            <button className={`btn ${filterCategory === 'Property' ? 'accent' : ''}`} type="button" onClick={() => { setFilterCategory('Property'); setShowFilters(true); }}>🏠 Property</button>
            <button className={`btn ${filterCategory === 'Job' ? 'accent' : ''}`} type="button" onClick={() => { setFilterCategory('Job'); setShowFilters(true); }}>💼 Jobs</button>
            <button className={`btn ${filterCategory === 'Electronic' ? 'accent' : ''}`} type="button" onClick={() => { setFilterCategory('Electronic'); setShowFilters(true); }}>🔌 Electronic</button>
            <button className={`btn ${filterCategory === 'Mobile' ? 'accent' : ''}`} type="button" onClick={() => { setFilterCategory('Mobile'); setShowFilters(true); }}>📱 Mobile</button>
            <button className={`btn ${filterCategory === 'Home Garden' ? 'accent' : ''}`} type="button" onClick={() => { setFilterCategory('Home Garden'); setShowFilters(true); }}>🏡 Home&nbsp;Garden</button>
          </div>
        </div>

        {/* Banner slider - shows up to 3 wide, auto-rotates */}
        {visibleBanners.length > 0 && (
          <div style={{ padding: 18 }}>
            <div className="grid three">
              {visibleBanners.map(b => (
                <div key={b.id} className="card" style={{ padding: 0 }}>
                  <img
                    src={b.url}
                    alt="Banner"
                    style={{
                      width: '100%',
                      height: 180,
                      objectFit: 'cover',
                      borderRadius: 12
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 18 }}>
          <div className="h2" style={{ marginTop: 0 }}>{filterCategory ? `${filterCategory} listings` : 'Latest listings'}</div>

          {/* Filters dropdown toggle */}
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" type="button" onClick={() => setShowFilters(s => !s)}>
              {showFilters ? 'Hide Filters' : 'Filters'}
            </button>
          </div>

          {showFilters && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="grid two">
                <CustomSelect
                  value={filterCategory}
                  onChange={v => setFilterCategory(v)}
                  ariaLabel="Category"
                  placeholder="Category (any)"
                  options={[
                    { value: '', label: 'Category (any)' },
                    { value: 'Vehicle', label: 'Vehicle' },
                    { value: 'Property', label: 'Property' },
                    { value: 'Job', label: 'Job' },
                    { value: 'Electronic', label: 'Electronic' },
                    { value: 'Mobile', label: 'Mobile' },
                    { value: 'Home Garden', label: 'Home Garden' },
                  ]}
                />
                <input
                  className="input"
                  list="home-location-suggest"
                  placeholder="Location"
                  value={filterLocation}
                  onChange={e => { setFilterLocation(e.target.value); setLocQuery(e.target.value) }}
                />
                <datalist id="home-location-suggest">
                  {locSuggestions.map(loc => <option key={loc} value={loc} />)}
                </datalist>
                <input className="input" type="number" placeholder="Min price" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)} />
                <input className="input" type="number" placeholder="Max price" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)} />

                {/* Dynamic sub_category/model and other keys */}
                {filterCategory && filtersDef.keys.length > 0 && (() => {
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
                    // Fallback: title-case underscores
                    return String(k).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
                  };
                  const asInputKeys = new Set(['manufacture_year', 'sub_category', 'model', 'model_name']);
                  return filtersDef.keys
                    .filter(k => !['location','pricing_type','price'].includes(k))
                    .map(key => {
                      const values = (filtersDef.valuesByKey[key] || []).map(v => String(v));
                      if (asInputKeys.has(key)) {
                        const listId = `home-filter-${key}-list`;
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
                        <CustomSelect
                          key={key}
                          value={filters[key] || ''}
                          onChange={val => updateFilter(key, val)}
                          ariaLabel={key}
                          placeholder={`${pretty(key)} (any)`}
                          options={[{ value: '', label: `${pretty(key)} (any)` }, ...values.map(v => ({ value: v, label: v }))]}
                        />
                      );
                    });
                })()}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <CustomSelect
                    value={sort}
                    onChange={v => setSort(v)}
                    ariaLabel="Sort"
                    placeholder="Sort"
                    options={[
                      { value: 'latest', label: 'Latest' },
                      { value: 'price_asc', label: 'Price: Low to High' },
                      { value: 'price_desc', label: 'Price: High to Low' },
                    ]}
                  />
                  <button className="btn accent" type="button" onClick={applyHomeFilters}>
                    Apply
                  </button>
                  <button className="btn" type="button" onClick={resetHomeFilters}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          {(() => {
            const displayList = filterCategory ? latest.filter(it => (it.main_category || '') === filterCategory) : latest
            return (
              <div className="grid three">
                {displayList.map(item => {
                  let expires = ''
                  if (item.valid_until) {
                    const diff = new Date(item.valid_until).getTime() - Date.now()
                    const days = Math.max(0, Math.ceil(diff / (1000*60*60*24)))
                    expires = `Expires in ${days} day${days === 1 ? '' : 's'}`
                  }
                  const imgs = Array.isArray(item.small_images) ? item.small_images : []
                  const idx = cardSlideIndex[item.id] || 0
                  const hero = imgs.length ? imgs[idx % imgs.length] : (item.thumbnail_url || null)

                  return (
                    <div key={item.id} className="card" onClick={() => navigate(`/listing/${item.id}`)} style={{ cursor: 'pointer' }}>
                      {/* Small image slider */}
                      {hero && (
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                          <img
                            src={hero}
                            alt={item.title}
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
                        </div>
                      )}
                      <div className="text-muted" style={{ marginBottom: 6 }}>{item.main_category}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <div className="h2" style={{ marginTop: 0, marginBottom: 0 }}>{item.title}</div>
                        {item.price != null && (
                          <div style={{ margin: 0, whiteSpace: 'nowrap', fontSize: 14, fontWeight: 700 }}>
                            {`LKR ${Number(item.price).toLocaleString('en-US')}`}
                          </div>
                        )}
                      </div>
                      <div className="text-muted" style={{ marginBottom: 6, marginTop: 4 }}>
                        {item.location ? item.location : ''}
                        {item.pricing_type ? ` • ${item.pricing_type}` : ''}
                        {expires ? ` • ${expires}` : ''}
                      </div>
                      
                    </div>
                  )
                })}
                {displayList.length === 0 && (
                  <p className="text-muted">No listings yet.</p>
                )}
              </div>
            )
          })()}

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
