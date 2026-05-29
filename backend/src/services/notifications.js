const { Expo } = require('expo-server-sdk');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const expo = new Expo();

/**
 * Envoie une notification push via Expo et la sauvegarde en base
 */
const sendPushNotification = async (userId, { type, title, body, data = {} }) => {
  try {
    // Sauvegarder en base (historique)
    await prisma.notification.create({
      data: { userId, type, title, body, data, sentAt: new Date() }
    });

    // Récupérer le push token de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true }
    });

    if (!user?.pushToken || !Expo.isExpoPushToken(user.pushToken)) return;

    const message = {
      to: user.pushToken,
      sound: 'default',
      title,
      body,
      data: { ...data, notificationType: type },
      priority: type === 'ride_request' ? 'high' : 'normal',
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error('Push notification error:', err.message);
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
