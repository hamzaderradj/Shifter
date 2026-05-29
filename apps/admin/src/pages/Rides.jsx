import React, { useEffect, useState, useCallback } from 'react';
import { Car, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_LABELS = {
  searching: { label: 'Recherche', color: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Acceptée', color: 'bg-blue-100 text-blue-700' },
  driver_en_route: { label: 'En route', color: 'bg-blue-100 text-blue-700' },
  arrived: { label: 'Arrivé', color: 'bg-indigo-100 text-indigo-700' },
  in_progress: { label: 'En cours', color: 'bg-orange-100 text-orange-700' },
  completed: { label: 'Terminée', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-700' },
};

export default function RidesPage() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getRides({ status, page, limit: 20 });
      setRides(data.rides);
      setPagination(data.pagination);
    } catch {} finally { setLoading(false); }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-secondary">Courses</h1>
        <p className="text-gray-500 text-sm mt-1">{pagination.total || 0} courses au total</p>
      </div>

      <div className="card py-4">
        <select
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['#', 'Client', 'Chauffeur', 'Départ', 'Arrivée', 'Distance', 'Prix', 'Statut', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 animate-pulse rounded" /></td>
                  ))}</tr>
                ))
              ) : rides.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                  <Car size={40} className="mx-auto mb-3 opacity-30" /><p>Aucune course</p>
                </td></tr>
              ) : rides.map((ride, i) => {
                const s = STATUS_LABELS[ride.status] || { label: ride.status, color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={ride.id} className={`hover:bg-gray-50 transition-colors ${ride.isSos ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{String(i + 1 + (page - 1) * 20).padStart(4, '0')}</td>
                    <td className="px-4 py-3 font-medium text-secondary">
                      {ride.client?.firstName} {ride.client?.lastName}
                      <div className="text-xs text-gray-400 font-normal">{ride.client?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {ride.driver ? `${ride.driver.user?.firstName} ${ride.driver.user?.lastName}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[150px] truncate">{ride.pickupAddress}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[150px] truncate">{ride.dropoffAddress}</td>
                    <td className="px-4 py-3 text-gray-600">{ride.distanceKm ? `${parseFloat(ride.distanceKm).toFixed(1)} km` : '—'}</td>
                    <td className="px-4 py-3 font-semibold text-secondary">
                      {ride.finalPrice ? `${parseFloat(ride.finalPrice).toLocaleString()} €` : ride.estimatedPrice ? `~${parseFloat(ride.estimatedPrice).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.color}`}>{s.label}</span>
                      {ride.isSos && <span className="ml-1 text-xs font-bold text-red-600">🆘</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {format(new Date(ride.createdAt), 'dd MMM · HH:mm', { locale: fr })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {page} sur {pagination.pages} · {pagination.total} courses</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
