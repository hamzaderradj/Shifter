import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, CheckCircle, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, FileText, Bike, X,
  ExternalLink, Car, Phone, Star, Calendar
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_BADGE = {
  pending:   <span className="badge-pending">En attente</span>,
  approved:  <span className="badge-approved">Approuvé</span>,
  rejected:  <span className="badge-rejected">Rejeté</span>,
  suspended: <span className="badge-suspended">Suspendu</span>,
};

const DOC_LABELS = {
  permis:       "Permis de conduire",
  cni:          "Carte d'identité",
  assurance:    "Assurance véhicule",
  carte_grise:  "Carte grise",
  photo:        "Photo de profil",
};

// ── Modal documents ──────────────────────────────────────────────
function DocumentsModal({ driver, onClose, onApprove, onReject, actionLoading }) {
  const docs = driver.documents || [];
  const [preview, setPreview] = useState(null);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-lg text-secondary">
              Dossier — {driver.user?.firstName} {driver.user?.lastName}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Phone size={13}/> {driver.user?.phone}</span>
              <span className="flex items-center gap-1"><Car size={13}/> {driver.vehicleMake} {driver.vehicleModel} · {driver.vehiclePlate}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-3 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Courses</p>
            <p className="text-xl font-black text-secondary">{driver.totalRides ?? 0}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Note</p>
            <p className="text-xl font-black text-secondary flex items-center justify-center gap-1">
              <Star size={16} className="text-yellow-400 fill-yellow-400" />
              {parseFloat(driver.rating || 0).toFixed(1)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Inscription</p>
            <p className="text-sm font-bold text-secondary">
              {format(new Date(driver.createdAt), 'dd MMM yyyy', { locale: fr })}
            </p>
          </div>
        </div>

        {/* Documents */}
        <div className="flex-1 overflow-y-auto p-6">
          {docs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p>Aucun document uploadé</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {docs.map((doc) => (
                <div key={doc.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">
                      {DOC_LABELS[doc.type] || doc.type}
                    </span>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-dark"
                      title="Ouvrir dans un nouvel onglet"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  {doc.url?.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                    <img
                      src={doc.url}
                      alt={doc.type}
                      className="w-full h-36 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setPreview(doc.url)}
                    />
                  ) : (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center h-36 bg-gray-100 hover:bg-gray-200 transition-colors gap-2 text-gray-500"
                    >
                      <FileText size={28} />
                      <span className="text-sm font-medium">Voir le document</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {driver.status === 'pending' && (
          <div className="flex gap-3 p-6 border-t border-gray-100">
            <button
              onClick={() => onReject(driver)}
              disabled={!!actionLoading}
              className="btn-danger flex-1 flex items-center justify-center gap-2"
            >
              <XCircle size={16} /> Rejeter
            </button>
            <button
              onClick={() => onApprove(driver.id)}
              disabled={!!actionLoading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> {actionLoading ? 'Validation…' : 'Approuver'}
            </button>
          </div>
        )}
        {driver.status === 'approved' && (
          <div className="p-6 border-t border-gray-100">
            <button
              onClick={() => onReject(driver)}
              disabled={!!actionLoading}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-yellow-600 hover:bg-yellow-50 border border-yellow-200"
            >
              <AlertCircle size={16} /> Suspendre ce chauffeur
            </button>
          </div>
        )}
      </div>

      {/* Lightbox preview image */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60]"
          onClick={() => setPreview(null)}
        >
          <img src={preview} alt="preview" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl" />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80"
            onClick={() => setPreview(null)}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Modal rejet ──────────────────────────────────────────────────
function RejectModal({ driver, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-lg text-secondary mb-2">
          {driver?.status === 'approved' ? 'Suspendre le chauffeur' : 'Rejeter le dossier'}
        </h3>
        <p className="text-gray-500 text-sm mb-4">
          Chauffeur : <strong>{driver?.user?.firstName} {driver?.user?.lastName}</strong>
        </p>
        <textarea
          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-primary"
          rows={4}
          placeholder="Motif (sera communiqué au chauffeur)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={() => onConfirm(reason)}
            className="btn-danger flex-1"
            disabled={!reason.trim()}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────
export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [docsTarget, setDocsTarget] = useState(null);
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
      if (docsTarget?.id === id) setDocsTarget(prev => ({ ...prev, status: 'approved' }));
    } catch {} finally { setActionLoading(null); }
  };

  const handleReject = async (reason) => {
    const target = rejectTarget;
    setActionLoading(target.id);
    try {
      if (target.status === 'approved') {
        await adminAPI.suspendDriver(target.id);
        setDrivers(prev => prev.map(d => d.id === target.id ? { ...d, status: 'suspended' } : d));
      } else {
        await adminAPI.rejectDriver(target.id, reason);
        setDrivers(prev => prev.map(d => d.id === target.id ? { ...d, status: 'rejected' } : d));
      }
      setRejectTarget(null);
      setDocsTarget(null);
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
                        <p className="text-xs text-gray-400">{driver.user?.email || driver.user?.phone}</p>
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
                      <Star size={13} className="text-yellow-400 fill-yellow-400" />
                      <span className="font-semibold">{parseFloat(driver.rating || 0).toFixed(1)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-secondary">{driver.totalRides ?? 0}</td>
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
                          onClick={() => setRejectTarget(driver)}
                          disabled={actionLoading === driver.id}
                          className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                          title="Suspendre"
                        >
                          <AlertCircle size={18} />
                        </button>
                      )}
                      {/* Bouton documents — ouvre le modal */}
                      <button
                        onClick={() => setDocsTarget(driver)}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-primary transition-colors"
                        title="Voir les documents"
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

      {/* Modal documents */}
      {docsTarget && (
        <DocumentsModal
          driver={docsTarget}
          onClose={() => setDocsTarget(null)}
          onApprove={handleApprove}
          onReject={(driver) => { setRejectTarget(driver); }}
          actionLoading={actionLoading}
        />
      )}

      {/* Modal rejet/suspension */}
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
