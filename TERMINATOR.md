# 🛡️ TERMINATOR — Architecture Sécurité Shifter

> Système de sécurité multicouche de la plateforme Shifter.
> **Principe : si une couche échoue, une autre prend le relais.**

---

## Architecture — 9 Couches de Défense

```
INTERNET
    │
    ▼
┌─────────────────────────────────────────┐
│  COUCHE 0 — Cloudflare (externe)        │  WAF, DDoS, Bot detection
│  COUCHE 1 — IP Firewall (T1)            │  Auto-ban, liste noire
│  COUCHE 2 — Anomaly Detection (T2)      │  Injection, scan, volume
│  COUCHE 3 — Rate Limiting               │  Par IP/user/route
│  COUCHE 4 — Authentification            │  JWT 2h, rotation, Firebase
│  COUCHE 5 — Autorisation (RBAC)         │  Rôles, ownership, UUID
│  COUCHE 6 — Validation inputs           │  Schema, sanitisation
│  COUCHE 7 — Circuit Breakers (T3)       │  Services externes
│  COUCHE 8 — Audit Trail                 │  Logs immuables, admin_audit_logs
│  COUCHE 9 — Cron & Maintenance          │  Nettoyage automatique
└─────────────────────────────────────────┘
    │
    ▼
BASE DE DONNÉES (Supabase / PostgreSQL)
```

---

## Couche 0 — Cloudflare (WAF externe)

### Setup (gratuit, 5 minutes)

1. Créer un compte sur **cloudflare.com**
2. Ajouter ton domaine (si tu en as un) ou configurer en mode proxy
3. Dans **Security** → **WAF** → activer les règles managées
4. Dans **Security** → **Bot Fight Mode** → activer
5. Dans **Security** → **Settings** → Security Level: **Medium**

### Règles WAF personnalisées à créer (Security → WAF → Custom Rules)

**Règle 1 — Bloquer les user-agents suspects :**
```
(http.user_agent contains "sqlmap") or
(http.user_agent contains "nikto") or
(http.user_agent contains "masscan") or
(http.user_agent contains "nmap") or
(http.user_agent eq "")
→ Action: Block
```

**Règle 2 — Protéger les routes admin :**
```
(http.request.uri.path contains "/api/admin") and
(not ip.src in {IP_FIXE_ADMIN_1 IP_FIXE_ADMIN_2})
→ Action: Challenge (CAPTCHA)
```
*(Optionnel si tu n'as pas d'IP fixe)*

**Règle 3 — Rate limit sur OTP :**
```
http.request.uri.path eq "/api/auth/send-otp"
→ Action: Rate Limit (5 req / 10 min par IP)
```

**Règle 4 — Bloquer les injections communes :**
```
(http.request.uri.query contains "' OR '") or
(http.request.uri.query contains "<script") or
(http.request.body contains "UNION SELECT")
→ Action: Block
```

### Variables d'en-têtes Cloudflare à configurer dans Render
```
CLOUDFLARE_TUNNEL = true   (optionnel, pour logs)
```

---

## Couche 1 — IP Firewall (TERMINATOR T1)

**Fichier :** `src/middleware/terminator/ipFirewall.js`

| Seuil | Niveau | Durée de ban |
|-------|--------|--------------|
| 5 incidents | WARNING | Surveillance |
| 10 incidents | SOFT_BAN | 30 minutes |
| 20 incidents | HARD_BAN | 24 heures |

**Incidents trackés :**
- Échec de connexion admin
- Code OTP invalide
- Token Firebase invalide
- Accès à une ressource interdite (403)
- Token JWT invalide (401)
- Pattern d'injection détecté

**Endpoints admin :**
- `GET /api/admin/terminator/status` — statut complet
- `GET /api/admin/terminator/banned-ips` — IPs bannies
- `DELETE /api/admin/terminator/ban/:ip` — débloquer (superadmin)
- `POST /api/admin/terminator/ban` — bannir manuellement (superadmin)

---

## Couche 2 — Détection d'anomalies (TERMINATOR T2)

**Fichier :** `src/middleware/terminator/anomaly.js`

**Détections actives :**
- Patterns SQL/XSS/LFI/RCE dans tous les inputs body/query/params
- Scan de routes : > 30 routes différentes en 5 min → incident
- Volume excessif : > 200 requêtes/min par user authentifié → incident
- Escalade automatique vers le pare-feu IP (T1)

---

## Couche 3 — Rate Limiting

**Fichier :** `src/middleware/rateLimit.js`

| Route | Limite | Fenêtre | Clé |
|-------|--------|---------|-----|
| Global | 500 req | 15 min | IP |
| OTP send | 5 req | 10 min | Phone+IP |
| Admin login | 5 tentatives | 15 min | IP (échecs uniquement) |
| Routes strictes | 20 req | 1 min | IP |
| Création course | 3 req | 5 min | UserId |

---

## Couche 4 — Authentification

**JWT Access Token :** 2h (réduit de 7j → 2h)
**JWT Refresh Token :** 30 jours
**Token Admin :** 8h

**Protections :**
- Rotation des refresh tokens à chaque utilisation
- Révocation globale si refresh token révoqué réutilisé (replay attack)
- Comparaison admin password en temps constant (anti-timing)
- Délai fixe 300ms sur login admin (anti-bruteforce)
- OTP : blocage après 5 tentatives incorrectes
- Firebase ID Token vérifié côté backend uniquement

---

## Couche 5 — Autorisation RBAC

**Hiérarchie admin :**
```
superadmin (5) > admin (4) > finance (3) > operations (2) > support (1)
```

**Validations :**
- UUID v4 obligatoire sur tous les paramètres `:id`
- Vérification ownership : client/chauffeur ne peut accéder qu'à SES données
- `requireAdminRole()` fail-closed : erreur DB = refus d'accès
- Socket.io : `ride:join`, `tracking:subscribe`, `chat:message` vérifiés en DB

---

## Couche 7 — Circuit Breakers (TERMINATOR T3)

**Fichier :** `src/middleware/terminator/circuitBreaker.js`

| Service | Seuil échecs | Durée récupération | Fallback |
|---------|-------------|-------------------|---------|
| Google Maps | 3 | 60s | Haversine |
| Expo Push | 5 | 30s | null (notification perdue) |
| Firebase | 3 | 120s | Erreur propre |
| Supabase Storage | 3 | 60s | null |

**États :** CLOSED → OPEN → HALF → CLOSED

---

## Couche 8 — Audit Trail

**Table :** `admin_audit_logs`

**Actions tracées :**
- Connexion admin (succès et échec)
- Approbation/rejet/suspension chauffeur
- Suspension/activation utilisateur
- Annulation de course forcée
- Modification de rôle admin
- Nettoyage de données (cleanup_stuck, reset_test_data)
- Ban/unban IP manuel
- Toute action destructive

---

## Couche 9 — Cron Jobs

**Fichier :** `src/cron/index.js`

| Job | Fréquence | Action |
|-----|-----------|--------|
| OTP cleanup | Toutes les heures | Supprime OTP > 1h expirés |
| Refresh tokens | Toutes les 6h | Supprime tokens révoqués/expirés |
| Ride timeout | Toutes les 5 min | Annule courses bloquées > 10 min |
| Notifications | Tous les jours à 3h | Supprime notifications lues > 30j |
| Rapport santé | Tous les jours à 8h | Log des métriques clés |

---

## Preflight — Transition DEV → PRODUCTION

**Fichier :** `src/middleware/terminator/preflight.js`

Au démarrage, TERMINATOR vérifie automatiquement l'état de sécurité.

**En DEVELOPMENT :** warnings uniquement, démarrage autorisé.

**En PRODUCTION (NODE_ENV=production) :** si un check bloquant échoue → `process.exit(1)`.

| Check | Bloquant en prod | Statut actuel |
|-------|-----------------|---------------|
| OTP_BYPASS_DEV désactivé | ✅ OUI | ⚠️ Actif (dev intentionnel) |
| JWT_SECRET non-défaut | ✅ OUI | À vérifier sur Render |
| Credentials admin définis | ✅ OUI | ✅ Définis |
| DATABASE_URL définie | ✅ OUI | ✅ Définie |
| Firebase configuré | ❌ Warning | ⚠️ En attente build |
| Supabase configuré | ❌ Warning | ✅ Défini |
| Google Maps Key | ❌ Warning | ✅ Présente |
| Expo Access Token | ❌ Warning | À vérifier |

### Procédure de lancement en production

1. Désactiver `OTP_BYPASS_DEV` dans Render
2. Configurer Firebase (builds iOS/Android)
3. Changer `NODE_ENV=production` dans Render
4. Déployer → TERMINATOR bloquera automatiquement si une config est dangereuse

---

## Inventaire complet des endpoints

### Public (sans auth)
| Endpoint | Protection |
|----------|-----------|
| GET /health | Rate limit global, TERMINATOR T1+T2 |
| POST /api/auth/send-otp | OTP limiter (5/10min Phone+IP), T1+T2 |
| POST /api/auth/verify-otp | Validation, OTP lockout 5 tentatives |
| POST /api/auth/refresh-token | Rotation token, replay detection |
| POST /api/auth/verify-firebase-token | Strict limiter, Firebase verify |
| GET /track/:rideId | UUID validation, données minimales |
| GET /api/rides/:rideId/track | UUID validation, données minimales |

### Utilisateur authentifié
| Endpoint | Protection |
|----------|-----------|
| POST /api/rides | Auth + rideLimiter (3/5min) + validation coordonnées |
| GET /api/rides/:id | Auth + ownership check (client/driver/admin) |
| POST /api/rides/:id/status | Auth + transition state machine validée |
| POST /api/rides/:id/sos | Auth + participant check |
| POST /api/rides/:id/rate | Auth + participant check + completed only |
| GET /api/drivers/me | Auth uniquement |
| POST /api/drivers/documents | Auth + multer (5MB, types stricts) |
| GET /api/drivers/documents/:docId/url | Auth + ownership check → signed URL |

### Admin
| Endpoint | Protection |
|----------|-----------|
| POST /api/auth/admin-login | adminLoginLimiter (5/15min) + timing-safe |
| GET /api/admin/* | Auth + role=admin |
| PUT /api/admin/drivers/:id/approve | adminId (UUID) + role=operations + auditLog |
| POST /api/admin/reset-test-data | superadmin + bloqué en production |
| GET /api/admin/terminator/* | admin + superadmin selon action |

---

## Classification des données sensibles

| Données | Stockage | Protection | Accès |
|---------|----------|-----------|-------|
| Numéros de téléphone | PostgreSQL | Accès backend only | Auth obligatoire |
| Documents KYC | Supabase Storage (privé) | Signed URLs 15min | Owner + Admin |
| JWT tokens | Mémoire app / SecureStore | Expiration 2h | User seul |
| Refresh tokens | PostgreSQL (hashés) | Révocables | Backend only |
| Positions GPS | PostgreSQL (current_lat/lng) | Backend only | Course en cours |
| Clé Google Maps | Render env vars | Non exposée | Backend only |
| Firebase creds | Render env vars | Non exposées | Backend only |
| Mots de passe admin | Render env vars | timingSafeCompare | Backend only |
| Logs d'audit | PostgreSQL | Admin 4+ seulement | Lecture seule |

---

## Risques résiduels connus

| Risque | Niveau | Raison |
|--------|--------|--------|
| OTP_BYPASS actif | CRITIQUE | Intentionnel (dev) — à désactiver avant prod |
| Rate limiting en mémoire | MOYEN | Survit pas aux redémarrages — Redis à prévoir |
| JWT access token en sessionStorage (admin panel) | MOYEN | Vulnérable XSS — httpOnly cookie à prévoir |
| RLS Supabase tables non confirmée | MOYEN | Script SQL exécuté mais non vérifié |
| Clé Google Maps non restreinte | MOYEN | À restreindre dans Google Cloud Console |
| Single instance Render | MOYEN | Socket.io ne scale pas — Redis Adapter à prévoir |
| Pas de paiement réel | BUSINESS | Modèle économique non opérationnel |

---

## Checklist avant lancement production

- [ ] Désactiver `OTP_BYPASS_DEV` dans Render
- [ ] Vérifier `JWT_SECRET` est bien un secret fort (≥ 64 chars random)
- [ ] Configurer `EXPO_ACCESS_TOKEN` dans Render
- [ ] Changer `NODE_ENV=production` dans Render
- [ ] Activer Cloudflare sur le domaine de production
- [ ] Créer les règles WAF Cloudflare custom
- [ ] Restreindre la clé Google Maps dans Google Cloud Console
- [ ] Vérifier le script `supabase-security.sql` a bien été exécuté
- [ ] Vérifier que le bucket `driver-documents` est bien en mode privé
- [ ] Tester l'endpoint `GET /api/admin/terminator/status` après déploiement
- [ ] Builds iOS (Apple Developer Account requis) et Android
- [ ] Configurer Firebase Auth pour la production
- [ ] Activer les backups automatiques Supabase (plan payant ou pg_dump)
