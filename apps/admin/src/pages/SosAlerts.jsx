import React, { useEffect, useState } from 'react';
import { AlertTriangle, Phone, MapPin, RefreshCw, CheckCircle } from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function SosAlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getSosAlerts(showResolved);
      setAlerts(data.alerts || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [showResolved]);

  const resolve = async (id) => {
    try {
      await adminAPI.resolveSos(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={24} /> Alertes SOS
          </h1>
          <p className="text-gray-500 text-sm mt-1">Actualisé toutes les 30 secondes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResolved(v => !v)}
            className={`text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${showResolved ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {showResolved ? 'Résolues' : 'Actives'}
          </button>
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="card text-center py-16">
          <AlertTriangle size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium">Aucune alerte SOS {showResolved ? 'résolue' : 'active'}</p>
          {!showResolved && <p className="text-gray-400 text-sm mt-1">C'est une bonne nouvelle !</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map(alert => (
            <div key={alert.id} className="card border-l-4 border-l-red-500 bg-red-50 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    🆘 ALERTE SOS
                  </span>
                  <span className="text-xs text-gray-500">
                    {format(new Date(alert.createdAt), 'dd MMM yyyy · HH:mm', { locale: fr })}
                  </span>
                </div>
                {!alert.resolved && (
                  <button
                    onClick={() => resolve(alert.id)}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <CheckCircle size={14} /> Résoudre
                  </button>
                )}
              </div>

              {/* Infos client */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Client</p>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-red-200 flex items-center justify-center">
                    <span className="text-red-700 font-bold text-sm">{alert.user?.firstName?.[0] || '?'}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-secondary">{alert.user?.firstName} {alert.user?.lastName}</p>
                    <a href={`tel:${alert.user?.phone}`} className="flex items-center gap-1 text-primary text-xs hover:underline">
                      <Phone size={12} /> {alert.user?.phone}
                    </a>
                  </div>
                </div>
              </div>

              {/* Position GPS */}
              {alert.lat && alert.lng && (
                <a
                  href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 bg-white rounded-xl p-3 hover:bg-gray-50 transition-colors"
                >
                  <MapPin size={16} className="text-red-500 flex-shrink-0" />
                  <span className="text-sm text-primary font-medium underline">
                    Voir la position GPS ({parseFloat(alert.lat).toFixed(5)}, {parseFloat(alert.lng).toFixed(5)})
                  </span>
                </a>
              )}

              {/* Course associée */}
              {alert.ride && (
                <div className="bg-white rounded-xl p-3 space-y-1">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Course associée</p>
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-600"><span className="font-medium">Départ :</span> {alert.ride.pickupAddress}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-600"><span className="font-medium">Destination :</span> {alert.ride.dropoffAddress}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
