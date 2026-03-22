module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mise, risk, focus, sport, nb } = req.body || {};
  if (!mise || !risk || !nb) return res.status(400).json({ error: 'Paramètres manquants' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'Service indisponible' });

  const riskDesc =
    risk < 20 ? 'très prudent — cotes 1.15–1.40, quasi-certitudes' :
    risk < 40 ? 'prudent — cotes 1.40–1.75, favoris nets' :
    risk < 60 ? 'équilibré value bet — cotes 1.75–2.50' :
    risk < 80 ? 'risqué — cotes 2.50–4.50, outsiders' :
                'YOLO — cotes 4.50+, combinés audacieux';

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const focusTxt = focus?.trim() ? `Focus demandé : ${focus}.` : 'Libre choix des matchs.';
  const sportLabel = sport === 'Surprise' ? 'un sport au choix' : sport;

  const prompt = `Tu es un analyste sportif expert en paris sportifs. Date : ${today}.

MISSION : Génère un ticket de paris ${sportLabel} avec ${nb} sélection(s).

PARAMÈTRES :
- Mise : ${mise}€
- Risque : ${risk}% → ${riskDesc}
- ${focusTxt}

RÈGLES :
1. Matchs RÉELS de cette semaine dans de vraies compétitions
2. Pour chaque sélection, donne 3 stats concrètes et récentes (forme, xG, confrontations)
3. Cotes adaptées exactement au profil de risque
4. Types de paris variés (1X2, +/-buts, BTTS, handicap, mi-temps)

Réponds UNIQUEMENT avec ce JSON (zéro texte avant/après) :
{
  "type_ticket": "SIMPLE|COMBINÉ|SYSTÈME",
  "selections": [
    {
      "league": "Nom complet de la ligue",
      "match": "Équipe A vs Équipe B",
      "date_match": "Samedi 22 mars",
      "pari": "Type de pari précis",
      "cote": 1.85,
      "emoji": "⚽",
      "raison_courte": "Accroche percutante",
      "stats": [
        "📊 Stat 1 avec chiffres concrets",
        "📈 Stat 2 avec chiffres concrets",
        "⚡ Stat 3 avec chiffres concrets"
      ]
    }
  ],
  "cote_totale": 3.42,
  "confiance": 74,
  "verdict_emoji": "🎯",
  "verdict_titre": "Titre accrocheur",
  "verdict_texte": "Phrase de synthèse",
  "pourquoi": [
    { "emoji": "📊", "texte": "**Argument 1** : détail avec stats réelles" },
    { "emoji": "⚡", "texte": "**Value identifiée** : pourquoi le bookmaker sous-cote" },
    { "emoji": "🎯", "texte": "**Cohérence** : logique globale du ticket" },
    { "emoji": "⚠️", "texte": "**Risque** : ce qui pourrait mal tourner" }
  ]
}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1800,
        temperature: 0.65
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Service analyse indisponible' });
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Réponse invalide, réessaie' });

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.selections?.length) {
      parsed.cote_totale = parsed.selections.reduce((acc, s) => acc * (parseFloat(s.cote) || 1), 1);
      parsed.cote_totale = Math.round(parsed.cote_totale * 100) / 100;
    }
    parsed.gain_potentiel = Math.round(parseFloat(mise) * parsed.cote_totale);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne, réessaie' });
  }
};
