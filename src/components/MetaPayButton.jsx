import React, { useEffect, useMemo, useState } from 'react'

/**
 * MetaPayButton
 * - Shows a Meta Pay checkout button if the SDK is available and payments are enabled.
 * - Sends the returned Meta Pay container to backend for authorization/record.
 *
 * Props:
 * - amount: number (final amount in LKR)
 * - title: string (listing title / summary)
 * - remarkNumber: string (merchant remark/reference)
 * - listingId: string | number
 * - onResult: function(result) called with { ok, message, container? }
 */
export default function MetaPayButton({
  amount = 0,
  title = '',
  remarkNumber = '',
  listingId,
  onResult
}) {
  const [sdkAvailable, setSdkAvailable] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState(null)

  const appId = import.meta.env.VITE_META_APP_ID || '' // set this in your .env as VITE_META_APP_ID=XXXXXXXX

  // Detect SDK presence (very defensive as SDK object names vary in docs)
  useEffect(() => {
    const check = () => {
      const hasAny =
        !!window.PaymentClient ||
        !!window.MetaPay ||
        !!window.fbpayments ||
        !!window.FBPayments
      setSdkAvailable(hasAny)
    }
    check()
    const t = setInterval(check, 1000)
    return () => clearInterval(t)
  }, [])

  const canPay = useMemo(() => amount > 0, [amount])

  async function handleClick() {
    setError(null)
    if (!sdkAvailable) {
      setError('Meta Pay SDK not available in this environment.')
      if (onResult) onResult({ ok: false, message: 'SDK not available' })
      return
    }
    setInitializing(true)
    try {
      // Try to construct a PaymentClient from whichever namespace exists
      const PaymentClientCtor =
        window.PaymentClient?.PaymentClient ||
        window.PaymentClient ||
        window.fbpayments?.PaymentClient ||
        window.FBPayments?.PaymentClient ||
        window.MetaPay?.PaymentClient

      if (typeof PaymentClientCtor !== 'function') {
        throw new Error('PaymentClient constructor not found in SDK.')
      }

      // Minimal configuration object; specific fields depend on partner integration.
      const client = new PaymentClientCtor({
        environment: 'PRODUCTION', // or 'TEST' depending on your setup with partner
        appId: appId || undefined
      })

      // Create a minimal PaymentRequest-like object if supported by SDK.
      // NOTE: Real integrations require PaymentConfiguration and partner processing.
      const req = {
        total: {
          label: title || 'Ganudenu Listing',
          amount: { currencyCode: 'LKR', value: String(amount) }
        },
        remarkNumber,
        merchantInfo: {
          merchantName: 'Ganudenu Marketplace',
          merchantId: 'ganudenu' // placeholder
        }
      }

      // Attempt to present the payment UI. SDKs vary; we try common naming patterns.
      let container = null
      if (typeof client.canMakePayment === 'function') {
        const supported = await client.canMakePayment()
        if (!supported) throw new Error('Meta Pay is not supported for this user/device.')
      }

      if (typeof client.show === 'function') {
        container = await client.show(req)
      } else if (typeof client.begin === 'function') {
        container = await client.begin(req)
      } else if (typeof client.requestPayment === 'function') {
        container = await client.requestPayment(req)
      } else {
        throw new Error('Unable to start Meta Pay flow: unsupported SDK method.')
      }

      // Send `container` to backend for authorization/record
      try {
        const user = JSON.parse(localStorage.getItem('user') || 'null')
        const email = user?.email || ''
        const r = await fetch('/api/payments/meta/authorize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(email ? { 'X-User-Email': email } : {})
          },
          body: JSON.stringify({
            listing_id: listingId,
            amount_lkr: amount,
            remark_number: remarkNumber,
            container
          })
        })
        const data = await r.json()
        if (!r.ok) {
          throw new Error(data?.error || 'Failed to record Meta Pay authorization')
        }
      } catch (e) {
        console.warn('[MetaPay] Backend record failed:', e && e.message ? e.message : e)
      }

      if (onResult) onResult({ ok: true, message: 'Meta Pay container received', container })
    } catch (e) {
      const msg = e?.message || 'Failed to start Meta Pay.'
      setError(msg)
      if (onResult) onResult({ ok: false, message: msg })
    } finally {
      setInitializing(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="h2" style={{ marginTop: 0 }}>Meta Pay (Facebook)</div>
      <p className="text-muted" style={{ marginTop: 6 }}>
        Meta Pay is currently deprecated and not accepting new direct integrations.
        If your payment processor supports Meta Pay, you can enable it in their portal.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="btn primary"
          onClick={handleClick}
          disabled={!canPay || initializing || !sdkAvailable}
          title={sdkAvailable ? 'Pay with Meta Pay' : 'Meta Pay not available'}
        >
          {initializing ? 'Starting…' : 'Pay with Meta Pay'}
        </button>
        {!sdkAvailable && (
          <span className="pill">SDK unavailable</span>
        )}
      </div>
      <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
        Amount: Rs. {Number(amount || 0).toLocaleString('en-US')} • Remark: {remarkNumber || 'N/A'} • Listing #{listingId}
      </div>
      {error && <div className="pill" style={{ marginTop: 8, background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>{error}</div>}
    </div>
  )
}