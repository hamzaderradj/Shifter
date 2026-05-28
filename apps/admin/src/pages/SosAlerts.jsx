import React, { useEffect, useState } from 'react';
import { AlertTriangle, Phone, MapPin, RefreshCw } from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function SosAlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getSosAlerts();
      setAlerts(data.alerts || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={24} /> Alertes SOS
          </h1>
          <p className="text-gray-500 text-sm mt-1">Actualisé toutes les 30 secondes</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="card text-center py-16">
          <AlertTriangle size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium">Aucune alerte SOS active</p>
          <p className="text-gray-400 text-sm mt-1">C'est une bonne nouvelle !</p>
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
                    {format(new Date(alert.updatedAt), 'dd MMM yyyy · HH:mm', { locale: fr })}
                  </span>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full
                  ${alert.status === 'completed' ? 'bg-green-100 text-green-700' :
                    alert.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'}`}>
                  {alert.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Client</p>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-red-200 flex items-center justify-center">
                      <span className="text-red-700 font-bold text-sm">{alert.client?.firstName?.[0]}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-secondary">{alert.client?.firstName} {alert.client?.lastName}</p>
                      <a href={`tel:${alert.client?.phone}`} className="flex items-center gap-1 text-primary text-xs hover:underline">
                        <Phone size={12} /> {alert.client?.phone}
                      </a>
                    </div>
                  </div>
                </div>

                {alert.driver && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Chauffeur</p>
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-orange-200 flex items-center justify-center">
                        <span className="text-orange-700 font-bold text-sm">{alert.driver?.user?.firstName?.[0]}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-secondary">{alert.driver?.user?.firstName} {alert.driver?.user?.lastName}</p>
                        <a href={`tel:${alert.driver?.user?.phone}`} className="flex items-center gap-1 text-primary text-xs hover:underline">
                          <Phone size={12} /> {alert.driver?.user?.phone}
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-3 space-y-1">
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-600"><span className="font-medium">Départ :</span> {alert.pickupAddress}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-600"><span className="font-medium">Destination :</span> {alert.dropoffAddress}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
