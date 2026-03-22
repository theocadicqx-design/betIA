// api/checkout.js — Crée une session Stripe Checkout 5€/mois
// Variables Vercel requises :
//   STRIPE_SECRET_KEY → sk_live_xxx
//   NEXT_PUBLIC_URL   → https://ton-site.vercel.app

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY)  return res.status(500).json({ error: 'Stripe non configuré' });

  const baseUrl = process.env.NEXT_PUBLIC_URL || `https://${req.headers.host}`;

  try {
    // Récupérer le price via lookup_key "betia_monthly"
    const pricesRes = await fetch(
      `https://api.stripe.com/v1/prices?lookup_keys[]=betia_monthly&expand[]=data.product`,
      { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
    );
    const pricesData = await pricesRes.json();

    if (!pricesData.data?.length) {
      return res.status(400).json({ error: 'Prix introuvable — vérifie le lookup_key "betia_monthly" dans Stripe' });
    }

    const priceId = pricesData.data[0].id;

    // Créer la session Checkout
    const body = new URLSearchParams({
      'mode':                       'subscription',
      'line_items[0][price]':       priceId,
      'line_items[0][quantity]':    '1',
      'success_url':                `${baseUrl}/?premium=1&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url':                 `${baseUrl}/?cancelled=1`,
      'allow_promotion_codes':      'true',
      'billing_address_collection': 'auto',
    });

    const sessRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const session = await sessRes.json();
    if (session.error) return res.status(400).json({ error: session.error.message });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Checkout error:', err.message);
    return res.status(500).json({ error: 'Erreur Stripe : ' + err.message });
  }
};
