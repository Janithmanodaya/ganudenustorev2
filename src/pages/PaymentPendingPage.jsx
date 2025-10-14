import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function PaymentPendingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    async function load() {
      if (!id) return
      try {
        const r = await fetch(`/api/listings/payment-info/${encodeURIComponent(id)}`)
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Failed to load payment info')
        setInfo(data)
      } catch (e) {
        setStatus(`Error: ${e.message}`)
      }
    }
    load()
  }, [id])

  function copy(text) {
    try {
      navigator.clipboard.writeText(String(text || ''))
      setStatus('Copied to clipboard.')
      setTimeout(() => setStatus(null), 2000)
    } catch (_) {}
  }

  const bank = String(info?.bank_details || '').trim()
  const wa = String(info?.whatsapp_number || '').trim()
  const remark = String(info?.listing?.remark_number || '')
  const title = String(info?.listing?.title || '')
  const price = info?.listing?.price
  const category = String(info?.listing?.main_category || '')
  const payAmount = Number(info?.payment_amount ?? 0)
  const payEnabled = !!info?.payments_enabled

  function openWhatsApp() {
    if (!wa) return
    const msg = `Payment done for listing #${id} (${title}). Remark: ${remark}. Please approve.`
    const url = `https://wa.me/${wa.replace(/\D+/g, '')}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  function renderPaymentBlock() {
    if (!payEnabled) {
      return (
        <div className="card" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="h2" style={{ marginTop: 0 }}>Payment Requirement</div>
          <p className="text-muted">Payments are currently disabled for {category || 'this category'}. Your ad will be reviewed without payment.</p>
        </div>
      )
    }
    return (
      <div className="card" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="h2" style={{ marginTop: 0 }}>Payment Requirement</div>
        {payAmount > 0 ? (
          <>
            <p>Required amount for {category}: <strong>Rs. {payAmount.toLocaleString('en-US')}</strong></p>
            <p className="text-muted">Please include the remark number in your bank transfer to speed up approval.</p>
          </>
        ) : (
          <p className="text-muted">No payment required for {category}. You may still send your receipt if applicable.</p>
        )}
      </div>
    )
  }

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Complete Payment to Publish</div>
        {!info && <p className="text-muted">Loading payment details...</p>}
        {info && (
          <>
            {renderPaymentBlock()}

            <div className="card" style={{ marginTop: 12 }}>
              <div className="h2">Ad Summary</div>
              <div><strong>Listing ID:</strong> {id}</div>
              <div><strong>Title:</strong> {title}</div>
              <div><strong>Category:</strong> {category || 'N/A'}</div>
              <div><strong>Price:</strong> {price != null ? price : 'N/A'}</div>
              <div className="pill" style={{ marginTop: 6 }}>
                Remark Number: {remark}
                <button className="btn" style={{ marginLeft: 8 }} onClick={() => copy(remark)}>Copy</button>
              </div>
            </div>

            <div className="h2" style={{ marginTop: 12 }}>Bank Details</div>
            <div className="card">
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{bank || 'Not configured yet.'}</pre>
              {bank && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => copy(bank)}>Copy Bank Details</button>
                </div>
              )}
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="h2">After Payment</div>
              <p>Please send your payment receipt via WhatsApp so we can verify and approve your ad.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={openWhatsApp} disabled={!wa}>WhatsApp</button>
                <button className="btn" onClick={() => navigate('/my-ads')}>Go to My Ads</button>
              </div>
              {!wa && <div className="text-muted" style={{ marginTop: 6 }}>WhatsApp number not configured.</div>}
            </div>
          </>
        )}

        {status && <p style={{ marginTop: 8 }}>{status}</p>}
      </div>
    </div>
  )
}