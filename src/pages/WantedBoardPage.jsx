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

  // Form state
  const [form, setForm] = useState({
    title: '',
    category: '',
    location: '',
    price_max: '',
    description: '',
    sub_category: '',
    model: ''
  });
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
  }, [userEmai_codel]new)</;
]);

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

  async function submitForm(e) {
    e.preventDefault();
    if (!userEmail) {
      setPostStatus({ ok: false, message: 'Please login to post a Wanted request.' });
      return;
    }
    setPostStatus({ ok: false, message: '' });
    setLoading(true);
    try {
      const filters = {};
      if (form.sub_category) filters.sub_category = form.sub_category;
      if (form.model) filters.model = form.model;

      const payload = {
        title: form.title,
        description: form.description,
        category: form.category || '',
        location: form.location || '',
        price_max: form.price_max ? Number(form.price_max) : '',
        filters
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
        setForm({ title: '', category: '', location: '', price_max: '', description: '', sub_category: '', model: '' });
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
          {requests.filter(r => r.status === 'open').map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{r.title}</strong>
                {r.price_max != null && <span className="pill">Max Budget: LKR {Number(r.price_max).toLocaleString('en-US')}</span>}
              </div>
              <div className="text-muted" style={{ marginTop: 6 }}>
                {r.category ? <span>Category: {r.category}</span> : <span>Category: Any</span>}
                {r.location ? <span> • Location: {r.location}</span> : null}
              </div>
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
          ))}
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

          <label className="label" style={{ marginTop: 10 }}>Location (optional)</label>
          <input
            className="input"
            placeholder="Colombo, Gampaha, etc."
            value={form.location}
            onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
          />

          <label className="label" style={{ marginTop: 10 }}>Max Budget (LKR, optional)</label>
          <input
            className="input"
            type="number"
            min="0"
            placeholder="e.g., 150000"
            value={form.price_max}
            onChange={e => setForm(prev => ({ ...prev, price_max: e.target.value }))}
          />

          <label className="label" style={{ marginTop: 10 }}>Description (optional)</label>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Add details to help sellers match your need..."
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          />

          {/* Simple filter helpers */}
          <div className="card" style={{ marginTop: 10, background: 'rgba(108,127,247,0.08)', borderColor: '#6c7ff71a' }}>
            <div className="h3" style={{ marginTop: 0 }}>Optional Matching Filters</div>
            <label className="label">Sub-category (e.g., Bike, Car, Van)</label>
            <input
              className="input"
              value={form.sub_category}
              onChange={e => setForm(prev => ({ ...prev, sub_category: e.target.value }))}
              placeholder="e.g., Car"
            />
            <label className="label" style={{ marginTop: 8 }}>Model (partial match)</label>
            <input
              className="input"
              value={form.model}
              onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="e.g., Toyota Aqua"
            />
          </div>

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
              {myRequests.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: 10 }}>
                  <strong>{r.title}</strong>
                  <div className="text-muted" style={{ marginTop: 6 }}>
                    {r.category ? <span>Category: {r.category}</span> : <span>Category: Any</span>}
                    {r.location ? <span> • Location: {r.location}</span> : null}
                    {r.price_max != null ? <span> • Max Budget: LKR {Number(r.price_max).toLocaleString('en-US')}</span> : null}
                    <span> • Status: {r.status}</span>
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
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}