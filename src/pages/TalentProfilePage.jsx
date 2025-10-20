import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

export default function TalentProfilePage() {
  const { handle } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const user = JSON.parse(localStorage.getItem('user') || 'null')
        const headers = user?.email ? { 'X-User-Email': user.email } : undefined
        const r = await fetch(`/api/listings/talent/by-handle/${encodeURIComponent(handle)}`, { headers })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Profile not found')
        setProfile(data.profile)
        setStatus(null)
      } catch (e) {
        setStatus(e.message)
      } finally {
        setLoading(false)
      }
    }
    if (handle) load()
  }, [handle])

  const isOwner = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (!user?.email || !profile?.owner_email) return false
      return String(user.email).toLowerCase().trim() === String(profile.owner_email).toLowerCase().trim()
    } catch (_) { return false }
  }, [profile])

  function parseStruct() {
    try { return JSON.parse(profile?.structured_json || '{}') } catch (_) { return {} }
  }

  const sj = parseStruct()
  const images = Array.isArray(profile?.images) ? profile.images : []
  const hero = images.length ? (images[0].medium_url || images[0].url) : (profile?.thumbnail_url || null)

  const [name, headline] = useMemo(() => {
    const t = String(profile?.title || '')
    if (t.includes(' • ')) return t.split(' • ', 2)
    return [t, '']
  }, [profile])

  async function deleteProfile() {
    if (!profile?.id) return
    const sure = window.confirm('Delete your profile? This cannot be undone.')
    if (!sure) return
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      const headers = user?.email ? { 'X-User-Email': user.email } : {}
      const r = await fetch(`/api/listings/${profile.id}`, { method: 'DELETE', headers })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Failed to delete')
      navigate('/account', { replace: true })
    } catch (e) {
      setStatus(e.message)
    }
  }

  return (
    <div className="center" style={{ maxWidth: 1000 }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          background: 'radial-gradient(800px 300px at 10% -20%, rgba(0,209,255,0.25), transparent 60%), radial-gradient(800px 300px at 90% 0%, rgba(108,127,247,0.25), transparent 60%), linear-gradient(180deg, rgba(18,22,31,0.9), rgba(18,22,31,0.6))',
          padding: 24,
          color: '#fff'
        }}>
          <div className="grid two" style={{ alignItems: 'center', gap: 16 }}>
            <div>
              <div className="h1" style={{ margin: 0 }}>{name || 'Talent Profile'}</div>
              {headline ? <div className="text-muted" style={{ marginTop: 6, color: '#e3e8ff' }}>{headline}</div> : null}
              <div className="text-muted" style={{ marginTop: 6, color: '#e3e8ff' }}>
                {profile?.location ? profile.location : null}
                {sj?.employment_type ? ` • ${sj.employment_type}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {sj?.phone ? <a className="btn primary" href={`tel:${sj.phone}`}>📞 Call</a> : null}
                {sj?.profile_url ? <a className="btn" href={sj.profile_url} target="_blank" rel="noreferrer">🔗 Website</a> : null}
                {isOwner ? (
                  <>
                    <Link className="btn" to={`/profile/edit?listingId=${profile.id}`}>✏️ Edit</Link>
                    <button className="btn" onClick={deleteProfile}>🗑 Delete</button>
                    {String(profile.status || '') !== 'Approved' && (
                      <span className="pill" style={{ background: 'rgba(245,158,11,0.2)', borderColor: '#f59e0b55' }}>
                        Pending Approval
                      </span>
                    )}
                  </>
                ) : null}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {hero ? (
                <img
                  src={hero}
                  alt={profile?.title}
                  style={{ width: 240, height: 240, objectFit: 'cover', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
                />
              ) : (
                <div style={{ width: 240, height: 240, borderRadius: 12, background: 'rgba(255,255,255,0.08)', display: 'grid', placeItems: 'center' }}>
                  <span className="text-muted">No image</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {loading && <div style={{ padding: 16 }}>Loading...</div>}
        {status && !loading && <div style={{ padding: 16 }} className="text-muted">Error: {status}</div>}

        {!loading && profile && (
          <div style={{ padding: 18 }}>
            {/* About */}
            {profile.description ? (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2" style={{ marginTop: 0 }}>About</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{profile.description}</div>
              </div>
            ) : null}

            {/* Education */}
            {(sj?.education?.school || sj?.education?.university) && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2" style={{ marginTop: 0 }}>Education</div>
                {sj.education.school ? <div>🏫 {sj.education.school}</div> : null}
                {sj.education.university ? <div>🎓 {sj.education.university}</div> : null}
              </div>
            )}

            {/* Qualifications */}
            {sj?.qualifications ? (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2" style={{ marginTop: 0 }}>Qualifications</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{sj.qualifications}</div>
              </div>
            ) : null}

            {/* Experience */}
            {sj?.experience ? (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2" style={{ marginTop: 0 }}>Experience</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{sj.experience}</div>
              </div>
            ) : null}

            {/* Skills */}
            {Array.isArray(sj?.skills) && sj.skills.length > 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2" style={{ marginTop: 0 }}>Skills</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sj.skills.map((s, idx) => <span key={idx} className="pill">{String(s)}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}