/**
 * RIDE SYNC SERVICE — Matrice de synchronisation complète
 *
 * Pour chaque événement de course, garantit que ces systèmes reçoivent
 * exactement la même information au même moment :
 *
 *   ┌─────────────────────┬──────────┬───────────┬──────────┬────────┬────────┐
 *   │ Événement           │ DB       │ Socket    │ Push     │ Admin  │ Client │
 *   ├─────────────────────┼──────────┼───────────┼──────────┼────────┼────────┤
 *   │ Créée               │ appelant │ ─         │ ─        │ ✓      │ ─      │
 *   │ Acceptée            │ appelant │ ✓ ride+   │ ✓ client │ ✓      │ ✓      │
 *   │ En route            │ appelant │ ✓ ride+   │ ─        │ ✓      │ ✓      │
 *   │ Arrivée             │ appelant │ ✓ ride+   │ ✓ client │ ✓      │ ✓      │
 *   │ Démarrée            │ appelant │ ✓ ride+   │ ✓ client │ ✓      │ ✓      │
 *   │ Terminée            │ appelant │ ✓ ride+   │ ✓ client │ ✓      │ ✓      │
 *   │ Annulée             │ appelant │ ✓ ride+   │ ✓ deux   │ ✓      │ ✓      │
 *   │ Driver déconnecté   │ ─        │ ✓ ride+   │ ✓ client │ ✓      │ ✓      │
 *   │ Driver reconnecté   │ ─        │ ✓ ride+   │ ─        │ ✓      │ ✓      │
 *   └─────────────────────┴──────────┴───────────┴──────────┴────────┴────────┘
 *
 * IMPORTANT : ce service NE modifie PAS la base de données.
 * L'appelant est responsable de la transaction DB AVANT d'appeler ce service.
 */

const logger = require('./logger');

// Instance io globale (initialisée une fois au démarrage)
let _io = null;

/**
 * Initialiser le service avec l'instance Socket.io.
 * À appeler une fois dans index.js après création du serveur.
 */
const init = (io) => {
  _io = io;
  logger.info('[SYNC] RideSyncService initialisé');
};

/**
 * Émettre un événement vers la room de la course ET vers admin_room.
 * @param {object}  io        — instance io (optionnel, utilise _io si absent)
 * @param {string}  rideId
 * @param {string}  event
 * @param {object}  payload
 */
const _broadcast = (io, rideId, event, payload) => {
  const target = io || _io;
  if (!target) return;
  target.to(`ride_${rideId}`).emit(event, payload);
  target.to('admin_room').emit(event, { ...payload, _source: 'admin_broadcast' });
};

// ─────────────────────────────────────────────────────────────────────────────
// ÉVÉNEMENT PRINCIPAL : changement de statut
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Déclencher la matrice de synchronisation après un changement de statut.
 * À appeler APRÈS la mise à jour en base de données.
 *
 * @param {object}  params
 * @param {object}  params.ride          — Course depuis la DB (avec driver si disponible)
 * @param {string}  params.newStatus     — Nouveau statut
 * @param {string}  params.actorRole     — 'driver'|'client'|'admin'|'system'
 * @param {string}  [params.reason]      — Raison (annulation)
 * @param {string}  [params.driverName]  — Nom affiché du chauffeur (notifications)
 * @param {string}  [params.driverUserId]— userId du chauffeur (push)
 * @param {object}  [params.io]          — Instance io externe (optionnel)
 */
const onStatusChanged = async (params) => {
  const { ride, newStatus, actorRole, reason, driverName, driverUserId, io } = params;
  const rideId = ride.id;

  // Import lazy pour éviter les imports circulaires
  const {
    notifyRideAccepted,
    notifyDriverArrived,
    notifyRideStarted,
    notifyRideCompleted,
    sendPushNotification,
  } = require('./notifications');

  const basePayload = {
    rideId,
    status:    newStatus,
    reason:    reason || null,
    actorRole,
    timestamp: Date.now(),
    ride,
  };

  // ── 1. Socket.io — ride room + admin room ─────────────────────────────────
  _broadcast(io, rideId, 'ride_status_changed', basePayload);

  // ── 2. Événements spécifiques + Push notifications ────────────────────────
  switch (newStatus) {

    case 'accepted': {
      _broadcast(io, rideId, 'ride_accepted', { ride, timestamp: Date.now() });
      notifyRideAccepted(ride.clientId, rideId, driverName || '');
      break;
    }

    case 'driver_en_route': {
      _broadcast(io, rideId, 'ride_driver_en_route', { rideId, timestamp: Date.now() });
      // Pas de push pour ce statut (le client voit déjà le mouvement sur la carte)
      break;
    }

    case 'arrived': {
      _broadcast(io, rideId, 'ride_driver_arrived', { rideId, timestamp: Date.now() });
      notifyDriverArrived(ride.clientId, rideId);
      break;
    }

    case 'in_progress': {
      _broadcast(io, rideId, 'ride_started', { rideId, timestamp: Date.now() });
      notifyRideStarted(ride.clientId, rideId);
      break;
    }

    case 'completed': {
      _broadcast(io, rideId, 'ride_completed', {
        rideId,
        finalPrice: ride.finalPrice,
        timestamp:  Date.now(),
      });
      notifyRideCompleted(ride.clientId, rideId, ride.finalPrice);
      break;
    }

    case 'cancelled': {
      _broadcast(io, rideId, 'ride_cancelled', { rideId, reason, timestamp: Date.now() });

      // Push aux DEUX parties simultanément
      const cancelBody  = reason || 'La course a été annulée';
      const pushPayload = (userId) => sendPushNotification(userId, {
        type:  'ride_cancelled',
        title: '❌ Course annulée',
        body:  cancelBody,
        data:  { rideId, action: 'ride_cancelled' },
      }).catch(() => {});

      const uid = driverUserId || ride.driver?.userId;
      await Promise.all([
        pushPayload(ride.clientId),
        uid ? pushPayload(uid) : Promise.resolve(),
      ]);
      break;
    }
  }

  logger.info(`[SYNC] ride ${rideId}: ${newStatus} (acteur: ${actorRole})`);
};

// ─────────────────────────────────────────────────────────────────────────────
// ÉVÉNEMENTS SECONDAIRES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nouvelle course créée — notifier admin_room uniquement.
 */
const onRideCreated = (ride, io) => {
  const target = io || _io;
  if (!target) return;
  target.to('admin_room').emit('new_ride', { ride, timestamp: Date.now() });
  logger.info(`[SYNC] new_ride ${ride.id}`);
};

/**
 * Chauffeur déconnecté en cours de course.
 * N'annule PAS la course — juste une notification de connexion perdue.
 */
const onDriverDisconnected = async (rideId, clientId, io) => {
  const { sendPushNotification } = require('./notifications');
  const target = io || _io;

  const payload = {
    rideId,
    message:   'Votre chauffeur a perdu la connexion. Reconnexion en cours...',
    timestamp: Date.now(),
  };

  if (target) {
    target.to(`ride_${rideId}`).emit('driver_disconnected', payload);
    target.to('admin_room').emit('driver_disconnected', { ...payload, clientId, _source: 'admin_broadcast' });
  }

  await sendPushNotification(clientId, {
    type:  'driver_disconnected',
    title: '⚠️ Connexion interrompue',
    body:  'Votre chauffeur a perdu la connexion. La course reste active.',
    data:  { rideId, action: 'driver_disconnected' },
  }).catch(() => {});

  logger.info(`[SYNC] driver_disconnected ride ${rideId}`);
};

/**
 * Chauffeur reconnecté — rassurer le client.
 */
const onDriverReconnected = (rideId, driverId, io) => {
  const target = io || _io;
  if (!target) return;

  const payload = {
    rideId,
    driverId,
    message:   'Votre chauffeur est de retour en ligne',
    timestamp: Date.now(),
  };

  target.to(`ride_${rideId}`).emit('driver_reconnected', payload);
  target.to('admin_room').emit('driver_reconnected', { ...payload, _source: 'admin_broadcast' });

  logger.info(`[SYNC] driver_reconnected ride ${rideId} driver ${driverId}`);
};

/**
 * Alerte SOS — notifier admin_room avec priorité haute.
 */
const onSosAlert = (rideId, userId, userRole, io) => {
  const target = io || _io;
  if (!target) return;
  target.to('admin_room').emit('sos_alert', {
    rideId, userId, userRole,
    priority:  'HIGH',
    timestamp: Date.now(),
  });
  logger.warn(`[SYNC] SOS alert ride ${rideId} par ${userId} (${userRole})`);
};

// Exposer _getIo() pour rideManager (évite d'exposer _io directement)
const getIo = () => _io;

module.exports = {
  init,
  getIo,
  onStatusChanged,
  onRideCreated,
  onDriverDisconnected,
  onDriverReconnected,
  onSosAlert,
};
