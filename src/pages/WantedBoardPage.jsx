import React, { useEffect, useMemo, useState } from 'react';

const CATEGORIES = ['Vehicle', 'Property', 'Job', 'Electronic', 'Mobile', 'Home Garden', 'Other'];

export default function WantedBoardPage() {
  const [userEmail, setUserEmail] = useState('');
  const [tab, setTab] = useState('browse'); // 'browse' | 'post' | 'mine'
  const [loading, setLoading] = useState(false);

  // Browse data
  const [requests, setRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);

  // My listings (for sellers to offer against requests)
  const [myListings, setMyListings] = useState([]);
  const [offerSelections, setOfferSelections] = useState({}); // wantedId -> listingId
  const [offerSending, setOfferSending] = useState({}); // wantedId -> boolean

  // Form state (dynamic)
  const [form, setForm] = useState({
    title: '',
    category: '',
    description: ''
  });
  const [locations, setLocations] = useState([]);
  const [locInput, setLocInput] = useState('');
  const [models, setModels] = useState([]);
  const [modelInput, setModelInput] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [priceNoMatter, setPriceNoMatter] = useState(false);

  // Dynamic filters derived from existing listings by category
  const [filtersMeta, setFiltersMeta] = useState({ keys: [], valuesByKey: {} });
  const [filterKey, setFilterKey] = useState('');
  const [filterSuggestedValue, setFilterSuggestedValue] = useState('');
  const [filterCustomValue, setFilterCustomValue] = useState('');
  const [selectedFilters, setSelectedFilters] = useState({}); // key -> [values]

  const [postStatus, setPostStatus] = useState({ ok: false, message: '' });

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      setUserEmail(user?.email || '');
    } catch (_) {
      setUserEmail('');
    }
  }, []);

  useEffect(() => {
    loadRequests();
    if (userEmail) {
      loadMyListings();
      loadMyRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  // Load dynamic filters for the selected category
  useEffect(() => {
    async function loadFilters() {
      if (!form.category) {
        setFiltersMeta({ keys: [], valuesByKey: {} });
        setSelectedFilters({});
        setFilterKey('');
        setFilterSuggestedValue('');
        setFilterCustomValue('');
        return;
      }
      try {
        const r = await fetch(`/api/listings/filters?category=${encodeURIComponent(form.category)}`);
        const data = await r.json();
        if (r.ok && Array.isArray(data.keys) && data.valuesByKey) {
          setFiltersMeta({ keys: data.keys, valuesByKey: data.valuesByKey });
        } else {
          setFiltersMeta({ keys: [], valuesByKey: {} });
        }
      } catch (_) {
        setFiltersMeta({ keys: [], valuesByKey: {} });
      }
      // reset selections when category changes
      setSelectedFilters({});
      setFilterKey('');
      setFilterSuggestedValue('');
      setFilterCustomValue('');
    }
    loadFilters();
  }, [form.category]);

  async function loadRequests() {
    setLoading(true);
    try {
      const r = await fetch('/api/wanted?limit=100');
      const data = await r.json();
      const rows = Array.isArray(data.results) ? data.results : [];
      setRequests(rows);
    } catch (_) {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadMyListings() {
    if (!userEmail) return;
    try {
      const r = await fetch('/api/listings/my', { headers: { 'X-User-Email': userEmail } });
      const data = await r.json();
      const rows = Array.isArray(data.results) ? data.results : [];
      setMyListings(rows);
    } catch (_) {
      setMyListings([]);
    }
  }

  function addLocation() {
    const v = String(locInput || '').trim();
    if (!v) return;
    setLocations(prev => (prev.includes(v) ? prev : [...prev, v]));
    setLocInput('');
  }
  function removeLocation(v) {
    setLocations(prev => prev.filter(x => x !== v));
  }
  function addModel() {
    const v = String(modelInput || '').trim();
    if (!v) return;
    setModels(prev => (prev.includes(v) ? prev : [...prev, v]));
    setModelInput('');
  }
  function removeModel(v) {
    setModels(prev => prev.filter(x => x !== v));
  }

  function addFilterValue() {
    const key = String(filterKey || '').trim();
    const val = String(filterCustomValue || filterSuggestedValue || '').trim();
    if (!key || !val) return;
    setSelectedFilters(prev => {
      const arr = prev[key] || [];
      if (arr.includes(val)) return prev;
      return { ...prev, [key]: [...arr, val] };
    });
    setFilterSuggestedValue('');
    setFilterCustomValue('');
  }
  function removeFilterValue(key, val) {
    setSelectedFilters(prev => {
      const arr = (prev[key] || []).filter(x => x !== val);
      const next = { ...prev };
      if (arr.length === 0) delete next[key];
      else next[key] = arr;
      return next;
    });
  }
  function removeFilterKey(key) {
    setSelectedFilters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Renders chips for currently selected dynamic filters with remove controls
  function renderSelectedFiltersChips() {
    const entries = Object.entries(selectedFilters || {});
    if (!entries.length) return null;
    return (
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([k, arr]) => {
          const values = Array.isArray(arr) ? arr : [];
          if (!values.length) return null;
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{k}</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {values.map((v, idx) => (
                  <span key={idx} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {v}
                    <button
                      type="button"
                      className="back-btn"
                      onClick={() => removeFilterValue(k, v)}
                      title="Remove"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => removeFilterKey(k)}
                title="Clear this filter"
                aria-label="Clear this filter"
              >
                Clear {k}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!userEmail) {
      setPostStatus({ ok: false, message: 'Please login to post a Wanted request.' });
      return;
    }
    setPostStatus({ ok: false, message: '' });
    setLoading(true);
    try {
      // Build filters payload (exclude keys that already have dedicated inputs or base fields)
      const filtersPayload = {};
      for (const [k, arr] of Object.entries(selectedFilters)) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        if (['location', 'pricing_type', 'price', 'phone', 'model'].includes(k)) continue;
        filtersPayload[k] = arr;
      }

      const payload = {
        title: form.title,
        description: form.description,
        category: form.category || '',
        locations,
        models: (form.category === 'Vehicle' || form.category === 'Mobile' || form.category === 'Electronic') ? models : [],
        year_min: form.category === 'Vehicle' && yearMin ? Number(yearMin) : '',
        year_max: form.category === 'Vehicle' && yearMax ? Number(yearMax) : '',
        price_min: priceNoMatter ? '' : (priceMin ? Number(priceMin) : ''),
        price_max: priceNoMatter ? '' : (priceMax ? Number(priceMax) : ''),
        price_not_matter: !!priceNoMatter,
        filters: filtersPayload
      };
      const r = await fetch('/api/wanted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': userEmail },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) {
        setPostStatus({ ok: false, message: data?.error || 'Failed to post request.' });
      } else {
        setPostStatus({ ok: true, message: 'Your Wanted request is live. We will notify you when matches appear.' });
        setForm({ title: '', category: '', description: '' });
        setLocations([]);
        setModels([]);
        setYearMin('');
        setYearMax('');
        setPriceMin('');
        setPriceMax('');
        setPriceNoMatter(false);
        await loadRequests();
      }
    } catch (_) {
      setPostStatus({ ok: false, message: 'Failed to post request.' });
    } finally {
      setLoading(false);
      setTab('browse');
    }
  }

  async function loadMyRequests() {
    try {
      const r = await fetch('/api/wanted/my', { headers: { 'X-User-Email': userEmail } });
      const data = await r.json();
      const rows = Array.isArray(data.results) ? data.results : [];
      setMyRequests(rows);
    } catch (_) {
      setMyRequests([]);
    }
  }

  async function closeRequest(id) {
    if (!userEmail) return;
    try {
      const r = await fetch(`/api/wanted/${id}/close`, {
        method: 'POST',
        headers: { 'X-User-Email': userEmail }
      });
      const data = await r.json();
      if (r.ok) {
        setMyRequests(prev => prev.map(x => x.id === id ? { ...x, status: 'closed' } : x));
        setRequests(prev => prev.map(x => x.id === id ? { ...x, status: 'closed' } : x));
      } else {
        alert(data?.error || 'Failed to close request.');
      }
    } catch (_) {
      alert('Failed to close request.');
    }
  }

  async function sendOffer(wantedId) {
    if (!userEmail) return;
    const listingId = offerSelections[wantedId];
    if (!listingId) {
      alert('Select one of your ads to offer for this request.');
      return;
    }
    setOfferSending(prev => ({ ...prev, [wantedId]: true }));
    try {
      const r = await fetch('/api/wanted/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': userEmail },
        body: JSON.stringify({ wanted_id: wantedId, listing_id: listingId })
      });
      const data = await r.json();
      if (!r.ok) {
        alert(data?.error || 'Failed to send offer.');
      } else {
        alert('Offer sent to buyer. We notified them about your ad.');
      }
    } catch (_) {
      alert('Failed to send offer.');
    } finally {
      setOfferSending(prev => ({ ...prev, [wantedId]: false }));
    }
  }

  const canOffer = useMemo(() => userEmail && myListings.length > 0, [userEmail, myListings]);

  function renderChips(items, onRemove) {
    if (!Array.isArray(items) || !items.length) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {items.map((v, idx) => (
          <span key={idx} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {v}
            <button type="button" className="back-btn" onClick={() => onRemove(v)} title="Remove" aria-label="Remove">×</button>
          </span>
        ))}
      </div>
    );
  }

  function parseArray(jsonText) {
    try {
      const arr = JSON.parse(String(jsonText || '[]'));
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function parseFilters(jsonText) {
    try {
      const obj = JSON.parse(String(jsonText || '{}'));
      return obj && typeof obj === 'object' ? obj : {};
    } catch (_) {
      return {};
    }
  }

  const filteredKeysForUI = (filtersMeta.keys || []).filter(k => !['location', 'pricing_type', 'price', 'phone', 'model'].includes(k));

  return (
    <div className="container">
      <div className="h1" style={{ marginTop: 0 }}>Wanted Board</div>
      <p className="text-muted" style={{ marginTop: 6 }}>
        Buyers post requests for items they’re looking for. When a new ad matches, both sides are notified immediately.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className={`btn ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse Requests</button>
        <button className={`btn ${tab === 'post' ? 'active' : ''}`} onClick={() => setTab('post')}>Post a Request</button>
        <button className={`btn ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>My Requests</button>
      </div>

      {tab === 'browse' && (
        <div style={{ marginTop: 16 }}>
          {loading && <div className="pill">Loading...</div>}
          {requests.filter(r => r.status === 'open').length === 0 && !loading && (
            <p className="text-muted">No open requests yet.</p>
          )}
          {requests.filter(r => r.status === 'open').map(r => {
            const locs = parseArray(r.locations_json);
            const modelsArr = parseArray(r.models_json);
            const filtersObj = parseFilters(r.filters_json);
            const filterEntries = Object.entries(filtersObj || {}).filter(([k]) => !['model'].includes(String(k)));
            return (
              <div key={r.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{r.title}</strong>
                  {r.price_not_matter ? (
                    <span className="pill">Price not a constraint</span>
                  ) : (
                    (r.price_min != null || r.price_max != null) && (
                      <span className="pill">
                        Budget: {r.price_min != null ? `LKR ${Number(r.price_min).toLocaleString('en-US')}` : 'Any'} - {r.price_max != null ? `LKR ${Number(r.price_max).toLocaleString('en-US')}` : 'Any'}
                      </span>
                    )
                  )}
                </div>
                <div className="text-muted" style={{ marginTop: 6 }}>
                  {r.category ? <span>Category: {r.category}</span> : <span>Category: Any</span>}
                  {(locs.length || r.location) ? <span> • Locations: {[...locs, r.location].filter(Boolean).join(', ')}</span> : null}
                  {r.category === 'Vehicle' && (r.year_min || r.year_max) ? (
                    <span> • Year: {r.year_min || 'Any'} - {r.year_max || 'Any'}</span>
                  ) : null}
                </div>
                {modelsArr.length > 0 && (r.category === 'Vehicle' || r.category === 'Mobile' || r.category === 'Electronic') && (
                  <div className="text-muted" style={{ marginTop: 6 }}>
                    Models: {modelsArr.join(', ')}
                  </div>
                )}
                {filterEntries.length > 0 && (
                  <div className="text-muted" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {filterEntries.map(([k, v]) => (
                      <span key={k} className="pill">{k}: {Array.isArray(v) ? v.join(', ') : String(v)}</span>
                    ))}
                  </div>
                )}
                {r.description && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.description}</div>}

                {canOffer && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="select"
                        value={offerSelections[r.id] || ''}
                        onChange={e => setOfferSelections(prev => ({ ...prev, [r.id]: Number(e.target.value) || '' }))}
                        style={{ minWidth: 220 }}
                      >
                        <option value="">Select one of your ads</option>
                        {myListings.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.title} {typeof l.price === 'number' ? `• LKR ${Number(l.price).toLocaleString('en-US')}` : ''}
                          </option>
                        ))}
                      </select>
                      <button className="btn" onClick={() => sendOffer(r.id)} disabled={!offerSelections[r.id] || offerSending[r.id]}>
                        {offerSending[r.id] ? 'Sending...' : 'Offer this ad'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'post' && (
        <form className="card" style={{ marginTop: 16 }} onSubmit={submitForm}>
          <div className="h2" style={{ marginTop: 0 }}>Post a Wanted Request</div>

          <label className="label">Title</label>
          <input
            className="input"
            required
            minLength={6}
            placeholder="Wanted: Used Nikon D750 camera, Max Budget LKR 150,000"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
          />

          <label className="label" style={{ marginTop: 10 }}>Category</label>
          <select
            className="select"
            value={form.category}
            onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
          >
            <option value="">Any</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="card" style={{ marginTop: 10 }}>
            <div className="h3" style={{ marginTop: 0 }}>Locations</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                placeholder="Add a location (e.g., Colombo)"
                value={locInput}
                onChange={e => setLocInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLocation(); }}}
                style={{ minWidth: 200 }}
              />
              <button className="btn" type="button" onClick={addLocation}>Add</button>
            </div>
            {renderChips(locations, removeLocation)}
          </div>

          {(form.category === 'Vehicle' || form.category === 'Mobile' || form.category === 'Electronic') && (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="h3" style={{ marginTop: 0 }}>Models (optional)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  placeholder="Add model (e.g., Toyota Aqua)"
                  value={modelInput}
                  onChange={e => setModelInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModel(); }}}
                  style={{ minWidth: 200 }}
                />
                <button className="btn" type="button" onClick={addModel}>Add</button>
              </div>
              {renderChips(models, removeModel)}
            </div>
          )}

          {form.category === 'Vehicle' && (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="h3" style={{ marginTop: 0 }}>Year Range (optional)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  type="number"
                  min="1950"
                  max="2100"
                  placeholder="Min year"
                  value={yearMin}
                  onChange={e => setYearMin(e.target.value)}
                  style={{ width: 140 }}
                />
                <input
                  className="input"
                  type="number"
                  min="1950"
                  max="2100"
                  placeholder="Max year"
                  value={yearMax}
                  onChange={e => setYearMax(e.target.value)}
                  style={{ width: 140 }}
                />
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 10 }}>
            <div className="h3" style={{ marginTop: 0 }}>Price Range</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={priceNoMatter} onChange={e => setPriceNoMatter(e.target.checked)} />
              Price not a constraint
            </label>
            {!priceNoMatter && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Min LKR"
                  value={priceMin}
                  onChange={e => setPriceMin(e.target.value)}
                  style={{ width: 160 }}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Max LKR"
                  value={priceMax}
                  onChange={e => setPriceMax(e.target.value)}
                  style={{ width: 160 }}
                />
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 10 }}>
            <div className="h3" style={{ marginTop: 0 }}>Additional Filters (optional)</div>
            {!form.category && <p className="text-muted">Select a category to see filters.</p>}
            {form.category && filteredKeysForUI.length === 0 && (
              <p className="text-muted">No dynamic filters available for {form.category} yet.</p>
            )}
            {form.category && filteredKeysForUI.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    value={filterKey}
                    onChange={e => { setFilterKey(e.target.value); setFilterSuggestedValue(''); setFilterCustomValue(''); }}
                    style={{ minWidth: 200 }}
                  >
                    <option value="">Select a filter key</option>
                    {filteredKeysForUI.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  {filterKey && (
                    <>
                      <select
                        className="select"
                        value={filterSuggestedValue}
                        onChange={e => setFilterSuggestedValue(e.target.value)}
                        style={{ minWidth: 200 }}
                      >
                        <option value="">Suggested values</option>
                        {(filtersMeta.valuesByKey?.[filterKey] || []).map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                      <input
                        className="input"
                        placeholder="Or type a custom value"
                        value={filterCustomValue}
                        onChange={e => setFilterCustomValue(e.target.value)}
                        style={{ minWidth: 200 }}
                      />
                      <button className="btn" type="button" onClick={addFilterValue}>Add</button>
                    </>
                  )}
                </div>
                {renderSelectedFiltersChips()}
              </>
            )}
          </div>

          <label className="label" style={{ marginTop: 10 }}>Description (optional)</label>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Add details to help sellers match your need..."
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          />

          {postStatus.message && (
            <div className="pill" style={{ marginTop: 10, background: postStatus.ok ? 'rgba(10,200,120,0.12)' : 'rgba(239,68,68,0.12)' }}>
              {postStatus.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" type="submit" disabled={loading}>Post Request</button>
            <button className="btn" type="button" onClick={() => setTab('browse')}>Cancel</button>
          </div>
        </form>
      )}

      {tab === 'mine' && (
        <div style={{ marginTop: 16 }}>
          {!userEmail && <p className="text-muted">Login to view your requests.</p>}
          {userEmail && (
            <>
              {myRequests.length === 0 && (
                <p className="text-muted">You have not posted any requests yet.</p>
              )}
              {myRequests.map(r => {
                const locs = parseArray(r.locations_json);
                const modelsArr = parseArray(r.models_json);
                const filtersObj = parseFilters(r.filters_json);
                const filterEntries = Object.entries(filtersObj || {}).filter(([k]) => !['model'].includes(String(k)));
                return (
                  <div key={r.id} className="card" style={{ marginBottom: 10 }}>
                    <strong>{r.title}</strong>
                    <div className="text-muted" style={{ marginTop: 6 }}>
                      {r.category ? <span>Category: {r.category}</span> : <span>Category: Any</span>}
                      {(locs.length || r.location) ? <span> • Locations: {[...locs, r.location].filter(Boolean).join(', ')}</span> : null}
                      {r.category === 'Vehicle' && (r.year_min || r.year_max) ? (
                        <span> • Year: {r.year_min || 'Any'} - {r.year_max || 'Any'}</span>
                      ) : null}
                    </div>
                    {modelsArr.length > 0 && (r.category === 'Vehicle' || r.category === 'Mobile' || r.category === 'Electronic') && (
                      <div className="text-muted" style={{ marginTop: 6 }}>
                        Models: {modelsArr.join(', ')}
                      </div>
                    )}
                    {filterEntries.length > 0 && (
                      <div className="text-muted" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {filterEntries.map(([k, v]) => (
                          <span key={k} className="pill">{k}: {Array.isArray(v) ? v.join(', ') : String(v)}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-muted" style={{ marginTop: 6 }}>
                      {r.price_not_matter ? 'Price not a constraint' : (
                        (r.price_min != null || r.price_max != null) ? `Budget: ${r.price_min != null ? `LKR ${Number(r.price_min).toLocaleString('en-US')}` : 'Any'} - ${r.price_max != null ? `LKR ${Number(r.price_max).toLocaleString('en-US')}` : 'Any'}` : 'Budget: Any'
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      {r.status === 'open' && (
                        <button className="btn" onClick={() => closeRequest(r.id)}>Close</button>
                      )}
                      {r.status !== 'open' && (
                        <button className="btn" onClick={() => alert('This request is closed.')}>Closed</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}