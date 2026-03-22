module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { mise, risk, focus, sport, nb, mode } = req.body || {};
  if (mise === undefined || risk === undefined || !nb)
    return res.status(400).json({ error: 'Paramètres manquants' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'Service indisponible' });

  const riskDesc =
    risk < 20 ? 'très prudent — cotes 1.15–1.40, quasi-certitudes' :
    risk < 40 ? 'prudent — cotes 1.40–1.75, favoris nets' :
    risk < 60 ? 'value bet équilibré — cotes 1.75–2.50' :
    risk < 80 ? 'risqué — cotes 2.50–4.50, outsiders' :
                'YOLO — cotes 4.50+, gros combinés';

  const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const focusTxt = focus?.trim() ? `Focus sur : "${focus}".` : 'Libre choix.';
  const sportLabel = sport === 'Surprise' ? 'un sport surprise au choix' : (sport || 'Football');

  const comboInstr = mode === 'combo' ? `
UTILISE des paris combinés avancés sur chaque match :
- "Équipe gagne + Buteur marqueur + Plus de 2.5 buts"
- "BTTS Oui + Victoire domicile"
- "Premier buteur X + Handicap -1"
- "Score exact + BTTS"
Chaque sélection = 1 match avec plusieurs paris combinés dessus. Inclus "sous_paris" dans le JSON.` : `
Varie les types : 1X2, +/-buts, BTTS, handicap asiatique, mi-temps/final.`;

  const prompt = `Expert paris sportifs. Date : ${today}.
Génère un ticket ${sportLabel} avec ${nb} sélection(s).
Mise : ${mise}€ | Risque : ${risk}% → ${riskDesc} | ${focusTxt}
${comboInstr}

RÈGLES : matchs réels cette semaine, 3 stats concrètes par sélection (forme, buts/xG, H2H).

JSON uniquement, sans texte :
{
  "type_ticket":"SIMPLE|COMBINÉ|COMBO AVANCÉ",
  "selections":[{
    "league":"ligue complète","match":"A vs B","date_match":"date",
    "pari":"description précise","sous_paris":["paris 1","paris 2"],
    "cote":1.85,"emoji":"⚽","raison_courte":"accroche",
    "stats":["📊 forme:...","⚽ buts/xG:...","🔁 H2H:..."]
  }],
  "cote_totale":3.42,"confiance":68,
  "verdict_emoji":"🎯","verdict_titre":"titre","verdict_texte":"synthèse",
  "pourquoi":[
    {"emoji":"📊","texte":"**Stats** : données réelles"},
    {"emoji":"⚡","texte":"**Value** : pourquoi sous-coté"},
    {"emoji":"🎯","texte":"**Cohérence** : logique globale"},
    {"emoji":"⚠️","texte":"**Risque** : ce qui peut mal tourner"}
  ]
}`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},
      body: JSON.stringify({ model:'llama-3.3-70b-versatile', messages:[{role:'user',content:prompt}], max_tokens:2200, temperature:0.65 })
    });
    if (!r.ok) return res.status(502).json({ error: "Service indisponible" });

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return res.status(502).json({ error: 'Réponse invalide, réessaie' });

    const parsed = JSON.parse(m[0]);
    if (parsed.selections?.length) {
      parsed.cote_totale = Math.round(parsed.selections.reduce((a,s)=>a*(parseFloat(s.cote)||1),1)*100)/100;
    }
    parsed.gain_potentiel = Math.round(parseFloat(mise)*(parsed.cote_totale||1));
    parsed.confiance = Math.min(Math.max(parseInt(parsed.confiance)||65,5),99);
    return res.status(200).json(parsed);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
