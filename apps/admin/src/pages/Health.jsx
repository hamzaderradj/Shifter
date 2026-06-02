import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Wifi, Database, Map, Bell, Cloud } from 'lucide-react';
import { adminAPI } from '../services/api';

const STATUS_ICON = { ok: CheckCircle, warning: AlertTriangle, error: XCircle, degraded: AlertTriangle };
const STATUS_COLOR = { ok: 'text-green-600', warning: 'text-yellow-600', error: 'text-red-600', degraded: 'text-orange-600' };
const STATUS_BG    = { ok: 'bg-green-50 border-green-200', warning: 'bg-yellow-50 border-yellow-200', error: 'bg-red-50 border-red-200', degraded: 'bg-orange-50 border-orange-200' };
const STATUS_LABEL = { ok: 'Opérationnel', warning: 'Avertissement', error: 'Erreur', degraded: 'Dégradé' };

function ServiceCard({ name, icon: Icon, status, details = [] }) {
  const StatusIcon = STATUS_ICON[status] || CheckCircle;
  return (
    <div className={`card border ${STATUS_BG[status] || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Icon size={20} className={STATUS_COLOR[status] || 'text-gray-500'} />
          <span className="font-bold text-secondary">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon size={16} className={STATUS_COLOR[status]} />
          <span className={`text-xs font-semibold ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
      </div>
      {details.length > 0 && (
        <div className="space-y-1">
          {details.map(({ label, value }) => (
            <div key={label} className="flex justify-between text-xs text-gray-600">
              <span>{label}</span>
              <span className="font-mono font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HealthPage() {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState(null);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getHealth();
      setHealth(data);
      setLastCheck(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 60000); // vérification toutes les 60s
    return () => clearInterval(t);
  }, [check]);

  const s = health?.services || {};
  const uptime = health?.uptime || 0;
  const uptimeH = Math.floor(uptime / 3600);
  const uptimeM = Math.floor((uptime % 3600) / 60);

  const overall = health?.overall;
  const overallBg = { ok: 'bg-green-600', warning: 'bg-yellow-500', degraded: 'bg-orange-500', error: 'bg-red-600' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary">Santé de la plateforme</h1>
          {lastCheck && <p className="text-sm text-gray-500 mt-1">Dernière vérification : {lastCheck.toLocaleTimeString('fr')}</p>}
        </div>
        <button
          onClick={check}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin text-primary' : 'text-gray-500'} />
          Vérifier maintenant
        </button>
      </div>

      {/* Statut global */}
      <div className={`rounded-2xl p-5 text-white ${overallBg[overall] || 'bg-gray-500'}`}>
        <div className="flex items-center gap-3">
          {overall === 'ok'
            ? <CheckCircle size={32} />
            : overall === 'warning' ? <AlertTriangle size={32} />
            : <XCircle size={32} />
          }
          <div>
            <p className="text-xl font-black">
              {overall === 'ok' ? 'Tous les services sont opérationnels' :
               overall === 'warning' ? 'Des avertissements détectés' :
               'Des services sont en erreur'}
            </p>
            <p className="text-white/80 text-sm mt-0.5">
              Uptime : {uptimeH}h {uptimeM}min · Vérifié le {lastCheck?.toLocaleDateString('fr')} à {lastCheck?.toLocaleTimeString('fr')}
            </p>
          </div>
        </div>
      </div>

      {/* Grille services */}
      {loading && !health ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4,5].map(i => <div key={i} className="h-28 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ServiceCard
            name="Base de données (Supabase)"
            icon={Database}
            status={s.database?.status || 'ok'}
            details={[
              { label: 'Latence', value: s.database?.latencyMs ? `${s.database.latencyMs}ms` : 'N/A' },
            ]}
          />
          <ServiceCard
            name="Google Maps API"
            icon={Map}
            status={s.googleMaps?.status || 'ok'}
            details={[
              { label: 'Statut Google', value: s.googleMaps?.googleStatus || 'N/A' },
            ]}
          />
          <ServiceCard
            name="Supabase Storage"
            icon={Cloud}
            status={s.supabaseStorage?.status || 'ok'}
            details={[]}
          />
          <ServiceCard
            name="Chauffeurs en ligne"
            icon={Wifi}
            status={s.driversOnline?.status || 'ok'}
            details={[
              { label: 'Nombre en ligne', value: s.driversOnline?.count ?? 0 },
            ]}
          />
          <ServiceCard
            name="Courses bloquées"
            icon={AlertTriangle}
            status={s.stuckRides?.status || 'ok'}
            details={[
              { label: 'Courses > 15 min en recherche', value: s.stuckRides?.count ?? 0 },
            ]}
          />
        </div>
      )}
    </div>
  );
}
