import React, { useEffect } from 'react'

export default function PolicyPage() {
  useEffect(() => {
    try {
      const title = 'Service Policy — Ganudenu Marketplace'
      const desc = 'Read the service policy and user responsibilities for using Ganudenu Marketplace.'
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
      link.setAttribute('href', 'https://ganudenu.store/policy')
      setMeta('description', desc)
      setProp('og:title', title)
      setProp('og:description', desc)
      setProp('og:url', link.getAttribute('href'))
      setMeta('twitter:title', title)
      setMeta('twitter:description', desc)
    } catch (_) {}
  }, [])

  return (
    <div className="center">
      <div className="card">
        <div className="h1">Service Policy and User Responsibilities</div>
        <p className="text-muted" style={{ marginTop: 0 }}>
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="h2">1) Platform Purpose</div>
        <p>
          We provide an online platform that enables buyers and sellers to discover, connect, and
          communicate. We are not a party to any transaction or agreement between users, and we do
          not guarantee, endorse, or assume responsibility for any listing, user, payment, delivery,
          or outcome.
        </p>

        <div className="h2">2) No Liability for Misuse or Crime</div>
        <p>
          We do not take responsibility for any unlawful, fraudulent, or harmful activity committed
          by users via or outside of this website. Users are solely responsible for complying with
          applicable laws and for their own actions. If you suspect illegal activity, report it to
          the appropriate authorities.
        </p>

        <div className="h2">3) User Conduct</div>
        <ul>
          <li>Only post accurate information that you have the right to share.</li>
          <li>Do not post illegal, fraudulent, or misleading content.</li>
          <li>Do not harass, threaten, or abuse other users.</li>
          <li>Comply with all applicable local laws and regulations.</li>
        </ul>

        <div className="h2">4) Listings and Transactions</div>
        <ul>
          <li>We do not verify listings unless explicitly stated.</li>
          <li>Meet in safe, public places and verify goods/services before paying.</li>
          <li>Use secure payment methods at your own discretion and risk.</li>
        </ul>

        <div className="h2">5) Content Moderation</div>
        <p>
          We may remove content or restrict accounts that violate these policies or applicable law.
          We may cooperate with law enforcement when required by law.
        </p>

        <div className="h2">6) Disclaimers</div>
        <p>
          The platform is provided “as is” and “as available” without warranties of any kind. To the
          maximum extent permitted by law, we disclaim all liability for indirect, incidental,
          special, or consequential damages, as well as loss of data, profits, or goodwill.
        </p>

        <div className="h2">7) Changes</div>
        <p>
          We may update this policy from time to time. Continued use of the platform constitutes
          acceptance of the updated policy.
        </p>
      </div>
    </div>
  )
}