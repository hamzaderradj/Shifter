import React, { useEffect, useState } from 'react';
import {
  Users, Bike, Car, TrendingUp, AlertCircle,
  Activity, Clock, DollarSign, Trash2
} from 'lucide-react';
import { adminAPI } from '../services/api';

const StatCard = ({ icon: Icon, label, value, sub, color = 'primary', loading }) => (
  <div className="card flex items-center gap-4">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0
      ${color === 'primary' ? 'bg-primary/10' : ''}
      ${color === 'success' ? 'bg-green-100' : ''}
      ${color === 'warning' ? 'bg-yellow-100' : ''}
      ${color === 'danger' ? 'bg-red-100' : ''}
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
      {loading ? (
        <div className="h-7 w-20 bg-gray-200 animate-pulse rounded mt-1" />
      ) : (
        <p className="text-2xl font-black text-secondary">{value?.toLocaleString() ?? '—'}</p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    adminAPI.getStats()
      .then(({ data }) => setStats(data.stats))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleReset = async () => {
    if (!window.confirm('⚠️ Supprimer TOUTES les courses et remettre les compteurs à zéro ? Cette action est irréversible.')) return;
    setResetting(true);
    try {
      const { data } = await adminAPI.resetTestData();
      alert(`✅ Reset effectué !\n${data.ridesDeleted} courses supprimées\n${data.driversReset} chauffeur(s) remis à zéro`);
      window.location.reload();
    } catch (err) {
      alert('❌ Erreur : ' + (err.response?.data?.message || err.message));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-secondary">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de la plateforme</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Clients" value={stats?.totalUsers} color="primary" loading={loading} />
        <StatCard icon={Bike} label="Chauffeurs" value={stats?.totalDrivers} color="success" loading={loading} />
        <StatCard icon={Car} label="Courses totales" value={stats?.totalRides} color="warning" loading={loading} />
        <StatCard icon={DollarSign} label="Revenus totaux" value={stats?.totalRevenue ? `${Math.round(stats.totalRevenue).toLocaleString()} €` : '0'} color="primary" loading={loading} />
      </div>

      {/* Today / Active */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Courses actives" value={stats?.activeRides} color="primary" loading={loading} sub="En ce moment" />
        <StatCard icon={Clock} label="Courses aujourd'hui" value={stats?.todayRides} color="success" loading={loading} />
        <StatCard icon={TrendingUp} label="Revenus aujourd'hui" value={stats?.todayRevenue ? `${Math.round(stats.todayRevenue).toLocaleString()} €` : '0'} color="warning" loading={loading} />
        <StatCard icon={AlertCircle} label="Chauffeurs en attente" value={stats?.pendingDrivers} color="danger" loading={loading} sub="À valider" />
      </div>

      {/* Zone dangereuse */}
      <div className="card border border-red-200 bg-red-50">
        <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
          <Trash2 size={18} /> Zone de développement — Reset des données
        </h3>
        <p className="text-sm text-red-600 mb-4">Supprime toutes les courses et remet les compteurs chauffeurs à zéro. Les comptes sont conservés.</p>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {resetting ? '⏳ Reset en cours…' : '🗑️ Supprimer toutes les données de test'}
        </button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
            <Bike size={18} className="text-primary" /> Actions rapides
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Valider les chauffeurs en attente', href: '/drivers?status=pending', badge: stats?.pendingDrivers },
              { label: 'Voir les alertes SOS actives', href: '/sos', danger: true },
              { label: 'Consulter les analytics', href: '/analytics' },
            ].map(item => (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors
                  ${item.danger ? 'border-red-200 hover:bg-red-50 text-red-700' : 'border-gray-200 hover:bg-gray-50 text-secondary'}`}
              >
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold text-secondary mb-4 flex items-center gap-2">
            <Activity size={18} className="text-primary" /> Statut plateforme
          </h3>
          <div className="space-y-3">
            {[
              { label: 'API Backend', status: 'online' },
              { label: 'Base de données', status: 'online' },
              { label: 'Socket temps réel', status: 'online' },
              { label: 'Notifications push', status: 'online' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Opérationnel
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
