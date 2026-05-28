import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, CheckCircle, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, FileText, Bike
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_BADGE = {
  pending: <span className="badge-pending">En attente</span>,
  approved: <span className="badge-approved">Approuvé</span>,
  rejected: <span className="badge-rejected">Rejeté</span>,
  suspended: <span className="badge-suspended">Suspendu</span>,
};

function RejectModal({ driver, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-lg text-secondary mb-2">Rejeter le dossier</h3>
        <p className="text-gray-500 text-sm mb-4">
          Chauffeur : <strong>{driver?.user?.firstName} {driver?.user?.lastName}</strong>
        </p>
        <textarea
          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-primary"
          rows={4}
          placeholder="Motif du rejet (sera envoyé au chauffeur)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={() => onConfirm(reason)} className="btn-danger flex-1" disabled={!reason.trim()}>
            Confirmer le rejet
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [rejectTarget, setRejectTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getDrivers({ status, search, page, limit: 15 });
      setDrivers(data.drivers);
      setPagination(data.pagination);
    } catch {} finally { setLoading(false); }
  }, [status, search, page]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await adminAPI.approveDriver(id);
      setDrivers(prev => prev.map(d => d.id === id ? { ...d, status: 'approved' } : d));
    } catch {} finally { setActionLoading(null); }
  };

  const handleReject = async (reason) => {
    setActionLoading(rejectTarget.id);
    try {
      await adminAPI.rejectDriver(rejectTarget.id, reason);
      setDrivers(prev => prev.map(d => d.id === rejectTarget.id ? { ...d, status: 'rejected', rejectionReason: reason } : d));
      setRejectTarget(null);
    } catch {} finally { setActionLoading(null); }
  };

  const handleSuspend = async (id) => {
    if (!confirm('Suspendre ce chauffeur ?')) return;
    setActionLoading(id);
    try {
      await adminAPI.suspendDriver(id);
      setDrivers(prev => prev.map(d => d.id === id ? { ...d, status: 'suspended' } : d));
    } catch {} finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary">Chauffeurs</h1>
          <p className="text-gray-500 text-sm mt-1">{pagination.total || 0} chauffeurs au total</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="card py-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary"
              placeholder="Rechercher par nom ou téléphone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvés</option>
            <option value="rejected">Rejetés</option>
            <option value="suspended">Suspendus</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Chauffeur', 'Téléphone', 'Véhicule', 'Note', 'Courses', 'Statut', 'Inscription', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : drivers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    <Bike size={40} className="mx-auto mb-3 opacity-30" />
                    <p>Aucun chauffeur trouvé</p>
                  </td>
                </tr>
              ) : drivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-bold text-sm">
                          {driver.user?.firstName?.[0] || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-secondary">
                          {driver.user?.firstName} {driver.user?.lastName}
                        </p>
                        <p className="text-xs text-gray-400">{driver.user?.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{driver.user?.phone}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-secondary">{driver.vehicleColor} {driver.vehicleMake} {driver.vehicleModel}</p>
                    <p className="text-xs text-gray-400">{driver.vehiclePlate}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1">
                      <span className="text-yellow-400">★</span>
                      <span className="font-semibold">{parseFloat(driver.rating).toFixed(1)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-secondary">{driver.totalRides}</td>
                  <td className="px-4 py-3">{STATUS_BADGE[driver.status]}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(driver.createdAt), 'dd MMM yyyy', { locale: fr })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {driver.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(driver.id)}
                            disabled={actionLoading === driver.id}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                            title="Approuver"
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button
                            onClick={() => setRejectTarget(driver)}
                            disabled={actionLoading === driver.id}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Rejeter"
                          >
                            <XCircle size={18} />
                          </button>
                        </>
                      )}
                      {driver.status === 'approved' && (
                        <button
                          onClick={() => handleSuspend(driver.id)}
                          disabled={actionLoading === driver.id}
                          className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                          title="Suspendre"
                        >
                          <AlertCircle size={18} />
                        </button>
                      )}
                      <button
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                        title="Documents"
                      >
                        <FileText size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Page {page} sur {pagination.pages} · {pagination.total} résultats
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {rejectTarget && (
        <RejectModal
          driver={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleReject}
        />
      )}
    </div>
  );
}
