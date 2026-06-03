import { Download, RefreshCw, Search, Shield, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { CustomTitlebar } from './CustomTitlebar';
import type { AppSession, UpdateResult } from '../lib/domain';

type AdminPage = 'devices' | 'tickets' | 'sessions' | 'diagnostics' | 'settings';

export function AdminLayout({
  session,
  selectedPage,
  setSelectedPage,
  searchQuery,
  setSearchQuery,
  isBusy,
  updateResult,
  isUpdating,
  updateProgress,
  counts,
  onRefresh,
  onSignOut,
  onInstallUpdate,
  children
}: {
  session: AppSession;
  selectedPage: AdminPage;
  setSelectedPage: (page: AdminPage) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  isBusy: boolean;
  updateResult: UpdateResult | null;
  isUpdating: boolean;
  updateProgress: string;
  counts: { devices: number; tickets: number; diagnostics: number; codes: number };
  onRefresh: () => void;
  onSignOut: () => void;
  onInstallUpdate: () => void;
  children: ReactNode;
}) {
  return (
    <main className="page-shell page-shell--admin">
      <div className="shell-backdrop" />
      <CustomTitlebar title="UnderDock Admin" subtitle="Panel privado" status={session.orgName ?? 'Admin'} />

      <div className="admin-shell">
        <aside className="panel admin-sidebar">
          <div className="sidebar-head">
            <p className="eyebrow">Navegacion</p>
            <strong>Admin</strong>
          </div>
          <nav className="sidebar-nav">
            <button className={selectedPage === 'devices' ? 'nav-item is-active' : 'nav-item'} onClick={() => setSelectedPage('devices')}>
              Equipos
            </button>
            <button className={selectedPage === 'tickets' ? 'nav-item is-active' : 'nav-item'} onClick={() => setSelectedPage('tickets')}>
              Tickets
            </button>
            <button className={selectedPage === 'sessions' ? 'nav-item is-active' : 'nav-item'} onClick={() => setSelectedPage('sessions')}>
              Sesiones remotas
            </button>
            <button className={selectedPage === 'diagnostics' ? 'nav-item is-active' : 'nav-item'} onClick={() => setSelectedPage('diagnostics')}>
              Diagnosticos
            </button>
            <button className={selectedPage === 'settings' ? 'nav-item is-active' : 'nav-item'} onClick={() => setSelectedPage('settings')}>
              Configuracion
            </button>
          </nav>

          <div className="sidebar-card">
            <span>Sesion</span>
            <strong>{session.email ?? 'Admin'}</strong>
            <p>{session.orgName ?? 'Sin equipo'}</p>
          </div>
        </aside>

        <section className="admin-main">
          <header className="panel admin-header">
            <div className="header-search">
              <Search size={16} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar equipos, tickets o diagnósticos" />
            </div>
            <div className="header-status">
              <span className="header-chip">
                <Shield size={14} />
                {isBusy ? 'Procesando' : 'Listo'}
              </span>
              <span className="header-chip">Equipos {counts.devices}</span>
            </div>
            <div className="header-actions">
              <button className="btn btn-ghost" onClick={onRefresh} disabled={isBusy || isUpdating}>
                <RefreshCw size={16} /> Actualizar
              </button>
              {updateResult?.status === 'available' && (
                <button className="btn btn-ghost" onClick={onInstallUpdate} disabled={isUpdating}>
                  <Download size={16} /> {isUpdating ? updateProgress || 'Aplicando' : 'Actualizar y reiniciar'}
                </button>
              )}
              <button className="btn btn-ghost btn-quiet" onClick={onSignOut}>
                <LogOut size={16} /> Salir
              </button>
            </div>
          </header>

          {children}
        </section>
      </div>
    </main>
  );
}
