# 🛵 TaxaMoto — Guide de démarrage complet

> Application de moto-taxi type Uber, **100 % gratuite** en développement et au lancement.

---

## 🗺️ Architecture du projet

```
taxi-moto/
├── backend/              → API Node.js + Socket.io + Prisma
├── apps/
│   ├── mobile-client/    → App Expo (React Native) — Clients
│   ├── mobile-driver/    → App Expo (React Native) — Chauffeurs
│   └── admin/            → Dashboard React + Vite + Tailwind
├── supabase/
│   └── migrations/       → Schéma SQL PostgreSQL
├── docker-compose.yml    → Dev local (PostgreSQL + Redis)
└── .env.example          → Variables d'environnement
```

## 🛠 Stack technique (100 % gratuite)

| Couche | Technologie | Gratuit |
|--------|------------|---------|
| Base de données | Supabase PostgreSQL | ✅ 500 MB |
| Auth + OTP | Supabase Auth + Twilio trial | ✅ |
| Temps réel | Socket.io (auto-hébergé) | ✅ |
| Mobile client | Expo (React Native) | ✅ |
| Mobile chauffeur | Expo (React Native) | ✅ |
| Admin panel | React + Vite (Vercel) | ✅ |
| Backend | Node.js (Railway/Render) | ✅ free tier |
| Cartes | OpenStreetMap + react-native-maps | ✅ illimité |
| Géocodage | Nominatim (OpenStreetMap) | ✅ illimité |
| Notifications push | Expo Push Notifications | ✅ illimité |
| Cache/sessions | Redis (Upstash) | ✅ 10k req/jour |

---

## ⚡ Démarrage rapide (dev local)

### 1. Prérequis

```bash
# Vérifier que vous avez :
node --version    # >= 18
npm --version     # >= 9
docker --version  # (optionnel, pour DB locale)
```

### 2. Cloner & configurer

```bash
cd "app taxi moto"

# Copier la config
cp .env.example .env

# Éditer .env avec vos valeurs
# (Pour le dev, les valeurs par défaut fonctionnent avec OTP_BYPASS_DEV=true)
```

### 3. Base de données

**Option A — Docker (recommandé pour dev local) :**
```bash
docker-compose up -d postgres redis
```

**Option B — Supabase (production-ready gratuit) :**
1. Créer un projet sur [supabase.com](https://supabase.com) (gratuit)
2. Aller dans SQL Editor → coller le contenu de `supabase/migrations/001_initial_schema.sql`
3. Exécuter
4. Copier les clés dans votre `.env`

### 4. Backend

```bash
cd backend

# Installer les dépendances
npm install

# Générer le client Prisma
npx prisma generate

# Appliquer les migrations (si DB vide)
npx prisma db push

# Démarrer le serveur de développement
npm run dev
# → http://localhost:3000
# → Health check: http://localhost:3000/health
```

### 5. Admin Panel

```bash
cd apps/admin

npm install
npm run dev
# → http://localhost:5173
```

**Connexion admin :**
- Numéro : `+000000000` (admin par défaut créé dans les migrations)
- Code OTP : `123456` (mode dev, OTP_BYPASS_DEV=true)

### 6. Apps mobiles

```bash
# Installer Expo CLI
npm install -g expo-cli

# App Client
cd apps/mobile-client
npm install
npx expo start

# App Chauffeur (nouveau terminal)
cd apps/mobile-driver
npm install
npx expo start --port 8082
```

**Pour tester sur votre téléphone :**
1. Installer **Expo Go** sur votre smartphone
2. Scanner le QR code affiché dans le terminal
3. S'assurer que téléphone et PC sont sur le même WiFi

**⚠️ Important :** Dans `apps/mobile-client/app.json` et `apps/mobile-driver/app.json`, changez `apiUrl` pour pointer vers l'IP de votre machine (pas `localhost`) :
```json
"extra": { "apiUrl": "http://192.168.1.X:3000" }
```

---

## 🚀 Mise en production (gratuit)

### Backend → Railway (free tier)

```bash
# Installer Railway CLI
npm install -g @railway/cli

railway login
railway init
railway up

# Ajouter les variables d'env dans le dashboard Railway
```

### Backend → Render (alternative)

1. Créer un compte sur [render.com](https://render.com)
2. New Web Service → connecter votre dépôt Git
3. Build Command: `cd backend && npm install && npx prisma generate`
4. Start Command: `cd backend && node src/index.js`
5. Ajouter toutes les variables d'env

### Admin Panel → Vercel (gratuit)

```bash
npm install -g vercel
cd apps/admin
vercel

# Configurer VITE_API_URL avec l'URL de votre backend Railway/Render
```

### Apps mobiles → Expo EAS (gratuit)

```bash
npm install -g eas-cli
eas login

# Build pour Android
cd apps/mobile-client
eas build --platform android --profile preview

# Build pour iOS (nécessite compte Apple Developer à 99$/an)
eas build --platform ios --profile preview
```

---

## 📱 Flux utilisateur complet

### Côté CLIENT :
```
1. Télécharger l'app → Accueil de bienvenue
2. Saisir téléphone → Recevoir OTP (SMS ou code dev: 123456)
3. Saisir OTP → Compte créé automatiquement
4. Carte avec position GPS → Saisir destination
5. Voir l'estimation (prix, durée, distance)
6. Choisir mode de paiement → Commander
7. Suivi du chauffeur en temps réel sur la carte
8. Course terminée → Évaluer le chauffeur (1-5 étoiles)
```

### Côté CHAUFFEUR :
```
1. Télécharger l'app chauffeur → S'inscrire
2. Remplir informations véhicule (moto, plaque...)
3. Uploader les documents (CNI, permis, assurance...)
4. Attendre validation admin (24-48h)
5. Une fois approuvé → Basculer en "En ligne"
6. Recevoir une demande → Accepter/Refuser (10s)
7. Aller chercher le client → Démarrer la course
8. Terminer → Voir les gains (80% du tarif)
```

### Côté ADMIN :
```
1. Se connecter avec le numéro admin
2. Dashboard → Vue d'ensemble des KPIs
3. Chauffeurs → Valider/Rejeter les dossiers
4. Courses → Surveiller en temps réel
5. Analytics → Revenus, tendances
6. SOS → Alertes d'urgence (actualisation auto)
```

---

## 🔑 Variables d'environnement essentielles

```bash
# Minimum vital pour fonctionner en dev
DATABASE_URL="postgresql://taxamoto:taxamoto_dev@localhost:5432/taxamoto"
JWT_SECRET="min-64-caracteres-random"
OTP_BYPASS_DEV=true          # Code 123456 en dev, désactiver en prod
PORT=3000
NODE_ENV=development

# Pour activer les vrais SMS OTP en production
TWILIO_ACCOUNT_SID="ACxxx"
TWILIO_AUTH_TOKEN="xxx"
TWILIO_PHONE_NUMBER="+15555555555"
OTP_BYPASS_DEV=false         # ← Désactiver en production !

# Pour les notifications push (optionnel en dev)
# Expo Push fonctionne directement sans config supplémentaire
```

---

## 🗄 Schéma de base de données

| Table | Rôle |
|-------|------|
| `users` | Clients + Admins (rôle: client/driver/admin) |
| `drivers` | Profil chauffeur + position GPS + statut |
| `driver_documents` | CNI, permis, carte grise, assurance |
| `rides` | Courses (statut, tarif, GPS départ/arrivée) |
| `ratings` | Évaluations post-course |
| `notifications` | Historique des push notifications |
| `favorite_addresses` | Adresses favorites (Maison, Bureau...) |
| `ride_tracking` | Historique GPS pour audit |
| `otp_codes` | Codes OTP temporaires |
| `refresh_tokens` | Tokens de session |
| `promo_codes` | Codes promo |
| `support_tickets` | Tickets support |

---

## 🧩 API Endpoints principaux

```
POST   /api/auth/send-otp          → Envoyer OTP
POST   /api/auth/verify-otp        → Vérifier OTP + login
POST   /api/auth/refresh-token     → Renouveler le token
GET    /api/auth/me                → Profil utilisateur connecté
PUT    /api/auth/profile           → Mettre à jour le profil

POST   /api/rides/estimate         → Estimer le prix
GET    /api/rides/nearby-drivers   → Chauffeurs proches
POST   /api/rides                  → Créer une course
GET    /api/rides/active           → Course en cours
GET    /api/rides/history          → Historique
POST   /api/rides/:id/accept       → Accepter (chauffeur)
POST   /api/rides/:id/status       → Mettre à jour le statut
POST   /api/rides/:id/rate         → Évaluer
GET    /api/rides/geocode/autocomplete  → Recherche d'adresse
GET    /api/rides/geocode/reverse       → Adresse depuis GPS
POST   /api/rides/:id/sos          → Alerte SOS

POST   /api/drivers/register       → Inscription chauffeur
POST   /api/drivers/documents      → Upload document
GET    /api/drivers/me             → Mon profil chauffeur
PUT    /api/drivers/availability   → Changer disponibilité
PUT    /api/drivers/location       → Mettre à jour position
GET    /api/drivers/earnings       → Mes revenus

GET    /api/admin/stats            → KPIs globaux
GET    /api/admin/drivers          → Liste chauffeurs
PUT    /api/admin/drivers/:id/approve  → Approuver
PUT    /api/admin/drivers/:id/reject   → Rejeter
GET    /api/admin/rides            → Toutes les courses
GET    /api/admin/analytics        → Graphiques revenus/courses
```

---

## ⚡ Événements Socket.io

```javascript
// Client → Serveur
'ride:join'                   → Rejoindre une room de course
'tracking:subscribe'          → S'abonner au tracking d'un chauffeur
'chat:message'                → Envoyer un message

// Serveur → Client
'new_ride_request'            → Nouvelle course disponible (chauffeurs)
'ride_accepted'               → Course acceptée (client)
'ride_status_changed'         → Changement de statut
'driver:location_updated'     → Nouvelle position GPS du chauffeur
'sos_alert'                   → Alerte SOS (admin)

// Chauffeur → Serveur
'driver:update_location'      → Envoyer position GPS
```

---

## 💰 Tarification configurée

```
Tarif de base : 500 FCFA
Prix / km : 150 FCFA
Prix / minute : 20 FCFA
Minimum : 1 000 FCFA
Commission plateforme : 20%
Revenu chauffeur : 80%
```
*Modifiable dans `.env` → variables PRICE_PER_KM, BASE_FARE, etc.*

---

## 🐛 Dépannage courant

**"OTP ne fonctionne pas"**
→ Vérifier `OTP_BYPASS_DEV=true` dans `.env`, le code est toujours `123456`

**"La carte ne charge pas"**
→ OpenStreetMap est gratuit et sans clé API. Si ça ne charge pas, vérifier la connexion internet du téléphone.

**"Expo ne se connecte pas au backend"**
→ Utiliser l'IP locale (192.168.x.x) au lieu de `localhost` dans `app.json`

**"Prisma erreur de migration"**
→ `cd backend && npx prisma db push --force-reset` (⚠️ réinitialise la DB)

**"Socket.io ne fonctionne pas"**
→ Vérifier que le port 3000 n'est pas bloqué par un firewall

---

## 📈 Scalabilité prévue

| Phase | Utilisateurs | Stack | Coût estimé |
|-------|-------------|-------|-------------|
| MVP Launch | 0-1 000 | Supabase Free + Railway Free | **0 €/mois** |
| Croissance | 1 000-10 000 | Supabase Pro + Railway Starter | ~25 €/mois |
| Scale | 10 000+ | Self-hosted ou AWS/GCP | ~150 €/mois |

---

## 🔐 Sécurité mise en place

- ✅ JWT avec refresh tokens (rotation automatique)
- ✅ OTP par SMS avec expiration 10 minutes
- ✅ Rate limiting (5 OTP/10min, 100 req/15min)
- ✅ Helmet.js (headers HTTP sécurisés)
- ✅ Validation des inputs (express-validator)
- ✅ Vérification des rôles sur chaque route
- ✅ Isolation client/chauffeur/admin
- ✅ CORS configuré
- ✅ Compression gzip

---

*Généré par Claude · TaxaMoto v1.0.0*
