import React, { useEffect, useState } from 'react';
import { Bell, Send, Filter, RefreshCw } from 'lucide-react';
import { adminAPI } from '../services/api';
import { useAuthStore } from '../store/auth';

const TYPE_LABELS = {
  ride_request:   '🛵 Course demandée',
  ride_accepted:  '✅ Course acceptée',
  driver_arrived: '📍 Chauffeur arrivé',
  ride_started:   '🚀 Course démarrée',
  ride_completed: '🎉 Course terminée',
  ride_cancelled: '❌ Course annulée',
  account_approved: '✅ Compte approuvé',
  account_rejected: '❌ Compte refusé',
  system:         '📢 Système',
  promo:          '🎁 Promotion',
};

export default function NotificationsPage() {
  const { hasRole } = useAuthStore();
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [page, setPage]                   = useState(1);
  const [total, setTotal]                 = useState(0);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending]             = useState(false);
  const [form, setForm] = useState({ title: '', body: '', targetRole: 'all' });

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getNotifications({ page: p, limit: 50 });
      setNotifications(data.notifications || []);
      setStats(data.stats || []);
      setTotal(data.total || 0);
      setPage(p);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSend = async () => {
    if (!form.title || !form.body) return alert('Titre et message requis');
    setSending(true);
    try {
      const payload = { title: form.title, body: form.body };
      if (form.targetRole !== 'all') payload.targetRole = form.targetRole;
      const { data } = await adminAPI.sendNotification(payload);
      alert(`✅ Notification envoyée à ${data.sent} utilisateur(s)`);
      setShowSendModal(false);
      setForm({ title: '', body: '', targetRole: 'all' });
      load();
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || err.message));
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary">Notifications</h1>
          <p className="text-gray-500 text-sm mt-1">{total} notification(s) au total</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => load(page)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">
            <RefreshCw size={14} /> Actualiser
          </button>
          {hasRole('admin') && (
            <button onClick={() => setShowSendModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90">
              <Send size={14} /> Envoyer une notification
            </button>
          )}
        </div>
      </div>

      {/* Statistiques par type */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.slice(0, 8).map(s => (
          <div key={s.type} className="card text-center py-3">
            <p className="text-lg font-black text-secondary">{s._count?.id || 0}</p>
            <p className="text-xs text-gray-500 mt-1">{TYPE_LABELS[s.type] || s.type}</p>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Type</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Titre</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Destinataire</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
                ))
              ) : notifications.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-gray-400">Aucune notification</td></tr>
              ) : notifications.map(n => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full font-medium">{TYPE_LABELS[n.type] || n.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-secondary">{n.title}</p>
                    <p className="text-gray-500 text-xs">{n.body}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{n.user?.firstName} {n.user?.lastName}</p>
                    <p className="text-xs text-gray-400">{n.user?.phone} · {n.user?.role}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(n.createdAt).toLocaleDateString('fr')} {new Date(n.createdAt).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal envoi */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-black text-secondary mb-4">Envoyer une notification</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Titre</label>
                <input
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Maintenance prévue ce soir"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
                <textarea
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                  placeholder="Message envoyé aux utilisateurs…"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Destinataires</label>
                <select className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  value={form.targetRole} onChange={e => setForm({ ...form, targetRole: e.target.value })}>
                  <option value="all">Tous les utilisateurs</option>
                  <option value="client">Clients uniquement</option>
                  <option value="driver">Chauffeurs uniquement</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSendModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSend} disabled={sending} className="flex-1 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
