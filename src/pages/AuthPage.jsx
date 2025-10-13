import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

  useEffect(() => {
    // If already logged in, go to account page
    try {
      const u = localStorage.getItem('user')
      if (u) navigate('/account', { replace: true })
    } catch (_) {}
  }, [navigate])

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)

    try {
      let url = ''
      let body = {}

      if (mode === 'login') {
        url = '/api/auth/login'
        body = { email, password }
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
          {(mode === 'login') || (mode === 'register') || (mode === 'forgot' && forgotStep === 'reset') ? (
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

          <div>
            <button className="btn primary" type="submit" disabled={submitting}>
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