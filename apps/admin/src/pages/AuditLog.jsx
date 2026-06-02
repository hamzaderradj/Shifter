import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminAPI } from '../services/api';

const ACTION_LABELS = {
  force_cancel_ride:  { label: 'Annulation forcée course', color: 'bg-red-100 text-red-700' },
  cleanup_stuck_rides: { label: 'Nettoyage courses bloquées', color: 'bg-yellow-100 text-yellow-700' },
  set_admin_role:     { label: 'Changement de rôle', color: 'bg-purple-100 text-purple-700' },
  approve_driver:     { label: 'Chauffeur approuvé', color: 'bg-green-100 text-green-700' },
  reject_driver:      { label: 'Chauffeur refusé', color: 'bg-red-100 text-red-700' },
  suspend_driver:     { label: 'Chauffeur suspendu', color: 'bg-orange-100 text-orange-700' },
  suspend_user:       { label: 'Utilisateur suspendu', color: 'bg-orange-100 text-orange-700' },
};

export default function AuditLogPage() {
  const [logs, setLogs]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);
  const LIMIT = 50;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getAuditLog({ page: p, limit: LIMIT });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(p);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary flex items-center gap-2">
            <Shield size={24} className="text-primary" /> Journal d'audit
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} action(s) enregistrée(s)</p>
        </div>
        <button onClick={() => load(page)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Action</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Admin</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Cible</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">IP</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
                ))
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">
                  Aucune action enregistrée.<br />
                  <span className="text-xs">Les actions critiques apparaîtront ici automatiquement.</span>
                </td></tr>
              ) : logs.map((log, i) => {
                const meta = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${meta.color}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{log.first_name} {log.last_name}</p>
                      <p className="text-xs text-gray-400">{log.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-gray-500">{log.target_type} / {log.target_id?.slice(0, 8) || '—'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.ip}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleDateString('fr')} {new Date(log.created_at).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {page} / {pages}</p>
            <div className="flex gap-2">
              <button onClick={() => load(page - 1)} disabled={page === 1} className="p-2 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => load(page + 1)} disabled={page === pages} className="p-2 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
