import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Car, MapPin, BarChart3, AlertTriangle,
  LogOut, Menu, X, Bike, Bell, ShieldAlert, MessageSquare,
  HeartPulse, Shield, Lock
} from 'lucide-react';
import { useAuthStore } from '../store/auth';

const ROLE_LEVELS = { support: 1, operations: 2, finance: 3, admin: 4, superadmin: 5 };
const ROLE_COLORS = {
  superadmin: 'text-purple-400',
  admin:      'text-blue-400',
  operations: 'text-green-400',
  finance:    'text-yellow-400',
  support:    'text-gray-400',
};
const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin:      'Administrateur',
  operations: 'Opérations',
  finance:    'Finance',
  support:    'Support',
};

function NavSection({ title, items, sidebarOpen, adminRole }) {
  const currentLevel = ROLE_LEVELS[adminRole] || 4;

  return (
    <div>
      {sidebarOpen && <p className="text-white/30 text-xs font-bold uppercase tracking-wider px-3 mb-1 mt-3">{title}</p>}
      {items
        .filter(item => !item.minRole || (ROLE_LEVELS[item.minRole] || 0) <= currentLevel)
        .map(({ to, icon: Icon, label, exact, danger, purple }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group mb-0.5
              ${isActive
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : danger  ? 'text-red-400 hover:bg-red-500/10'
                : purple  ? 'text-purple-400 hover:bg-purple-500/10'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {sidebarOpen && <span className="font-medium text-sm">{label}</span>}
          </NavLink>
        ))
      }
    </div>
  );
}

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8h — aligné sur le JWT admin

export default function Layout() {
  const { user, adminRole, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const timeoutRef = React.useRef(null);

  const handleLogout = React.useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  // Auto-logout après inactivité
  const resetTimer = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      alert('Session expirée pour raison de sécurité. Veuillez vous reconnecter.');
      handleLogout();
    }, SESSION_TIMEOUT_MS);
  }, [handleLogout]);

  React.useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // Démarre le timer au montage
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimer]);

  const sections = [
    {
      title: 'Supervision',
      items: [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
        { to: '/health', icon: HeartPulse, label: 'Santé des services' },
        { to: '/analytics', icon: BarChart3, label: 'Analytiques', minRole: 'finance' },
      ]
    },
    {
      title: 'Gestion',
      items: [
        { to: '/drivers', icon: Bike, label: 'Chauffeurs', minRole: 'operations' },
        { to: '/users', icon: Users, label: 'Utilisateurs', minRole: 'support' },
        { to: '/rides', icon: Car, label: 'Courses', minRole: 'operations' },
        { to: '/support', icon: MessageSquare, label: 'Support', minRole: 'support' },
      ]
    },
    {
      title: 'Sécurité',
      items: [
        { to: '/sos', icon: AlertTriangle, label: 'Alertes SOS', danger: true, minRole: 'operations' },
        { to: '/moderation', icon: ShieldAlert, label: 'Modération', purple: true, minRole: 'operations' },
        { to: '/notifications', icon: Bell, label: 'Notifications', minRole: 'operations' },
        { to: '/audit', icon: Shield, label: 'Journal d\'audit', minRole: 'admin' },
      ]
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-secondary transition-all duration-300 flex flex-col flex-shrink-0 shadow-xl`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <Bike size={20} className="text-white" />
          </div>
          {sidebarOpen && (
            <div>
              <p className="text-white font-bold text-lg leading-none">Shifter</p>
              <p className="text-white/50 text-xs">Administration</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto space-y-0">
          {sections.map(section => (
            <NavSection
              key={section.title}
              title={section.title}
              items={section.items}
              sidebarOpen={sidebarOpen}
              adminRole={adminRole}
            />
          ))}
        </nav>

        {/* Rôle + Déconnexion */}
        <div className="p-3 border-t border-white/10">
          {sidebarOpen && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">{user?.firstName?.[0] || 'A'}</span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{user?.firstName || 'Admin'}</p>
                <p className={`text-xs font-semibold ${ROLE_COLORS[adminRole] || 'text-white/40'}`}>
                  {ROLE_LABELS[adminRole] || 'Administrateur'}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <LogOut size={18} className="flex-shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500">
              {user?.firstName} {user?.lastName}
            </span>
            <div className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
              adminRole === 'superadmin' ? 'border-purple-200 bg-purple-50 text-purple-700' :
              adminRole === 'admin'      ? 'border-blue-200 bg-blue-50 text-blue-700' :
              'border-gray-200 bg-gray-50 text-gray-600'
            }`}>
              {ROLE_LABELS[adminRole] || 'Admin'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
