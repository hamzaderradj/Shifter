/**
 * RIDE MANAGER — Gestionnaire du cycle de vie des courses
 *
 * Sources de vérité :
 *   - PostgreSQL/Supabase pour TOUT l'état métier (ride, driver, contacts)
 *   - Aucun état critique en mémoire
 *
 * Le seul état en mémoire est `responseTimers` (timers 30s pour la réponse
 * d'un chauffeur). Ces timers sont perdus au restart MAIS la réconciliation
 * au démarrage relance l'offer loop pour toutes les rides `searching` récentes.
 * La liste des chauffeurs déjà contactés est dans `rides.contacted_driver_ids`
 * (colonne TEXT[] PostgreSQL) — elle survit à tout crash à n'importe quel instant.
 *
 * Machine à états :
 *   searching → accepted → driver_en_route → arrived → in_progress → completed
 *       ↓           ↓             ↓              ↓           ↓
 *   cancelled    cancelled      cancelled     cancelled  cancelled (admin/system)
 */

const prisma          = require('../lib/prisma');
const logger          = require('./logger');
const rideSyncService = require('./rideSyncService');
const { validateTransition, getActorRole, isTerminal } = require('./rideStateMachine');
const { notifyRideRequest }                             = require('./notifications');

// ── Seul état en mémoire : timers de réponse (30s) ───────────
// Ces timers sont recréés par la réconciliation au restart.
// Ils n'ont aucune valeur métier au-delà de leur fenêtre de 30s.
const responseTimers = new Map();

const DRIVER_RESPONSE_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// TIMERS DE RÉPONSE
// ─────────────────────────────────────────────────────────────────────────────

const setResponseTimer = (rideId, driverId, io) => {
  clearResponseTimer(rideId);
  const timerId = setTimeout(async () => {
    logger.info(`[RIDE] Timeout réponse — driver ${driverId} pour ride ${rideId}`);
    await handleDriverRefusal(rideId, driverId, io);
  }, DRIVER_RESPONSE_TIMEOUT_MS);
  responseTimers.set(rideId, timerId);
};

const clearResponseTimer = (rideId) => {
  const timerId = responseTimers.get(rideId);
  if (timerId) { clearTimeout(timerId); responseTimers.delete(rideId); }
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFRE DE COURSE — source de vérité : PostgreSQL uniquement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envoyer une offre au prochain chauffeur disponible.
 *
 * La liste des chauffeurs déjà contactés est lue depuis `rides.contacted_driver_ids`
 * en base — jamais depuis la mémoire. Cette fonction est idempotente : elle peut
 * être appelée à tout moment après un restart sans risque de double-notification.
 *
 * Ordre des opérations :
 *   1. Lire ride + contacted_driver_ids depuis DB
 *   2. Trouver le prochain candidat non encore contacté
 *   3. Persister l'ID du driver dans contacted_driver_ids (AVANT la notification)
 *   4. Envoyer socket + push
 *   5. Démarrer le timer 30s
 *
 * L'étape 3 avant l'étape 4 garantit que même en cas de crash entre les deux,
 * le chauffeur n'est jamais recontacté inutilement après un restart.
 */
const offerRideToNextDriver = async (rideId, io) => {
  try {
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: { client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } } },
    });

    if (!ride || ride.status !== 'searching') {
      clearResponseTimer(rideId);
      return;
    }

    // ── Source de vérité DB — pas de mémoire ─────────────────────────────────
    const alreadyContacted = new Set(ride.contactedDriverIds || []);

    const nearbyDrivers = await prisma.$queryRaw`
      SELECT d.id AS driver_id, d.user_id
      FROM drivers d
      WHERE d.status = 'approved'
        AND d.availability = 'online'
        AND d.current_lat IS NOT NULL
        AND (6371 * acos(
          cos(radians(${parseFloat(ride.pickupLat)})) * cos(radians(d.current_lat)) *
          cos(radians(d.current_lng) - radians(${parseFloat(ride.pickupLng)})) +
          sin(radians(${parseFloat(ride.pickupLat)})) * sin(radians(d.current_lat))
        )) <= LEAST(COALESCE(d.search_radius, 5), 20)
      ORDER BY (6371 * acos(
        cos(radians(${parseFloat(ride.pickupLat)})) * cos(radians(d.current_lat)) *
        cos(radians(d.current_lng) - radians(${parseFloat(ride.pickupLng)})) +
        sin(radians(${parseFloat(ride.pickupLat)})) * sin(radians(d.current_lat))
      )) ASC
      LIMIT 10
    `;

    const candidates = nearbyDrivers.filter((d) => !alreadyContacted.has(d.driver_id));

    if (candidates.length === 0) {
      logger.info(`[RIDE] Aucun chauffeur disponible pour ride ${rideId} (${alreadyContacted.size} déjà contacté(s)) — annulation`);
      await cancelRide(rideId, 'Aucun chauffeur disponible dans votre zone', null, io);
      return;
    }

    const nextDriver = candidates[0];

    // ── Persister en DB AVANT d'envoyer la notification ───────────────────────
    // Garantit l'idempotence : si le process crashe entre l'écriture et l'envoi,
    // le driver apparaît contacté et ne sera pas recontacté après restart.
    // Ce comportement est correct : mieux vaut sauter un candidat que spammer.
    await prisma.ride.update({
      where: { id: rideId },
      data:  { contactedDriverIds: { push: nextDriver.driver_id } },
    });

    const clientName = `${ride.client.firstName || 'Client'} ${ride.client.lastName || ''}`.trim();

    // Socket.io
    const target = io || rideSyncService.getIo();
    if (target) {
      target.sendToUser(nextDriver.user_id, 'new_ride_request', {
        ride: {
          id:              ride.id,
          pickupAddress:   ride.pickupAddress,
          pickupLat:       parseFloat(ride.pickupLat),
          pickupLng:       parseFloat(ride.pickupLng),
          dropoffAddress:  ride.dropoffAddress,
          dropoffLat:      parseFloat(ride.dropoffLat),
          dropoffLng:      parseFloat(ride.dropoffLng),
          estimatedPrice:  parseFloat(ride.estimatedPrice),
          distanceKm:      parseFloat(ride.distanceKm),
          durationMinutes: ride.durationMinutes,
          paymentMethod:   ride.paymentMethod,
          client:          ride.client,
          createdAt:       ride.createdAt,
        },
      });
    }

    // Push notification
    notifyRideRequest(nextDriver.user_id, ride.id, clientName, ride.pickupAddress);

    // Timer de réponse (seul état en mémoire — non critique)
    setResponseTimer(rideId, nextDriver.driver_id, io);

    logger.info(`[RIDE] Offre envoyée — ride ${rideId} → driver ${nextDriver.driver_id} (${alreadyContacted.size + 1} tentative(s) total)`);
  } catch (err) {
    logger.error('[RIDE] offerRideToNextDriver error', { rideId, error: err.message });
  }
};

/**
 * Broadcast initial à la création d'une course.
 */
const broadcastNewRide = async (ride, io) => {
  rideSyncService.onRideCreated(ride, io);
  await offerRideToNextDriver(ride.id, io);
};

/**
 * Déclenche offerRideToNextDriver uniquement si aucun timer actif.
 * Utilisé par PUT /drivers/availability pour relancer les rides bloquées.
 */
const triggerOfferIfIdle = async (rideId, io) => {
  if (responseTimers.has(rideId)) return; // Candidat actif en attente
  await offerRideToNextDriver(rideId, io);
};

// ─────────────────────────────────────────────────────────────────────────────
// REFUS D'UNE COURSE
// ─────────────────────────────────────────────────────────────────────────────

const handleDriverRefusal = async (rideId, driverId, io) => {
  logger.info(`[RIDE] Driver ${driverId} a refusé ride ${rideId}`);
  clearResponseTimer(rideId);

  const target = io || rideSyncService.getIo();
  if (target) target.to(`ride_${rideId}`).emit('driver_declined', { rideId, timestamp: Date.now() });

  await offerRideToNextDriver(rideId, io);
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPTATION — transaction 100% atomique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acceptation atomique : ride.status + ride.driverId + driver.availability
 * dans UNE seule transaction Prisma.
 * Crash-safe : si le process meurt pendant la transaction, tout est rollbacké.
 */
const handleRideAccepted = async (rideId, driver, io) => {
  try {
    clearResponseTimer(rideId);

    const updatedRide = await prisma.$transaction(async (tx) => {
      // updateMany atomique : seul count=1 → empêche la double-acceptation
      const result = await tx.ride.updateMany({
        where: { id: rideId, status: 'searching' },
        data:  { driverId: driver.id, status: 'accepted', acceptedAt: new Date() },
      });

      if (result.count === 0) {
        const err = new Error('Course non disponible');
        err.code = 'RIDE_NOT_AVAILABLE';
        throw err; // → rollback driver.update ci-dessous
      }

      // driver.availability = 'busy' dans la même transaction
      await tx.driver.update({ where: { id: driver.id }, data: { availability: 'busy' } });

      return tx.ride.findUnique({
        where: { id: rideId },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
          driver: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        },
      });
    });

    const driverName = [updatedRide.driver?.user?.firstName || '', updatedRide.driver?.user?.lastName || ''].join(' ').trim();

    await rideSyncService.onStatusChanged({
      ride: updatedRide, newStatus: 'accepted', actorRole: 'driver',
      driverName, driverUserId: updatedRide.driver?.userId, io,
    });

    const target = io || rideSyncService.getIo();
    if (target) target.to(`ride_${rideId}`).emit('ride_no_longer_available', { rideId });

    logger.info(`[RIDE] Accepted: ride ${rideId} → driver ${driver.id}`);
    return { success: true, ride: updatedRide };
  } catch (err) {
    if (err.code === 'RIDE_NOT_AVAILABLE') return { success: false, code: 'RIDE_NOT_AVAILABLE' };
    logger.error('[RIDE] handleRideAccepted error', { rideId, error: err.message });
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHANGEMENT DE STATUT — machine à états stricte
// ─────────────────────────────────────────────────────────────────────────────

const updateRideStatus = async (rideId, newStatus, actor, reason, io) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { driver: { select: { id: true, userId: true } } },
  });

  if (!ride) return { success: false, code: 'NOT_FOUND' };

  const actorRole = getActorRole(actor, ride);
  const check     = validateTransition(ride.status, newStatus, actorRole);
  if (!check.valid) return { success: false, code: 'INVALID_TRANSITION', message: check.reason };

  const updateData = { status: newStatus };
  if (newStatus === 'in_progress') updateData.pickedUpAt  = new Date();
  if (newStatus === 'completed')   { updateData.completedAt = new Date(); updateData.finalPrice = ride.estimatedPrice; }
  if (newStatus === 'cancelled')   { updateData.cancelledAt = new Date(); updateData.cancelledBy = actor?.id || null; updateData.cancelReason = reason || null; }

  // Transaction atomique ride + driver (completed/cancelled)
  let updated;
  if (['completed', 'cancelled'].includes(newStatus) && ride.driver) {
    const driverUpdate = { availability: 'online' };
    if (newStatus === 'completed') {
      const price    = parseFloat(updateData.finalPrice || ride.estimatedPrice || 0);
      const earnings = price * (1 - (parseFloat(process.env.PLATFORM_COMMISSION) || 0.20));
      driverUpdate.totalRides    = { increment: 1 };
      driverUpdate.totalEarnings = { increment: Math.round(earnings * 100) / 100 };
    }
    const [updatedRide] = await prisma.$transaction([
      prisma.ride.update({ where: { id: rideId }, data: updateData, include: { driver: { select: { id: true, userId: true } } } }),
      prisma.driver.update({ where: { id: ride.driver.id }, data: driverUpdate }),
    ]);
    updated = updatedRide;
  } else {
    updated = await prisma.ride.update({ where: { id: rideId }, data: updateData, include: { driver: { select: { id: true, userId: true } } } });
  }

  await rideSyncService.onStatusChanged({ ride: updated, newStatus, actorRole, reason, driverUserId: ride.driver?.userId, io });

  logger.info(`[RIDE] Status: ride ${rideId} ${ride.status} → ${newStatus} (${actorRole})`);
  return { success: true, ride: updated };
};

// ─────────────────────────────────────────────────────────────────────────────
// ANNULATION SYSTÈME
// ─────────────────────────────────────────────────────────────────────────────

const cancelRide = async (rideId, reason, cancelledById, io) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { driver: { select: { id: true, userId: true } } },
  });

  if (!ride || isTerminal(ride.status)) {
    logger.info(`[RIDE] cancelRide ignoré: ${rideId} est ${ride?.status || 'introuvable'}`);
    return;
  }

  await prisma.ride.update({
    where: { id: rideId },
    data:  { status: 'cancelled', cancelledAt: new Date(), cancelledBy: cancelledById || null, cancelReason: reason },
  });

  if (ride.driver) {
    await prisma.driver.update({ where: { id: ride.driver.id }, data: { availability: 'online' } }).catch(() => {});
  }

  await rideSyncService.onStatusChanged({
    ride: { ...ride, status: 'cancelled' }, newStatus: 'cancelled',
    actorRole: 'system', reason, driverUserId: ride.driver?.userId, io,
  });

  clearResponseTimer(rideId);
  logger.info(`[RIDE] Cancelled: ${rideId} — ${reason}`);
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  updateRideStatus,
  handleRideAccepted,
  handleDriverRefusal,
  cancelRide,
  broadcastNewRide,
  offerRideToNextDriver,
  triggerOfferIfIdle,
  clearResponseTimer,
  validateTransition,
};
