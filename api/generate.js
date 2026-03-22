// api/generate.js — Vercel Serverless Function
// La clé Groq est stockée côté serveur dans les variables d'environnement Vercel
// Elle n'est JAMAIS exposée au navigateur

export default async function handler(req, res) {
  // CORS — autorise ton domaine uniquement en prod
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mise, risk, focus, sport, nb } = req.body || {};

  if (!mise || !risk || !nb) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'Service temporairement indisponible' });
  }

  // ── Construire le profil de risque
  const riskDesc =
    risk < 20 ? 'très prudent — cotes 1.15–1.40, quasi-certitudes absolues' :
    risk < 40 ? 'prudent — cotes 1.40–1.75, favoris nets' :
    risk < 60 ? 'équilibré value bet — cotes 1.75–2.50, bon ratio risque/gain' :
    risk < 80 ? 'risqué — cotes 2.50–4.50, outsiders avec potentiel' :
                'YOLO extrême — cotes 4.50+, combinés audacieux';

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const focusTxt = focus?.trim()
    ? `Le joueur demande un focus sur : ${focus}.`
    : 'Libre choix des matchs et compétitions.';

  const sportLabel = sport === 'Surprise' ? 'un sport au choix (football, tennis, basket, rugby)' : sport;

  const prompt = `Tu es un analyste sportif expert en paris. Tu as accès aux statistiques récentes des équipes.
Date du jour : ${today}.

MISSION : Génère un ticket de paris ${sportLabel} avec ${nb} sélection(s).

PARAMÈTRES DU JOUEUR :
- Mise : ${mise}€
- Profil de risque : ${risk}% → ${riskDesc}
- ${focusTxt}

INSTRUCTIONS CRITIQUES :
1. Utilise des matchs RÉELS qui se jouent cette semaine dans de vraies compétitions
2. Base chaque sélection sur des statistiques concrètes et récentes :
   - Forme des 5 derniers matchs (ex: 4V 1N)
   - Statistiques de buts (xG, moyenne de buts)
   - Confrontations directes récentes
   - Blessés/suspendus importants
   - Avantage domicile/extérieur
3. Adapte les cotes exactement au profil de risque : ${riskDesc}
4. Le type de pari doit varier (1X2, +/-buts, BTTS, handicap, mi-temps)
5. Pour chaque sélection, donne 2-3 stats précises pour justifier

Réponds UNIQUEMENT avec ce JSON strict (zéro texte avant/après) :
{
  "type_ticket": "SIMPLE|COMBINÉ|SYSTÈME",
  "selections": [
    {
      "league": "Nom complet de la compétition",
      "match": "Équipe A vs Équipe B",
      "date_match": "Ex: Samedi 22 mars",
      "pari": "Type de pari précis et clair",
      "cote": 1.85,
      "emoji": "⚽",
      "raison_courte": "Une phrase d'accroche percutante",
      "stats": [
        "📊 Stat concrète 1 avec chiffres",
        "📈 Stat concrète 2 avec chiffres",
        "⚡ Stat concrète 3 avec chiffres"
      ]
    }
  ],
  "cote_totale": 3.42,
  "confiance": 74,
  "verdict_emoji": "🎯",
  "verdict_titre": "Titre accrocheur du ticket",
  "verdict_texte": "Phrase de synthèse de la stratégie",
  "pourquoi": [
    { "emoji": "📊", "texte": "**Argument solide** : détail avec statistiques réelles" },
    { "emoji": "⚡", "texte": "**Value identifiée** : pourquoi le bookmaker sous-cote ce résultat" },
    { "emoji": "🎯", "texte": "**Cohérence du ticket** : logique globale du combiné" },
    { "emoji": "⚠️", "texte": "**Risque principal** : ce qui pourrait compromettre le ticket" }
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
      const errData = await groqRes.json().catch(() => ({}));
      console.error('Groq error:', errData);
      return res.status(502).json({ error: 'Service d\'analyse temporairement indisponible' });
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Réponse invalide, réessaie' });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Recalculate totals server-side for reliability
    if (parsed.selections?.length) {
      parsed.cote_totale = parsed.selections.reduce(
        (acc, s) => acc * (parseFloat(s.cote) || 1), 1
      );
      parsed.cote_totale = Math.round(parsed.cote_totale * 100) / 100;
    }
    parsed.gain_potentiel = Math.round(parseFloat(mise) * parsed.cote_totale);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Erreur interne, réessaie dans quelques secondes' });
  }
}
