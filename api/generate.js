module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { mise, risk, focus, sport, nb } = req.body || {};
  if (!mise || risk === undefined || !nb)
    return res.status(400).json({ error: 'Paramètres manquants' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY)
    return res.status(500).json({ error: 'Clé API manquante côté serveur' });

  const riskDesc =
    risk < 20 ? 'très prudent — cotes 1.15–1.40, quasi-certitudes' :
    risk < 40 ? 'prudent — cotes 1.40–1.75, favoris nets' :
    risk < 60 ? 'équilibré value bet — cotes 1.75–2.50' :
    risk < 80 ? 'risqué — cotes 2.50–4.50, outsiders' :
                'YOLO — cotes 4.50+, gros combinés';

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const focusTxt    = focus?.trim() ? `Focus demandé : ${focus}.` : 'Libre choix des matchs.';
  const sportLabel  = sport === 'Surprise' ? 'un sport surprise au choix (football, tennis, basket, rugby)' : (sport || 'Football');

  const prompt = `Tu es un analyste sportif expert en paris. Date : ${today}.

MISSION : Génère un ticket de paris ${sportLabel} avec exactement ${nb} sélection(s).

PARAMÈTRES DU JOUEUR :
- Mise totale : ${mise}€
- Profil de risque : ${risk}% → ${riskDesc}
- ${focusTxt}

RÈGLES IMPORTANTES :
1. Choisis des matchs RÉELS qui se jouent cette semaine dans de vraies compétitions
2. Adapte les cotes EXACTEMENT au profil de risque ci-dessus
3. Pour chaque sélection, fournis 3 statistiques concrètes et récentes :
   - Forme récente (5 derniers matchs)
   - Statistique de buts ou xG
   - Confrontations directes ou avantage terrain
4. Varie les types de paris : 1X2, plus/moins de buts, BTTS, handicap, mi-temps
5. Calcule cote_totale = multiplication de toutes les cotes individuelles

Réponds UNIQUEMENT avec ce JSON valide, sans texte avant ni après :
{
  "type_ticket": "SIMPLE ou COMBINÉ ou SYSTÈME",
  "selections": [
    {
      "league": "Nom complet de la compétition",
      "match": "Équipe Domicile vs Équipe Extérieur",
      "date_match": "ex: Samedi 22 mars 2026",
      "pari": "Description précise du pari",
      "cote": 1.85,
      "emoji": "⚽",
      "raison_courte": "Phrase d'accroche percutante sur ce choix",
      "stats": [
        "📊 Forme : description avec chiffres concrets",
        "📈 Buts/xG : statistique précise avec chiffres",
        "⚡ H2H ou terrain : donnée concrète avec chiffres"
      ]
    }
  ],
  "cote_totale": 3.42,
  "confiance": 74,
  "verdict_emoji": "🎯",
  "verdict_titre": "Titre court et accrocheur",
  "verdict_texte": "Phrase résumant la stratégie du ticket",
  "pourquoi": [
    { "emoji": "📊", "texte": "**Argument principal** : explication avec données réelles" },
    { "emoji": "⚡", "texte": "**Value identifiée** : pourquoi ce pari est sous-coté" },
    { "emoji": "🎯", "texte": "**Cohérence du ticket** : logique globale du combiné" },
    { "emoji": "⚠️", "texte": "**Risque à surveiller** : ce qui pourrait mal tourner" }
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
        max_tokens: 2000,
        temperature: 0.65
      })
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json().catch(() => ({}));
      console.error('Groq error:', errData);
      return res.status(502).json({ error: 'Service d\'analyse indisponible' });
    }

    const data   = await groqRes.json();
    const text   = data.choices?.[0]?.message?.content || '';

    // Extract JSON robustly
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in:', text.slice(0, 200));
      return res.status(502).json({ error: 'Réponse IA invalide, réessaie' });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Recalculate server-side for reliability
    if (Array.isArray(parsed.selections) && parsed.selections.length > 0) {
      parsed.cote_totale = parsed.selections.reduce(
        (acc, s) => acc * (parseFloat(s.cote) || 1), 1
      );
      parsed.cote_totale = Math.round(parsed.cote_totale * 100) / 100;
    }
    parsed.gain_potentiel = Math.round(parseFloat(mise) * (parsed.cote_totale || 1));
    parsed.confiance      = Math.min(Math.max(parseInt(parsed.confiance) || 65, 5), 99);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: 'Erreur interne : ' + err.message });
  }
};
