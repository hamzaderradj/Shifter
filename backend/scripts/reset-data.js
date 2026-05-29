/**
 * Script de reset des données de test
 * Usage: node scripts/reset-data.js
 *
 * Ce script supprime TOUTES les courses et remet à zéro
 * les compteurs chauffeurs (gains, courses, note).
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Début du reset des données...\n');

  // 1. Supprimer les notes (dépendent des courses)
  const ratingsDeleted = await prisma.rating.deleteMany({});
  console.log(`✅ Notes supprimées : ${ratingsDeleted.count}`);

  // 2. Supprimer les OTP (nettoyage)
  const otpsDeleted = await prisma.oTPCode.deleteMany({});
  console.log(`✅ OTPs supprimés : ${otpsDeleted.count}`);

  // 3. Supprimer toutes les courses
  const ridesDeleted = await prisma.ride.deleteMany({});
  console.log(`✅ Courses supprimées : ${ridesDeleted.count}`);

  // 4. Remettre les compteurs chauffeurs à zéro
  const driversReset = await prisma.driver.updateMany({
    data: {
      totalEarnings: 0,
      totalRides: 0,
      rating: null,
      ratingCount: 0,
    },
  });
  console.log(`✅ Compteurs chauffeurs remis à zéro : ${driversReset.count} chauffeur(s)`);

  // 5. Remettre les chauffeurs en mode offline
  await prisma.driver.updateMany({
    data: { availability: 'offline' },
  });
  console.log('✅ Tous les chauffeurs passés en offline');

  console.log('\n🎉 Reset terminé ! Toutes les données de test ont été effacées.');
  console.log('   Les comptes clients et chauffeurs sont conservés.\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
