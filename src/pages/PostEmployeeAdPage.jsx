import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function PostEmployeeAdPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [targetTitle, setTargetTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [resume, setResume] = useState(null)
  const [status, setStatus] = useState(null)

  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const okTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (!okTypes.includes(f.type)) {
      setStatus('Only PDF or DOCX files are allowed.')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setStatus('File exceeds 5MB limit.')
      return
    }
    setResume(f)
    setStatus(null)
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !targetTitle.trim() || !summary.trim()) {
      setStatus('Name, Target Title, and Summary are required.')
      return
    }
    if (!resume) {
      setStatus('Resume file is required.')
      return
    }
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('target_title', targetTitle.trim())
      fd.append('summary', summary.trim())
      fd.append('resume', resume)
      const r = await fetch('/api/jobs/employee/draft', { method: 'POST', body: fd })
      const data = await r.json()
      if (!r.ok) {
        setStatus(data.error || 'Failed to process resume.')
        return
      }
      navigate(`/verify-employee?draftId=${encodeURIComponent(data.draftId)}`)
    } catch (e) {
      setStatus('Network error.')
    }
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Post Employee Profile</div>
        <p className="text-muted">Upload your resume (PDF/DOCX, max 5MB). We’ll extract key details to build your profile.</p>
        <form onSubmit={submit} className="grid two">
          <input className="input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
          <input className="input" placeholder="Target Job Title" value={targetTitle} onChange={e => setTargetTitle(e.target.value)} />
          <textarea className="textarea" placeholder="Summary / Pitch" value={summary} onChange={e => setSummary(e.target.value)} />
          <input className="input" type="file" accept=".pdf,.docx" onChange={onFile} />
          <div>
            <button className="btn primary" type="submit">Continue</button>
          </div>
        </form>
        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>
    </div>
  )
}