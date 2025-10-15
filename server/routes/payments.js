import { Router } from 'express'
import { db } from '../lib/db.js'

const router = Router()

// Ensure meta_payments table exists to record authorization containers best-effort
db.prepare(`
  CREATE TABLE IF NOT EXISTS meta_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    owner_email TEXT,
    amount_lkr INTEGER NOT NULL,
    remark_number TEXT,
    container_json TEXT NOT NULL,
    authorized_at TEXT NOT NULL,
    FOREIGN KEY(listing_id) REFERENCES listings(id)
  )
`).run()

// Record Meta Pay authorization container (NOTE: you must integrate with your Payment Partner to process it)
router.post('/meta/authorize', async (req, res) => {
  try {
    const email = String(req.header('X-User-Email') || '').toLowerCase().trim()
    const { listing_id, amount_lkr, remark_number, container } = req.body || {}
    if (!listing_id || !amount_lkr || !container) {
      return res.status(400).json({ error: 'listing_id, amount_lkr and container are required' })
    }

    const listing = db.prepare('SELECT id, owner_email FROM listings WHERE id = ?').get(Number(listing_id))
    if (!listing) return res.status(404).json({ error: 'Listing not found' })

    const ownerEmail = String(listing.owner_email || email || '').toLowerCase().trim()

    const record = {
      listing_id: Number(listing_id),
      owner_email: ownerEmail || null,
      amount_lkr: Number(amount_lkr),
      remark_number: String(remark_number || ''),
      container_json: JSON.stringify(container),
      authorized_at: new Date().toISOString()
    }

    db.prepare(`
      INSERT INTO meta_payments (listing_id, owner_email, amount_lkr, remark_number, container_json, authorized_at)
      VALUES (@listing_id, @owner_email, @amount_lkr, @remark_number, @container_json, @authorized_at)
    `).run(record)

    // TODO: Integrate with your Payment Partner API here to authorize/capture the payment method
    // using the Meta Pay container (depends on partner docs).
    // For now, we only record it to the DB.

    res.json({ ok: true })
  } catch (e) {
    console.error('[payments] /meta/authorize error:', e && e.message ? e.message : e)
    res.status(500).json({ error: 'Failed to record Meta Pay authorization' })
  }
})

export default router