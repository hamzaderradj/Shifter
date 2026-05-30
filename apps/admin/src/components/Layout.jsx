import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Car, MapPin, BarChart3,
  AlertTriangle, LogOut, Menu, X, Bike, Bell, ShieldAlert
} from 'lucide-react';
import { useAuthStore } from '../store/auth';

// eslint-disable-next-line no-unused-vars
const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/drivers', icon: Bike, label: 'Chauffeurs' },
  { to: '/users', icon: Users, label: 'Utilisateurs' },
  { to: '/rides', icon: Car, label: 'Courses' },
  { to: '/analytics', icon: BarChart3, label: 'Analytiques' },
  { to: '/sos', icon: AlertTriangle, label: 'Alertes SOS', danger: true },
  { to: '/moderation', icon: ShieldAlert, label: 'Modération', purple: true },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => { logout(); navigate('/login'); };

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
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label, exact, danger, purple }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group
                ${isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : purple
                  ? 'text-purple-400 hover:bg-purple-500/10'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={20} className="flex-shrink-0" />
              {sidebarOpen && <span className="font-medium text-sm">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="p-3 border-t border-white/10">
          {sidebarOpen && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">
                  {user?.firstName?.[0] || 'A'}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {user?.firstName || 'Admin'}
                </p>
                <p className="text-white/40 text-xs">Administrateur</p>
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
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Bell size={20} className="text-gray-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
