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
    risk < 20 ? 'très prudent — cotes 1.15–1.40, quasi-certitudes absolues' :
    risk < 40 ? 'prudent — cotes 1.40–1.75, favoris nets' :
    risk < 60 ? 'équilibré value bet — cotes 1.75–2.50, bon ratio' :
    risk < 80 ? 'risqué — cotes 2.50–4.50, outsiders avec potentiel' :
                'YOLO — cotes 4.50+, gros combinés audacieux';

  const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const focusTxt = focus?.trim() ? `L'utilisateur demande un focus sur : "${focus}". Priorise des matchs impliquant cette équipe/ligue.` : 'Libre choix des compétitions.';
  const sportLabel = sport === 'Surprise' ? 'un sport surprise au choix parmi football, tennis, basketball ou rugby' : (sport || 'Football');

  // Mode COMBO = Paris combinés avancés (buteurs, corners, cartons, mi-temps, BTTS)
  const comboInstructions = mode === 'combo' ? `
TYPES DE PARIS AVANCÉS À UTILISER OBLIGATOIREMENT (varie-les, ne répète pas le même type) :
- Buteur marqueur : "Kylian Mbappé buteur à tout moment"
- Combiné match : "Barcelone gagne + Plus de 2.5 buts dans le match"
- BTTS + résultat : "Les deux équipes marquent + Victoire Arsenal"
- Première mi-temps : "Plus de 1.5 buts en première mi-temps"
- Handicap buteurs : "Erling Haaland 2 buts ou plus"
- Corners : "Plus de 9.5 corners dans le match"
- Score exact (risqué) : "Score exact 2-1 pour l'équipe favorite"
- Double pari combiné : "1X2 + Total buts combinés sur un même match"

Pour chaque sélection, crée un pari combiné RÉALISTE sur un même match, ex:
"Barcelone gagne + Lewandowski buteur + Plus de 2.5 buts" avec une cote globale cohérente.
Chaque sélection doit avoir un champ "sous_paris" listant les paris composants.` : `
TYPES DE PARIS (varie-les) :
1X2 classique, Plus/moins de buts, BTTS (les deux équipes marquent), Handicap asiatique, Mi-temps/final.`;

  const prompt = `Tu es le meilleur expert en analyse de paris sportifs combinés. Date : ${today}.

MISSION : Génère un ticket de paris ${sportLabel} avec exactement ${nb} sélection(s).

PARAMÈTRES :
- Mise : ${mise}€
- Profil de risque : ${risk}% → ${riskDesc}
- ${focusTxt}
${comboInstructions}

RÈGLES ABSOLUES :
1. Matchs RÉELS de cette semaine dans de vraies compétitions européennes/mondiales
2. Adapte les cotes EXACTEMENT au profil de risque
3. Pour chaque sélection, fournis 3 stats CONCRÈTES avec chiffres réels :
   - Forme des 5 derniers matchs (ex: V V N D V)
   - Stats de buts/xG récents
   - H2H ou avantage domicile/extérieur
4. Si mode combo : explique comment les paris se combinent sur un même match
5. Calcule cote_totale = multiplication de toutes les cotes

Réponds UNIQUEMENT avec ce JSON valide, zéro texte avant/après :
{
  "type_ticket": "SIMPLE|COMBINÉ|COMBO AVANCÉ",
  "selections": [
    {
      "league": "Nom complet de la ligue",
      "match": "Équipe Domicile vs Équipe Extérieur",
      "date_match": "ex: Samedi 22 mars 2026",
      "pari": "Description précise et complète du pari",
      "sous_paris": ["Paris composant 1", "Paris composant 2"],
      "cote": 2.15,
      "emoji": "⚽",
      "raison_courte": "Accroche percutante en une phrase",
      "stats": [
        "📊 Forme : ex V V N D V — 4 victoires sur 5 derniers matchs",
        "⚽ Buts : moyenne de 2.4 buts/match, xG de 1.9",
        "🔁 H2H : 3 victoires sur les 4 dernières confrontations"
      ]
    }
  ],
  "cote_totale": 4.62,
  "confiance": 68,
  "verdict_emoji": "🔥",
  "verdict_titre": "Titre accrocheur du ticket",
  "verdict_texte": "Phrase résumant la stratégie",
  "pourquoi": [
    { "emoji": "📊", "texte": "**Argument stats** : données réelles et précises" },
    { "emoji": "⚡", "texte": "**Value identifiée** : pourquoi ce pari est sous-coté" },
    { "emoji": "🎯", "texte": "**Cohérence** : logique du ticket dans son ensemble" },
    { "emoji": "⚠️", "texte": "**Risque** : ce qui pourrait compromettre le ticket" }
  ]
}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role:'user', content:prompt }],
        max_tokens: 2200,
        temperature: 0.65
      })
    });

    if (!groqRes.ok) {
      const e = await groqRes.json().catch(()=>({}));
      console.error('Groq error:', e);
      return res.status(502).json({ error: "Service d'analyse indisponible" });
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Réponse IA invalide, réessaie' });

    const parsed = JSON.parse(jsonMatch[0]);

    if (Array.isArray(parsed.selections) && parsed.selections.length > 0) {
      parsed.cote_totale = parsed.selections.reduce((a,s) => a * (parseFloat(s.cote)||1), 1);
      parsed.cote_totale = Math.round(parsed.cote_totale * 100) / 100;
    }
    parsed.gain_potentiel = Math.round(parseFloat(mise) * (parsed.cote_totale||1));
    parsed.confiance = Math.min(Math.max(parseInt(parsed.confiance)||65, 5), 99);

    return res.status(200).json(parsed);
  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: 'Erreur interne : ' + err.message });
  }
};
