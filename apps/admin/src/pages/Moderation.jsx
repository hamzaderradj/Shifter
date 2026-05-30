import React, { useEffect, useState } from 'react';
import {
  ShieldAlert, Star, RefreshCw, CheckCircle, XCircle,
  UserX, ChevronDown, ChevronUp, AlertTriangle, Phone
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const REASON_LABELS = {
  inappropriate_behavior: 'Comportement inapproprié',
  fraud: 'Fraude',
  safety_concern: 'Problème de sécurité',
  bad_rating: 'Avis injustifié',
  other: 'Autre',
};

const STATUS_CONFIG = {
  pending:      { label: 'En attente',     bg: 'bg-yellow-100', text: 'text-yellow-700' },
  reviewed:     { label: 'Examiné',        bg: 'bg-blue-100',   text: 'text-blue-700'   },
  dismissed:    { label: 'Classé sans suite', bg: 'bg-gray-100', text: 'text-gray-600' },
  action_taken: { label: 'Action prise',   bg: 'bg-green-100',  text: 'text-green-700'  },
};

// ── Composant Card Signalement ──────────────────────────────────
function ReportCard({ report, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(report.adminNote || '');
  const [loading, setLoading] = useState(false);

  const handleAction = async (status) => {
    setLoading(true);
    try {
      await onUpdate(report.id, { status, adminNote: note });
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (userId) => {
    if (!window.confirm('Suspendre cet utilisateur ?')) return;
    setLoading(true);
    try {
      await adminAPI.suspendUser(userId, true);
      await onUpdate(report.id, { status: 'action_taken', adminNote: note || 'Utilisateur suspendu' });
    } finally {
      setLoading(false);
    }
  };

  const st = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Infos principales */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${st.bg} ${st.text}`}>
                {st.label}
              </span>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                {REASON_LABELS[report.reason] || report.reason}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="text-sm">
                <p className="text-gray-400 text-xs uppercase font-semibold mb-1">Signalé par</p>
                <p className="font-semibold text-gray-800">
                  {report.reporter.firstName} {report.reporter.lastName}
                </p>
                <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                  <Phone size={10} /> {report.reporter.phone}
                </p>
                <span className="text-xs text-gray-400">{report.reporter.role === 'client' ? 'Client' : 'Chauffeur'}</span>
              </div>
              <div className="text-sm">
                <p className="text-gray-400 text-xs uppercase font-semibold mb-1">Personne signalée</p>
                <p className="font-semibold text-gray-800">
                  {report.reportedUser.firstName} {report.reportedUser.lastName}
                </p>
                <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                  <Phone size={10} /> {report.reportedUser.phone}
                </p>
                <span className="text-xs text-gray-400">{report.reportedUser.role === 'client' ? 'Client' : 'Chauffeur'}</span>
              </div>
            </div>

            {report.description && (
              <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm text-gray-600 italic">
                "{report.description}"
              </div>
            )}

            {report.ride && (
              <div className="mt-2 text-xs text-gray-400">
                Course : {report.ride.pickupAddress?.split(',')[0]} → {report.ride.dropoffAddress?.split(',')[0]}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-2">
              {format(new Date(report.createdAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
            </p>
          </div>

          <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Zone actions (expandable) */}
        {expanded && (
          <div className="mt-4 border-t pt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Note admin</label>
              <textarea
                className="w-full mt-1 p-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={2}
                placeholder="Note interne..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {report.status !== 'reviewed' && (
                <button
                  disabled={loading}
                  onClick={() => handleAction('reviewed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 disabled:opacity-50"
                >
                  <CheckCircle size={14} /> Marquer examiné
                </button>
              )}
              {report.status !== 'dismissed' && (
                <button
                  disabled={loading}
                  onClick={() => handleAction('dismissed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  <XCircle size={14} /> Classer sans suite
                </button>
              )}
              <button
                disabled={loading}
                onClick={() => handleSuspend(report.reportedUser.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 disabled:opacity-50"
              >
                <UserX size={14} /> Suspendre l'utilisateur
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composant Card Avis suspect ─────────────────────────────────
function RatingCard({ rating }) {
  const [suspending, setSuspending] = useState(false);
  const [suspended, setSuspended] = useState(false);

  const ride = rating.ride;
  const ratedUser = ride?.driver?.user;

  const handleSuspend = async (userId) => {
    if (!window.confirm('Suspendre cet utilisateur ?')) return;
    setSuspending(true);
    try {
      await adminAPI.suspendUser(userId, true);
      setSuspended(true);
    } finally {
      setSuspending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-1">
            {[1,2,3,4,5].map(i => (
              <Star
                key={i}
                size={16}
                className={i <= rating.score ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}
              />
            ))}
            <span className="ml-1 font-bold text-gray-700">{rating.score}/5</span>
          </div>

          {rating.comment && (
            <p className="mt-2 text-sm text-gray-600 italic p-3 bg-red-50 rounded-xl border border-red-100">
              "{rating.comment}"
            </p>
          )}

          {ride && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold mb-1">Client</p>
                <p className="font-semibold text-gray-800">
                  {ride.client.firstName} {ride.client.lastName}
                </p>
                <p className="text-gray-400 text-xs flex items-center gap-1">
                  <Phone size={10} /> {ride.client.phone}
                </p>
              </div>
              {ratedUser && (
                <div>
                  <p className="text-gray-400 text-xs uppercase font-semibold mb-1">Chauffeur noté</p>
                  <p className="font-semibold text-gray-800">
                    {ratedUser.firstName} {ratedUser.lastName}
                  </p>
                  <p className="text-gray-400 text-xs flex items-center gap-1">
                    <Phone size={10} /> {ratedUser.phone}
                  </p>
                </div>
              )}
            </div>
          )}

          {ride && (
            <p className="text-xs text-gray-400 mt-2">
              {ride.pickupAddress?.split(',')[0]} → {ride.dropoffAddress?.split(',')[0]}
            </p>
          )}

          <p className="text-xs text-gray-400 mt-1">
            {format(new Date(rating.createdAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
          </p>
        </div>

        {ratedUser && (
          <button
            disabled={suspending || suspended}
            onClick={() => handleSuspend(ratedUser.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold flex-shrink-0
              ${suspended
                ? 'bg-gray-100 text-gray-400 cursor-default'
                : 'bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50'
              }`}
          >
            <UserX size={14} />
            {suspended ? 'Suspendu' : 'Suspendre'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page principale ─────────────────────────────────────────────
export default function ModerationPage() {
  const [tab, setTab] = useState('reports');
  const [reports, setReports] = useState([]);
  const [suspiciousRatings, setSuspiciousRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [pendingCount, setPendingCount] = useState(0);

  const loadReports = async (status = statusFilter) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getReports({ status, limit: 50 });
      setReports(data.reports || []);
      if (status === 'pending') setPendingCount(data.pagination?.total || 0);
    } catch {} finally {
      setLoading(false);
    }
  };

  const loadRatings = async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getSuspiciousRatings();
      setSuspiciousRatings(data.ratings || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'reports') loadReports();
    else loadRatings();
  }, [tab]);

  const handleUpdateReport = async (id, updateData) => {
    await adminAPI.updateReport(id, updateData);
    setReports(rs => rs.map(r => r.id === id ? { ...r, ...updateData } : r));
  };

  const handleFilterChange = (s) => {
    setStatusFilter(s);
    loadReports(s);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary flex items-center gap-2">
            <ShieldAlert className="text-purple-500" size={24} />
            Modération
          </h1>
          <p className="text-gray-400 text-sm mt-1">Signalements utilisateurs et avis suspects</p>
        </div>
        <button
          onClick={() => tab === 'reports' ? loadReports() : loadRatings()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setTab('reports')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            tab === 'reports' ? 'bg-white text-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlertTriangle size={15} />
          Signalements
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('ratings')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            tab === 'ratings' ? 'bg-white text-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Star size={15} />
          Avis suspects
        </button>
      </div>

      {/* ── Onglet Signalements ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {/* Filtres status */}
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'pending', label: 'En attente' },
              { key: 'reviewed', label: 'Examinés' },
              { key: 'action_taken', label: 'Action prise' },
              { key: 'dismissed', label: 'Classés' },
              { key: 'all', label: 'Tous' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                  statusFilter === key
                    ? 'bg-secondary text-white border-secondary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ShieldAlert size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Aucun signalement {statusFilter !== 'all' ? 'dans cette catégorie' : ''}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(r => (
                <ReportCard key={r.id} report={r} onUpdate={handleUpdateReport} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Onglet Avis suspects ── */}
      {tab === 'ratings' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : suspiciousRatings.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Star size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Aucun avis suspect pour le moment</p>
              <p className="text-sm mt-1">Les avis ≤ 2 étoiles avec commentaire apparaissent ici</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{suspiciousRatings.length} avis suspects — notes ≤ 2/5 avec commentaire</span>
              </div>
              <div className="space-y-3">
                {suspiciousRatings.map(r => (
                  <RatingCard key={r.id} rating={r} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
