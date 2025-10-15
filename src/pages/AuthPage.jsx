import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

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

  // SEO for auth page
  useEffect(() => {
    try {
      const title = 'Login / Register — Ganudenu Marketplace'
      const desc = 'Secure login and registration. Create your account to buy, sell, and hire on Ganudenu.'
      document.title = title
      const setMeta = (name, content) => {
        let tag = document.querySelector(`meta[name="${name}"]`)
        if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', name); document.head.appendChild(tag) }
        tag.setAttribute('content', content)
      }
      const setProp = (property, content) => {
        let tag = document.querySelector(`meta[property="${property}"]`)
        if (!tag) { tag = document.createElement('meta'); tag.setAttribute('property', property); document.head.appendChild(tag) }
        tag.setAttribute('content', content)
      }
      let link = document.querySelector('link[rel="canonical"]')
      if (!link) { link = document.createElement('link'); link.setAttribute('rel', 'canonical'); document.head.appendChild(link) }
      link.setAttribute('href', 'https://ganudenu.store/auth')
      setMeta('description', desc)
      setProp('og:title', title)
      setProp('og:description', desc)
      setProp('og:url', link.getAttribute('href'))
      setMeta('twitter:title', title)
      setMeta('twitter:description', desc)
    } catch (_) {}
  }, [])

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
          const check = await fetch(`/api/auth/user-exists?email=${encodeURIComponent(email)}`)
          const checkData = await check.json().catch(() => ({}))
          if (!check.ok || !checkData.exists) {
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

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      // Try to parse JSON safely
      let data = {}
      try {
        data = await r.json()
      } catch {
        data = {}
      }

      if (!r.ok) {
        const errMsg = (data && data.error) || 'Request failed.'
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
        setResult({ ok: true, message: 'OTP sent. Please check your email and enter the OTP.' })
        setSubmitting(false)
      } else if (mode === 'register' && registerStep === 'verify') {
        try {
          const user = { id: data.userId, email, username: data.username, is_admin: !!data.is_admin }
          localStorage.setItem('user', JSON.stringify(user))
        } catch (_) {}
        setResult({ ok: true, message: 'Registration successful. Redirecting to home...' })
        setTimeout(() => navigate('/'), 800)
      } else if (mode === 'login') {
        try {
          const user = data.user
          localStorage.setItem('user', JSON.stringify(user))
        } catch (_) {}
        setResult({ ok: true, message: 'Login successful. Redirecting to home...' })
        setTimeout(() => navigate('/'), 800)
      } else if (mode === 'forgot' && forgotStep === 'request') {
        setForgotStep('reset')
        setResult({ ok: true, message: 'OTP sent. Please enter the OTP and your new password.' })
        setSubmitting(false)
      } else if (mode === 'forgot' && forgotStep === 'reset') {
        setResult({ ok: true, message: 'Password reset successful. Redirecting to home...' })
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

          {(mode === 'register' && registerStep === 'verify') || (mode === 'forgot' && forgotStep === 'reset') ? (
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
                  {mode === 'login' && 'Login'}
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