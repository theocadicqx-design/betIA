# BET-IA 🎯 — Déploiement sur Vercel (100% gratuit)

## Architecture
```
betia/
├── api/
│   └── generate.js     ← Serverless function (clé API cachée ici)
├── public/
│   └── index.html      ← Frontend
├── vercel.json         ← Config routing
└── package.json
```

La clé Groq est stockée dans les variables d'environnement Vercel.
Elle n'apparaît JAMAIS dans le code ni dans le navigateur.

---

## 🚀 Déploiement en 5 minutes

### Étape 1 — Clé Groq gratuite
1. Va sur https://console.groq.com
2. Crée un compte (juste un email)
3. API Keys → Create API Key
4. Copie la clé (commence par `gsk_`)

### Étape 2 — GitHub
1. Crée un compte sur https://github.com si tu n'en as pas
2. Crée un nouveau repository (ex: `bet-ia`)
3. Upload tous les fichiers de ce dossier
   - api/generate.js
   - public/index.html
   - vercel.json
   - package.json

### Étape 3 — Vercel
1. Va sur https://vercel.com → Sign up avec GitHub
2. "Add New Project" → importe ton repo `bet-ia`
3. Ne change rien dans les settings → clique "Deploy"
4. AVANT de finir : va dans Settings → Environment Variables
   - Name  : GROQ_API_KEY
   - Value : gsk_xxxxxx... (ta clé Groq)
   - Clique "Save"
5. Redeploy (Deployments → ... → Redeploy)

✅ Ton site est en ligne sur https://bet-ia-XXXX.vercel.app

---

## 🔒 Sécurité
- La clé Groq est dans les env vars Vercel → jamais visible côté client
- Le frontend appelle /api/generate (ton propre serveur)
- Personne ne peut voir que tu utilises Groq ou quoi que ce soit

## 💰 Coûts
- Vercel : GRATUIT (100GB bandwidth/mois)
- Groq   : GRATUIT (30 requêtes/minute, 14400/jour)
