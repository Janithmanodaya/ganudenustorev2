import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useSEO from '../components/useSEO.js'

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
  const [registerStep, setRegisterStep] = useState('request') // 'request' -> 'verify'
  const [forgotStep, setForgotStep] = useState('request') // 'request' -> 'reset'
  const [result, setResult] = useState(null) // { ok: boolean, message?: string }
  const [submitting, setSubmitting] = useState(false)
  const [agreePolicy, setAgreePolicy] = useState(false)

  // Admin OTP login flow
  const [loginStep, setLoginStep] = useState('password') // 'password' -> 'otp'

  useEffect(() => {
    // If already logged in, go to account page
    try {
      const u = localStorage.getItem('user')
      if (u) navigate('/account', { replace: true })
    } catch (_) {}
  }, [navigate])

  // SEO for auth page via helper
  useSEO({
    title: 'Login / Register — Ganudenu Marketplace',
    description: 'Secure login and registration. Create your account to buy, sell, and hire on Ganudenu.',
    canonical: 'https://ganudenu.store/auth'
  })

  // Helper to safely parse JSON with graceful fallbacks for non-JSON responses
  async function safeJson(r) {
    if (!r) throw new Error('No response')
    const ctRaw = r.headers && typeof r.headers.get === 'function' ? r.headers.get('content-type') : ''
    const ct = String(ctRaw || '').toLowerCase()

    if (ct.includes('application/json')) {
      try {
        return await r.json()
      } catch (_) {
        return {}
      }
    }

    let text = ''
    try { text = await r.text() } catch (_) {}
    const trimmed = String(text || '').trim()

    if (!trimmed || r.status === 204) {
      return {}
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed) } catch (_) {}
    }

    const isHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.includes('<html')
    if (isHtml) {
      // Return a recognizable object so callers can decide how to fallback/retry
      return { _html: true, error: 'Unexpected server response. Please refresh and ensure API proxy is configured.' }
    }

    return { message: trimmed }
  }

  // Centralized API fetch with proxy fallback:
  // 1) Try relative /api (through Vite proxy in dev or same-origin in prod)
  // 2) If response looks like HTML (likely index.html due to proxy miss), retry directly against backend dev URL
  async function apiFetch(path, options) {
    const rel = await fetch(path, options).catch(() => null)
    if (!rel) return { resp: null, data: { error: 'Network error' } }
    const relData = await safeJson(rel)
    const isHtml = relData && relData._html === true

    // If HTML was returned (proxy misconfig), try dev backend directly
    if (isHtml || (!rel.ok && (rel.status === 200))) {
      try {
        const backend = 'http://localhost:5174'
        const absUrl = backend + path
        const retryResp = await fetch(absUrl, options)
        const retryData = await safeJson(retryResp)
        return { resp: retryResp, data: retryData }
      } catch (_) {
        // Fall through and return original
      }
    }
    return { resp: rel, data: relData }
  }

  async function submit(e) {
    e.preventDefault()

    // Enforce policy agreement before sending registration OTP
    if (mode === 'register' && registerStep === 'request' && !agreePolicy) {
      setResult({ ok: false, message: 'Please agree to the Service Policy before continuing.' })
      return
    }

    setSubmitting(true)

    try {
      let url = ''
      let body = {}

      if (mode === 'login') {
        if (loginStep === 'password') {
          url = '/api/auth/login'
          body = { email, password }
        } else {
          url = '/api/auth/verify-admin-login-otp'
          body = { email, password, otp }
        }
      } else if (mode === 'register') {
        if (registerStep === 'request') {
          url = '/api/auth/send-registration-otp'
          body = { email }
        } else {
          url = '/api/auth/verify-otp-and-register'
          body = { email, password, otp, username }
        }
      } else if (mode === 'forgot') {
        if (forgotStep === 'request') {
          // Pre-check: only send OTP if the user exists
          const { resp: checkResp, data: checkData } = await apiFetch(`/api/auth/user-exists?email=${encodeURIComponent(email)}`)
          if (!checkResp || !checkResp.ok) {
            const msg = (checkData && checkData.error) || 'Network error. Please try again.'
            setResult({ ok: false, message: msg })
            setSubmitting(false)
            return
          }
          if (!checkData.exists) {
            setResult({ ok: false, message: 'No account found for this email. Please register first.' })
            setSubmitting(false)
            return
          }
          url = '/api/auth/forgot-password'
          body = { email }
        } else {
          url = '/api/auth/reset-password'
          body = { email, otp, password }
        }
      }

      const { resp: r, data } = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!r || !r.ok) {
        const errMsg = (data && data.error) || (data && data.message) || 'Request failed.'
        setResult({ ok: false, message: errMsg })
        setSubmitting(false)
        return
      }

      // Success flows with concise messages + redirects
      if (mode === 'login' && loginStep === 'password' && data.otp_required) {
        setLoginStep('otp')
        setResult({ ok: true, message: data.message || 'OTP sent to your email. Enter it to continue.' })
        setSubmitting(false)
        return
      }

      if (mode === 'register' && registerStep === 'request') {
        setRegisterStep('verify')
        setResult({ ok: true, message: data.message || 'OTP sent. Please check your email and enter the OTP.' })
        setSubmitting(false)
      } else if (mode === 'register' && registerStep === 'verify') {
        try {
          const user = data.user || { id: data.userId, email, username: data.username, is_admin: !!data.is_admin }
          localStorage.setItem('user', JSON.stringify(user))
          if (data.token) localStorage.setItem('auth_token', data.token)
        } catch (_) {}
        setResult({ ok: true, message: 'Registration successful. Redirecting to home...' })
        setTimeout(() => navigate('/'), 800)
      } else if (mode === 'login') {
        try {
          const user = data.user
          localStorage.setItem('user', JSON.stringify(user))
          if (data.token) localStorage.setItem('auth_token', data.token)
        } catch (_) {}
        setResult({ ok: true, message: 'Login successful. Redirecting to home...' })
        setTimeout(() => navigate('/'), 800)
      } else if (mode === 'forgot' && forgotStep === 'request') {
        setForgotStep('reset')
        setResult({ ok: true, message: data.message || 'OTP sent. Please enter the OTP and your new password.' })
        setSubmitting(false)
      } else if (mode === 'forgot' && forgotStep === 'reset') {
        setResult({ ok: true, message: data.message || 'Password reset successful. Redirecting to home...' })
        setTimeout(() => navigate('/'), 800)
        setPassword('')
        setOtp('')
      }
    } catch (e) {
      setResult({ ok: false, message: 'Network error. Please try again.' })
      setSubmitting(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setResult(null)
    setOtp('')
    if (nextMode === 'register') {
      setRegisterStep('request')
    } else if (nextMode === 'forgot') {
      setForgotStep('request')
    }
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Your Account</div>
        <p className="text-muted">Secure login and registration with email, password, and username.</p>
        <div style={{ marginBottom: 12 }}>
          <button
            className={`btn ${mode === 'login' ? 'primary' : ''}`}
            onClick={() => switchMode('login')}
            disabled={submitting}
          >
            Login
          </button>
          <button
            className={`btn ${mode === 'register' ? 'primary' : ''}`}
            onClick={() => switchMode('register')}
            style={{ marginLeft: 8 }}
            disabled={submitting}
          >
            Register
          </button>
          <button
            className={`btn ${mode === 'forgot' ? 'primary' : ''}`}
            onClick={() => switchMode('forgot')}
            style={{ marginLeft: 8 }}
            disabled={submitting}
          >
            Forgot Password
          </button>
        </div>

        <form onSubmit={submit} className="grid two">
          <input className="input" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} disabled={submitting} />
          {((mode === 'login' && loginStep === 'password') || (mode === 'register') || (mode === 'forgot' && forgotStep === 'reset')) ? (
            <input className="input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} disabled={submitting} />
          ) : (
            <div />
          )}

          {mode === 'register' && registerStep === 'request' && (
            <input className="input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} disabled={submitting} />
          )}

          {(mode === 'register' && registerStep === 'verify') || (mode === 'forgot' && forgotStep === 'reset') || (mode === 'login' && loginStep === 'otp') ? (
            <input className="input" placeholder="OTP" value={otp} onChange={e => setOtp(e.target.value)} disabled={submitting} />
          ) : null}

          {/* Policy agreement for registration */}
          {mode === 'register' && registerStep === 'request' && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="agree"
                type="checkbox"
                checked={agreePolicy}
                onChange={e => setAgreePolicy(e.target.checked)}
                disabled={submitting}
              />
              <label htmlFor="agree" className="text-muted">
                I agree to the <Link to="/policy">Service Policy</Link>.
              </label>
            </div>
          )}

          <div>
            <button className="btn primary" type="submit" disabled={submitting || (mode === 'register' && registerStep === 'request' && !agreePolicy)}>
              {submitting ? 'Please wait…' : (
                <>
                  {mode === 'login' && (loginStep === 'otp' ? 'Verify OTP' : 'Login')}
                  {mode === 'register' && (registerStep === 'request' ? 'Send OTP' : 'Verify & Register')}
                  {mode === 'forgot' && (forgotStep === 'request' ? 'Send OTP' : 'Reset Password')}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Notice with a link to policy on the auth page */}
        <div style={{ marginTop: 12 }}>
          <small className="text-muted">
            <Link to="/policy">Service Policy</Link>
          </small>
        </div>

        {result && (
          <div style={{ marginTop: 12 }}>
            <div className={`card ${result.ok ? '' : ''}`} style={{ padding: 12 }}>
              <div className="h2" style={{ marginTop: 0 }}>{result.ok ? 'Success' : 'Error'}</div>
              <p style={{ margin: 0 }}>{result.message}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}