const { Expo } = require('expo-server-sdk');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN, // optionnel mais recommandé en prod
  useFcmV1: true, // FCM v1 (HTTP v1 API, obligatoire après juin 2024)
});

/**
 * Envoie une notification push via Expo et la sauvegarde en base
 */
const sendPushNotification = async (userId, { type, title, body, data = {} }) => {
  try {
    // Sauvegarder en base (historique)
    await prisma.notification.create({
      data: { userId, type, title, body, data, sentAt: new Date() }
    }).catch(() => {}); // Ne pas bloquer l'envoi si la BDD échoue

    // Récupérer le push token de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true, firstName: true }
    });

    if (!user?.pushToken) {
      console.log(`[PUSH] Pas de token pour userId=${userId}`);
      return;
    }

    if (!Expo.isExpoPushToken(user.pushToken)) {
      console.warn(`[PUSH] Token invalide pour userId=${userId}: ${user.pushToken}`);
      // Nettoyer le token invalide
      await prisma.user.update({ where: { id: userId }, data: { pushToken: null } }).catch(() => {});
      return;
    }

    const message = {
      to: user.pushToken,
      sound: 'default',
      title,
      body,
      data: { ...data, notificationType: type },
      priority: type === 'ride_request' ? 'high' : 'normal',
      channelId: type === 'ride_request' ? 'ride-requests' : 'default',
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);

      // Vérifier les tickets pour détecter les erreurs
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          console.error(`[PUSH] Erreur ticket: ${ticket.message}`, ticket.details);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            // Token expiré → nettoyer
            await prisma.user.update({ where: { id: userId }, data: { pushToken: null } }).catch(() => {});
          }
        } else {
          console.log(`[PUSH] ✅ Envoyé à ${user.firstName} (${type}) - ticket: ${ticket.id}`);
        }
      }
    }
  } catch (err) {
    console.error('[PUSH] Erreur envoi:', err.message);
  }
};

// ── Notifications métier ──────────────────────────────────────
const notifyRideRequest = (driverId, rideId, clientName, pickup) =>
  sendPushNotification(driverId, {
    type: 'ride_request',
    title: '🛵 Nouvelle course !',
    body: `${clientName} vous demande depuis ${pickup}`,
    data: { rideId, action: 'ride_request' }
  });

const notifyRideAccepted = (clientId, rideId, driverName) =>
  sendPushNotification(clientId, {
    type: 'ride_accepted',
    title: '✅ Course acceptée !',
    body: `${driverName} est en route vers vous`,
    data: { rideId, action: 'ride_accepted' }
  });

const notifyDriverArrived = (clientId, rideId) =>
  sendPushNotification(clientId, {
    type: 'driver_arrived',
    title: '📍 Votre chauffeur est arrivé !',
    body: 'Votre moto-taxi vous attend',
    data: { rideId, action: 'driver_arrived' }
  });

const notifyRideStarted = (clientId, rideId) =>
  sendPushNotification(clientId, {
    type: 'ride_started',
    title: '🚀 Course démarrée',
    body: 'Bon voyage !',
    data: { rideId, action: 'ride_started' }
  });

const notifyRideCompleted = (clientId, rideId, price) =>
  sendPushNotification(clientId, {
    type: 'ride_completed',
    title: '🎉 Course terminée',
    body: `Montant : ${price} €. Notez votre chauffeur !`,
    data: { rideId, action: 'ride_completed' }
  });

const notifyRideCancelled = (userId, rideId, byDriver = false) =>
  sendPushNotification(userId, {
    type: 'ride_cancelled',
    title: '❌ Course annulée',
    body: byDriver ? 'Le chauffeur a annulé la course' : 'La course a été annulée',
    data: { rideId, action: 'ride_cancelled' }
  });

const notifyAccountApproved = (userId) =>
  sendPushNotification(userId, {
    type: 'account_approved',
    title: '✅ Compte approuvé !',
    body: 'Votre compte chauffeur a été validé. Vous pouvez démarrer !',
    data: { action: 'account_approved' }
  });

const notifyAccountRejected = (userId, reason) =>
  sendPushNotification(userId, {
    type: 'account_rejected',
    title: '❌ Compte non approuvé',
    body: reason || 'Vos documents nécessitent des corrections',
    data: { action: 'account_rejected' }
  });

module.exports = {
  sendPushNotification,
  notifyRideRequest, notifyRideAccepted, notifyDriverArrived,
  notifyRideStarted, notifyRideCompleted, notifyRideCancelled,
  notifyAccountApproved, notifyAccountRejected
};
