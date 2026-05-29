import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { adminAPI } from '../services/api';
import { BarChart3 } from 'lucide-react';

const PERIODS = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '3 mois' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-secondary text-white px-3 py-2 rounded-xl text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.name === 'revenue' ? `${p.value?.toLocaleString()} €` : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminAPI.getAnalytics(days)
      .then(({ data: d }) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const chartData = data?.dailyStats?.map(d => ({
    date: format(parseISO(d.date), 'dd MMM', { locale: fr }),
    rides: parseInt(d.rides),
    revenue: parseFloat(d.revenue || 0),
  })) || [];

  const totalRides = chartData.reduce((s, d) => s + d.rides, 0);
  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const avgRidesPerDay = chartData.length ? Math.round(totalRides / chartData.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-secondary">Analytiques</h1>
          <p className="text-gray-500 text-sm mt-1">Performance de la plateforme</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors
                ${days === p.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Courses totales', value: totalRides.toLocaleString(), color: 'text-primary' },
          { label: 'Revenus bruts', value: `${Math.round(totalRevenue).toLocaleString()} €`, color: 'text-green-600' },
          { label: 'Moy. courses/jour', value: avgRidesPerDay, color: 'text-blue-600' },
        ].map(kpi => (
          <div key={kpi.label} className="card text-center">
            <p className="text-sm text-gray-500 mb-1">{kpi.label}</p>
            {loading ? (
              <div className="h-8 bg-gray-200 animate-pulse rounded mx-auto w-24 mt-2" />
            ) : (
              <p className={`text-3xl font-black ${kpi.color}`}>{kpi.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Courses chart */}
      <div className="card">
        <h3 className="font-bold text-secondary mb-6 flex items-center gap-2">
          <BarChart3 size={18} className="text-primary" /> Nombre de courses par jour
        </h3>
        {loading ? (
          <div className="h-64 bg-gray-100 animate-pulse rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ridesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F5" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="rides" name="Courses" stroke="#FF6B35" strokeWidth={2.5} fill="url(#ridesGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue chart */}
      <div className="card">
        <h3 className="font-bold text-secondary mb-6">Revenus quotidiens (€)</h3>
        {loading ? (
          <div className="h-64 bg-gray-100 animate-pulse rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F5" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="revenue" fill="#00C48C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top chauffeurs */}
      {data?.topDrivers?.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-secondary mb-4">🏆 Top 10 Chauffeurs</h3>
          <div className="space-y-2">
            {data.topDrivers.map((d, i) => (
              <div key={d.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                <span className={`text-lg font-black w-8 text-center ${i < 3 ? 'text-yellow-500' : 'text-gray-400'}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-secondary text-sm">
                    {d.user?.firstName} {d.user?.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{d.totalRides} courses · ★ {parseFloat(d.rating).toFixed(1)}</p>
                </div>
                <span className="font-bold text-green-600 text-sm">
                  {Math.round(parseFloat(d.totalEarnings)).toLocaleString()} €
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
