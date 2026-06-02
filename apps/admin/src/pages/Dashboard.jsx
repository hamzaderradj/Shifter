import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, Bike, Car, TrendingUp, AlertCircle, Activity,
  Clock, DollarSign, RefreshCw, AlertTriangle, CheckCircle,
  XCircle, Wifi, Database, Bell, Map, CloudLightning
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { useAuthStore } from '../store/auth';

const StatCard = ({ icon: Icon, label, value, sub, color = 'primary', loading, onClick }) => (
  <div className={`card flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={onClick}>
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0
      ${color === 'primary' ? 'bg-primary/10' : ''}
      ${color === 'success' ? 'bg-green-100' : ''}
      ${color === 'warning' ? 'bg-yellow-100' : ''}
      ${color === 'danger'  ? 'bg-red-100'    : ''}
    `}>
      <Icon size={26} className={
        color === 'primary' ? 'text-primary' :
        color === 'success' ? 'text-green-600' :
        color === 'warning' ? 'text-yellow-600' :
        'text-red-600'
      } />
    </div>
    <div>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      {loading
        ? <div className="h-7 w-20 bg-gray-200 animate-pulse rounded mt-1" />
        : <p className="text-2xl font-black text-secondary">{value ?? '—'}</p>
      }
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const ServiceStatus = ({ label, status, detail }) => {
  const icons = { ok: CheckCircle, warning: AlertTriangle, error: XCircle, degraded: AlertTriangle };
  const colors = { ok: 'text-green-600', warning: 'text-yellow-600', error: 'text-red-600', degraded: 'text-orange-600' };
  const bg = { ok: 'bg-green-50', warning: 'bg-yellow-50', error: 'bg-red-50', degraded: 'bg-orange-50' };
  const Icon = icons[status] || CheckCircle;

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl ${bg[status] || 'bg-gray-50'}`}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-xs text-gray-500">{detail}</span>}
        <Icon size={16} className={colors[status] || 'text-green-600'} />
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const { adminRole, hasRole } = useAuthStore();
  const [stats,   setStats]   = useState(null);
  const [health,  setHealth]  = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [cleaning, setCleaning] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h, m] = await Promise.allSettled([
        adminAPI.getStats(),
        adminAPI.getHealth(),
        adminAPI.getMetrics(),
      ]);
      if (s.status === 'fulfilled') setStats(s.value.data.stats);
      if (h.status === 'fulfilled') setHealth(h.value.data);
      if (m.status === 'fulfilled') setMetrics(m.value.data.metrics);
      setLastRefresh(new Date());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAll();
    // Auto-refresh toutes les 30 secondes
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const handleCleanupStuck = async () => {
    if (!window.confirm(`Annuler automatiquement toutes les courses bloquées depuis > 15 min ?`)) return;
    setCleaning(true);
    try {
      const { data } = await adminAPI.cleanupStuck();
      alert(`✅ ${data.cancelled} course(s) bloquée(s) annulée(s).`);
      loadAll();
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || err.message));
    } finally { setCleaning(false); }
  };

  const roleColors = {
    superadmin: 'bg-purple-100 text-purple-800',
    admin:      'bg-blue-100 text-blue-800',
    operations: 'bg-green-100 text-green-800',
    finance:    'bg-yellow-100 text-yellow-800',
    support:    'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Vue d'ensemble · {lastRefresh ? `Mis à jour ${lastRefresh.toLocaleTimeString('fr')}` : '…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${roleColors[adminRole] || roleColors.admin}`}>
            {adminRole?.toUpperCase()}
          </span>
          <button
            onClick={loadAll}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-primary' : 'text-gray-500'} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Alerte courses bloquées */}
      {metrics?.stuckRides?.count > 0 && (
        <div className="card border border-yellow-200 bg-yellow-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-yellow-600" />
            <div>
              <p className="font-bold text-yellow-800">
                {metrics.stuckRides.count} course(s) bloquée(s) en recherche depuis + de 15 min
              </p>
              <p className="text-sm text-yellow-700">Ces courses n'ont pas trouvé de chauffeur.</p>
            </div>
          </div>
          {hasRole('operations') && (
            <button
              onClick={handleCleanupStuck}
              disabled={cleaning}
              className="px-4 py-2 bg-yellow-600 text-white text-sm font-bold rounded-xl hover:bg-yellow-700 transition-colors disabled:opacity-50"
            >
              {cleaning ? 'Nettoyage…' : 'Annuler toutes'}
            </button>
          )}
        </div>
      )}

      {/* Stats KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}      label="Clients"           value={stats?.totalUsers?.toLocaleString()}       color="primary"  loading={loading} />
        <StatCard icon={Bike}       label="Chauffeurs"        value={stats?.totalDrivers?.toLocaleString()}     color="success"  loading={loading} />
        <StatCard icon={Car}        label="Courses totales"   value={stats?.totalRides?.toLocaleString()}       color="warning"  loading={loading} />
        <StatCard icon={DollarSign} label="Revenus totaux"    value={stats?.totalRevenue ? `${Math.round(stats.totalRevenue).toLocaleString()} €` : '0 €'} color="primary" loading={loading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity}    label="Courses actives"     value={stats?.activeRides}     color="primary" loading={loading} sub="En ce moment" />
        <StatCard icon={Clock}       label="Courses aujourd'hui" value={stats?.todayRides}       color="success" loading={loading} />
        <StatCard icon={TrendingUp}  label="Revenus aujourd'hui" value={stats?.todayRevenue ? `${Math.round(stats.todayRevenue).toLocaleString()} €` : '0 €'} color="warning" loading={loading} />
        <StatCard icon={AlertCircle} label="Dossiers en attente" value={stats?.pendingDrivers}  color="danger"  loading={loading} sub="À valider" />
      </div>

      {/* Métriques avancées */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Inscriptions aujourd\'hui', value: metrics.todaySignups,        icon: Users },
            { label: 'Prix moyen course',          value: `${metrics.avgRidePrice} €`, icon: DollarSign },
            { label: 'Taux annulation 7j',          value: metrics.cancellationRate7d,  icon: XCircle },
            { label: 'Docs en attente',             value: metrics.pendingDocuments,    icon: AlertCircle },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="card text-center">
              <Icon size={20} className="text-primary mx-auto mb-2" />
              <p className="text-xl font-black text-secondary">{value ?? '—'}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Santé plateforme (temps réel) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
            <Wifi size={18} className="text-primary" />
            Santé des services
            {health && (
              <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                health.overall === 'ok' ? 'bg-green-100 text-green-700' :
                health.overall === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {health.overall === 'ok' ? '✓ Tous les services OK' :
                 health.overall === 'warning' ? '⚠ Avertissements' : '✗ Problème détecté'}
              </span>
            )}
          </h3>
          {loading && !health ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-xl" />)}</div>
          ) : (
            <div className="space-y-2">
              <ServiceStatus label="Base de données"    status={health?.services?.database?.status || 'ok'}        detail={health?.services?.database?.latencyMs ? `${health.services.database.latencyMs}ms` : ''} />
              <ServiceStatus label="Google Maps API"    status={health?.services?.googleMaps?.status || 'ok'}      detail={health?.services?.googleMaps?.googleStatus} />
              <ServiceStatus label="Supabase Storage"   status={health?.services?.supabaseStorage?.status || 'ok'} />
              <ServiceStatus
                label={`Chauffeurs en ligne (${health?.services?.driversOnline?.count ?? '?'})`}
                status={health?.services?.driversOnline?.status || 'ok'}
              />
              <ServiceStatus
                label={`Courses bloquées (${health?.services?.stuckRides?.count ?? 0})`}
                status={health?.services?.stuckRides?.status || 'ok'}
              />
            </div>
          )}
          {health && <p className="text-xs text-gray-400 mt-3">Uptime : {Math.round((health.uptime || 0) / 3600)}h {Math.round(((health.uptime || 0) % 3600) / 60)}min</p>}
        </div>

        <div className="card">
          <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
            <Activity size={18} className="text-primary" /> Actions rapides
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Valider les dossiers chauffeurs en attente', href: '/drivers?status=pending', badge: stats?.pendingDrivers, color: '' },
              { label: 'Gérer les alertes SOS actives',              href: '/sos',          danger: true },
              { label: 'Voir les notifications envoyées',             href: '/notifications'            },
              { label: 'Consulter le journal d\'audit',              href: '/audit',         needsRole: 'admin' },
              { label: 'Analytics & statistiques',                   href: '/analytics'                },
            ].filter(item => !item.needsRole || hasRole(item.needsRole)).map(item => (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors
                  ${item.danger ? 'border-red-200 hover:bg-red-50 text-red-700' : 'border-gray-200 hover:bg-gray-50 text-secondary'}`}
              >
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{item.badge}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Zone dangereuse — super admin seulement */}
      {hasRole('superadmin') && (
        <div className="card border border-red-200 bg-red-50">
          <h3 className="font-bold text-red-700 mb-2 flex items-center gap-2">
            <AlertTriangle size={18} /> Zone Super Administrateur — Reset des données
          </h3>
          <p className="text-sm text-red-600 mb-4">Supprime toutes les courses. Uniquement en développement.</p>
          <button
            onClick={async () => {
              if (!window.confirm('⚠️ SUPPRESSION IRRÉVERSIBLE de toutes les courses. Confirmer ?')) return;
              if (!window.confirm('Dernière confirmation — cette action est irréversible.')) return;
              try {
                const { data } = await adminAPI.resetTestData();
                alert(`✅ ${data.ridesDeleted} courses supprimées`);
                loadAll();
              } catch (err) {
                alert('❌ ' + (err.response?.data?.message || err.message));
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm"
          >
            🗑️ Supprimer toutes les données de test
          </button>
        </div>
      )}
    </div>
  );
}
