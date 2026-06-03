/**
 * Firebase Admin SDK — Shifter Backend
 * Utilisé pour vérifier les ID tokens Firebase issus par les apps mobiles
 * après authentification par numéro de téléphone.
 *
 * Variables d'environnement requises (Render) :
 *   project_id       → Firebase project ID
 *   client_email     → Service account email
 *   private_key      → Service account private key (avec \n littéraux ou vrais sauts de ligne)
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const privateKey = process.env.private_key?.replace(/\\n/g, '\n');

  if (!process.env.project_id || !process.env.client_email || !privateKey) {
    console.error('[FIREBASE] Variables manquantes : project_id, client_email ou private_key');
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.project_id,
        clientEmail: process.env.client_email,
        privateKey,
      }),
    });
    console.log(`[FIREBASE] Admin SDK initialisé — projet: ${process.env.project_id}`);
  }
}

module.exports = admin;
