// api/portal.js — Portail Stripe pour gérer / annuler l'abonnement

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY)  return res.status(500).json({ error: 'Stripe non configuré' });

  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: 'session_id manquant' });

  const baseUrl = process.env.NEXT_PUBLIC_URL || `https://${req.headers.host}`;

  try {
    const sessRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}` }
    });
    const sess = await sessRes.json();
    if (!sess.customer) return res.status(400).json({ error: 'Customer introuvable' });

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ customer: sess.customer, return_url: baseUrl }).toString()
    });
    const portal = await portalRes.json();
    return res.status(200).json({ url: portal.url });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
