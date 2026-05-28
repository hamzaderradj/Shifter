import React, { useEffect, useState, useCallback } from 'react';
import { Search, UserCheck, UserX, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('client');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getUsers({ search, role, page, limit: 20 });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch {} finally { setLoading(false); }
  }, [search, role, page]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id) => {
    setToggling(id);
    try {
      const { data } = await adminAPI.toggleUser(id);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, isActive: data.user.isActive } : u));
    } catch {} finally { setToggling(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-secondary">Utilisateurs</h1>
        <p className="text-gray-500 text-sm mt-1">{pagination.total || 0} utilisateurs</p>
      </div>

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
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
          >
            <option value="client">Clients</option>
            <option value="driver">Chauffeurs</option>
            <option value="admin">Admins</option>
            <option value="">Tous les rôles</option>
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Utilisateur', 'Téléphone', 'Rôle', 'Courses', 'Vérifié', 'Statut', 'Inscription', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 animate-pulse rounded" /></td>
                  ))}</tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                  <Users size={40} className="mx-auto mb-3 opacity-30" /><p>Aucun utilisateur</p>
                </td></tr>
              ) : users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="font-bold text-gray-600 text-sm">{user.firstName?.[0] || '?'}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-secondary">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-gray-400">{user.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{user.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full
                      ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'driver' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-secondary">{user._count?.clientRides ?? 0}</td>
                  <td className="px-4 py-3">
                    {user.isVerified
                      ? <span className="text-green-600 text-xs font-semibold">✓ Oui</span>
                      : <span className="text-gray-400 text-xs">Non</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {user.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(user.createdAt), 'dd MMM yyyy', { locale: fr })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(user.id)}
                      disabled={toggling === user.id || user.role === 'admin'}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40
                        ${user.isActive ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                      title={user.isActive ? 'Désactiver' : 'Activer'}
                    >
                      {user.isActive ? <UserX size={18} /> : <UserCheck size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">Page {page} sur {pagination.pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
