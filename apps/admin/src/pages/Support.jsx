import React, { useEffect, useState } from 'react';
import {
  MessageSquare, RefreshCw, Send, CheckCircle,
  Clock, XCircle, Phone, ChevronDown, ChevronUp
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_CONFIG = {
  open:        { label: 'Ouvert',      bg: 'bg-blue-100',   text: 'text-blue-700',   icon: Clock },
  in_progress: { label: 'En cours',    bg: 'bg-yellow-100', text: 'text-yellow-700', icon: MessageSquare },
  closed:      { label: 'Fermé',       bg: 'bg-gray-100',   text: 'text-gray-500',   icon: CheckCircle },
};

function TicketCard({ ticket, onUpdate }) {
  const [expanded, setExpanded] = useState(ticket.status === 'open');
  const [reply, setReply] = useState(ticket.adminReply || '');
  const [loading, setLoading] = useState(false);

  const st = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const Icon = st.icon;

  const handleReply = async () => {
    if (!reply.trim()) return;
    setLoading(true);
    try {
      await onUpdate(ticket.id, { status: 'closed', adminReply: reply.trim() });
    } finally {
      setLoading(false);
    }
  };

  const handleStatus = async (status) => {
    setLoading(true);
    try {
      await onUpdate(ticket.id, { status });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      ticket.status === 'open' ? 'border-blue-200' : 'border-gray-100'
    }`}>
      {/* Header */}
      <div
        className="p-5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
                <Icon size={12} /> {st.label}
              </span>
              <span className="text-xs text-gray-400">
                {format(new Date(ticket.createdAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
              </span>
            </div>

            <h3 className="font-bold text-gray-800 text-base truncate">{ticket.subject}</h3>

            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-600 font-bold text-xs">
                    {ticket.user.firstName?.[0] || '?'}
                  </span>
                </div>
                {ticket.user.firstName} {ticket.user.lastName}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Phone size={10} /> {ticket.user.phone}
              </div>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                {ticket.user.role === 'client' ? 'Client' : 'Chauffeur'}
              </span>
            </div>
          </div>

          <button className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Contenu expandable */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          {/* Message du client */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Message</p>
            <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed">
              {ticket.message}
            </div>
          </div>

          {/* Course liée */}
          {ticket.ride && (
            <div className="text-xs text-gray-400 flex items-center gap-1">
              <span className="font-semibold">Course :</span>
              {ticket.ride.pickupAddress?.split(',')[0]} → {ticket.ride.dropoffAddress?.split(',')[0]}
            </div>
          )}

          {/* Réponse admin existante */}
          {ticket.adminReply && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Réponse envoyée</p>
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-sm text-gray-700 leading-relaxed">
                {ticket.adminReply}
              </div>
              {ticket.repliedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  {format(new Date(ticket.repliedAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
                </p>
              )}
            </div>
          )}

          {/* Zone de réponse (si pas encore fermé) */}
          {ticket.status !== 'closed' && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                {ticket.adminReply ? 'Modifier la réponse' : 'Répondre'}
              </p>
              <textarea
                className="w-full p-3 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                placeholder="Votre réponse au client..."
                value={reply}
                onChange={e => setReply(e.target.value)}
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  disabled={loading || !reply.trim()}
                  onClick={handleReply}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send size={14} /> Répondre & Fermer
                </button>
                {ticket.status === 'open' && (
                  <button
                    disabled={loading}
                    onClick={() => handleStatus('in_progress')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-xl text-sm font-semibold hover:bg-yellow-100 disabled:opacity-50"
                  >
                    <Clock size={14} /> Marquer en cours
                  </button>
                )}
                <button
                  disabled={loading}
                  onClick={() => handleStatus('closed')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  <XCircle size={14} /> Fermer sans répondre
                </button>
              </div>
            </div>
          )}

          {/* Ticket fermé — rouvrir */}
          {ticket.status === 'closed' && (
            <button
              disabled={loading}
              onClick={() => handleStatus('open')}
              className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
            >
              Rouvrir ce ticket
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [openCount, setOpenCount] = useState(0);

  const load = async (status = statusFilter) => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getTickets({ status, limit: 50 });
      setTickets(data.tickets || []);
      if (status === 'open') setOpenCount(data.pagination?.total || 0);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFilterChange = (s) => {
    setStatusFilter(s);
    load(s);
  };

  const handleUpdate = async (id, updateData) => {
    await adminAPI.updateTicket(id, updateData);
    setTickets(ts => ts.map(t => t.id === id ? { ...t, ...updateData } : t));
  };

  const filters = [
    { key: 'open', label: 'Ouverts' },
    { key: 'in_progress', label: 'En cours' },
    { key: 'closed', label: 'Fermés' },
    { key: 'all', label: 'Tous' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary flex items-center gap-2">
            <MessageSquare className="text-blue-500" size={24} />
            Support
          </h1>
          <p className="text-gray-400 text-sm mt-1">Tickets et messages des utilisateurs</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
              statusFilter === key
                ? 'bg-secondary text-white border-secondary'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {label}
            {key === 'open' && openCount > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                statusFilter === key ? 'bg-white/20 text-white' : 'bg-blue-500 text-white'
              }`}>
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Liste tickets */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Aucun ticket {statusFilter !== 'all' ? 'dans cette catégorie' : ''}</p>
          <p className="text-sm mt-1">Les demandes de support apparaîtront ici</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => (
            <TicketCard key={t.id} ticket={t} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
