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

  // Google Sign-In
  const [googleReady, setGoogleReady] = useState(false)
  useEffect(() => {
    // If already logged in, go to account page
    try {
      const u = localStorage.getItem('user')
      if (u) navigate('/account', { replace: true })
    } catch (_) {}
  }, [navigate])

  useEffect(() => {
    // Load Google script on login mode
    if (mode !== 'login') return
    if (window.google && window.google.accounts && window.google.accounts.id) {
      setGoogleReady(true)
      renderGoogleButton()
      return
    }
    let el = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (!el) {
      el = document.createElement('script')
      el.src = 'https://accounts.google.com/gsi/client'
      el.async = true
      el.defer = true
      el.onload = () => {
        setGoogleReady(true)
        renderGoogleButton()
      }
      document.body.appendChild(el)
    } else {
      el.addEventListener('load', () => {
        setGoogleReady(true)
        renderGoogleButton()
      })
    }

    function renderGoogleButton() {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      if (!clientId || !window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false
      })
      const container = document.getElementById('googleSignInDiv')
      if (container) {
        container.innerHTML = ''
        window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'signin_with' })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  function decodeJwt(token) {
    try {
      const base64Url = token.split('.')[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
      return JSON.parse(jsonPayload)
    } catch {
      return null
    }
  }

  async function handleGoogleCredential(resp) {
    const cred = resp?.credential
    if (!cred) return
    const payload = decodeJwt(cred)
    const pickedEmail = String(payload?.email || '').toLowerCase()
    if (pickedEmail) {
      setEmail(pickedEmail)
      setResult({ ok: true, message: 'Email selected from Google. Continue with your normal login or registration flow.' })
    } else {
      setResult({ ok: false, message: 'Could not read email from Google.' })
    }
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

        {/* Pick email from Google (no login) */}
        {mode === 'login' && (
          <div style={{ marginBottom: 16 }}>
            <div id="googleSignInDiv" />
            {!googleReady && (
              <button className="btn" type="button" onClick={() => { /* noop fallback */ }}>
                Pick email from Google
              </button>
            )}
            <div style={{ height: 8 }} />
            <div className="text-muted" style={{ fontSize: 12 }}>
              Use the button above to pick your Google email. Then continue with the usual email/password and OTP flow.
            </div>
          </div>
        )}

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