import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Check,
  ClipboardList,
  HardDrive,
  Lock,
  MonitorCog,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Wifi,
  Wrench
} from 'lucide-react';
import { appBackend, backendConfig } from './lib/backend';
import type {
  AdminDashboard,
  AppSession,
  ClientDashboard,
  Priority,
  TicketRecord,
  TicketStatus,
  UpdateResult
} from './lib/domain';
import { APP_VERSION, STORAGE_KEYS } from './lib/domain';
import { DiagnosticReport, runQuickDiagnostic } from './lib/diagnostics';
import { checkForUpdates as checkNativeUpdates } from './lib/updates';
import { openRemoteTool, RemoteSession } from './lib/support';
import { AgentActionResult, AgentStatus, getAgentStatus, runAgentAction } from './lib/agent';

type AdminTab = 'queue' | 'devices' | 'releases';
type ClientTab = 'overview' | 'ticket' | 'maintenance';

type Toast = { message: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' } | null;

function readThermalMax(payload: Record<string, unknown> | undefined): number | null {
  if (!payload) return null;
  const value = payload.maxTemperatureC;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>('queue');
  const [clientTab, setClientTab] = useState<ClientTab>('overview');
  const [toast, setToast] = useState<Toast>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const [adminEmail, setAdminEmail] = useState(backendConfig.localAdminEmail);
  const [adminPassword, setAdminPassword] = useState(backendConfig.localAdminPassword);
  const [clientPairingCode, setClientPairingCode] = useState(backendConfig.backendKind === 'local' ? 'DEMO-PAIR' : '');
  const [clientIssue, setClientIssue] = useState('Mi PC esta lenta y necesito soporte remoto.');

  const [adminDashboard, setAdminDashboard] = useState<AdminDashboard | null>(null);
  const [clientDashboard, setClientDashboard] = useState<ClientDashboard | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticReport | null>(null);
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentResult, setAgentResult] = useState<AgentActionResult | null>(null);
  const [pairingGenerated, setPairingGenerated] = useState<string>('');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');

  const selectedTicket = useMemo<TicketRecord | undefined>(() => {
    const tickets = session?.role === 'admin' ? adminDashboard?.tickets ?? [] : clientDashboard?.tickets ?? [];
    return tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0];
  }, [adminDashboard?.tickets, clientDashboard?.tickets, selectedTicketId, session?.role]);

  const openTickets = useMemo(() => {
    if (session?.role === 'admin') return (adminDashboard?.tickets ?? []).filter((ticket) => ticket.status !== 'cerrado');
    return (clientDashboard?.tickets ?? []).filter((ticket) => ticket.status !== 'cerrado');
  }, [adminDashboard?.tickets, clientDashboard?.tickets, session?.role]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const restored = await appBackend.bootstrap();
        if (alive) setSession(restored);
      } catch {
        if (alive) setSession(null);
      } finally {
        if (alive) setBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !backendConfig.supabaseUrl || !backendConfig.supabaseAnonKey) return;

    let alive = true;
    const restoreSession = async () => {
      try {
        const baseUrl = backendConfig.supabaseUrl?.replace(/\/$/, '');
        const anonKey = backendConfig.supabaseAnonKey;
        if (!baseUrl || !anonKey) return;

        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        };

        const authResponse = await fetch(`${baseUrl}/auth/v1/user`, { headers });
        if (!authResponse.ok) return;

        const user = await authResponse.json() as { id: string; email: string | null };
        const profileResponse = await fetch(
          `${baseUrl}/rest/v1/admin_users?select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
          { headers }
        );

        if (!profileResponse.ok) return;
        const profiles = await profileResponse.json() as Array<{ user_id: string; email: string; org_name: string }>;
        const profile = profiles[0];
        if (!profile) return;

        const session: AppSession = {
          role: 'admin',
          backendKind: 'supabase',
          userId: user.id,
          accessToken,
          refreshToken: refreshToken ?? undefined,
          email: profile.email || user.email || undefined,
          displayName: profile.org_name,
          orgName: profile.org_name
        };

        window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
        if (alive) {
          setSession(session);
          setShowAdminLogin(false);
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
      } catch {
        // Ignore hash restore errors and fall back to the regular login form.
      }
    };

    void restoreSession();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setAdminDashboard(null);
      setClientDashboard(null);
      setDiagnostic(null);
      setRemoteSession(null);
      setSelectedTicketId('');
      return;
    }

    if (session.role === 'admin') {
      void refreshAdmin();
      void loadMaintenanceTelemetry();
      return;
    }

    void refreshClient(session.deviceToken ?? '');
    void loadMaintenanceTelemetry();
  }, [session]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setShowAdminLogin(true);
      }

      if (event.key === 'Escape') {
        setShowAdminLogin(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function refreshAdmin() {
    setIsBusy(true);
    try {
      const dashboard = await appBackend.getAdminDashboard();
      setAdminDashboard(dashboard);
      if (!selectedTicketId && dashboard.tickets[0]?.id) {
        setSelectedTicketId(dashboard.tickets[0].id);
      }
      setAdminTab((current) => current);
      if (dashboard.tickets[0]?.id) {
        setClientIssue(dashboard.tickets[0].issue);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo cargar el panel admin.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshClient(deviceToken: string) {
    if (!deviceToken) return;
    setIsBusy(true);
    try {
      const dashboard = await appBackend.getClientDashboard(deviceToken);
      setClientDashboard(dashboard);
      if (!selectedTicketId && dashboard.tickets[0]?.id) {
        setSelectedTicketId(dashboard.tickets[0].id);
      }
      const latestDiagnostic = dashboard.diagnostics[0];
      if (latestDiagnostic) {
        setDiagnostic(latestDiagnostic.payload as unknown as DiagnosticReport);
      }
      if (dashboard.latestSession) {
        setRemoteSession({
          code: dashboard.latestSession.code,
          expiresInMinutes: dashboard.latestSession.expiresInMinutes,
          instructions: dashboard.latestSession.instructions
        });
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo cargar el panel cliente.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function loadMaintenanceTelemetry() {
    try {
      const status = await getAgentStatus();
      setAgentStatus(status);
    } catch {
      setAgentStatus(null);
    }
  }

  function notify(message: string, tone: NonNullable<Toast>['tone'] = 'neutral') {
    setToast({ message, tone });
  }

  function handleSignOut() {
    void appBackend.signOut().finally(() => {
      setSession(null);
      setAdminDashboard(null);
      setClientDashboard(null);
      setDiagnostic(null);
      setRemoteSession(null);
      setUpdateResult(null);
      setAgentResult(null);
      setSelectedTicketId('');
      setShowAdminLogin(false);
      notify('Sesion cerrada.', 'neutral');
    });
  }

  async function handleAdminSignIn() {
    setIsBusy(true);
    try {
      const result = await appBackend.signInAdmin(adminEmail, adminPassword);
      setSession(result.session);
      setAdminDashboard(await appBackend.getAdminDashboard());
      setAdminTab('queue');
      notify('Admin autenticado.', 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo iniciar sesion.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClientRegister() {
    setIsBusy(true);
    try {
      const report = await runQuickDiagnostic();
      setDiagnostic(report);
      const deviceName = report.computerName || report.userName || 'Equipo cliente';
      const result = await appBackend.registerClient({
        pairingCode: clientPairingCode,
        deviceName,
        issue: clientIssue,
        computerName: report.computerName,
        userName: report.userName,
        os: report.os,
        platform: 'windows'
      });

      setSession(result.session);
      setClientDashboard(await appBackend.getClientDashboard(result.session.deviceToken ?? ''));
      setClientTab('overview');
      notify(`Equipo registrado: ${result.device.displayName}`, 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo registrar el equipo.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRunDiagnostic() {
    if (!session?.deviceToken) {
      notify('Registra primero el equipo cliente.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      const report = await runQuickDiagnostic();
      setDiagnostic(report);
      await appBackend.saveDiagnostic(
        {
          deviceId: session.deviceId ?? '',
          payload: report as unknown as Record<string, unknown>
        },
        session.deviceToken
      );
      await refreshClient(session.deviceToken);
      notify('Diagnostico guardado y sincronizado.', 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo correr el diagnostico.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateTicket() {
    if (!session?.deviceToken || !clientDashboard?.device) {
      notify('Registra el dispositivo antes de crear tickets.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      const priority: Priority = clientIssue.toLowerCase().includes('urgente') || clientIssue.toLowerCase().includes('no prende') ? 'alta' : 'normal';
      const ticket = await appBackend.createTicket(
        {
          deviceId: clientDashboard.device.id,
          issue: clientIssue,
          clientName: clientDashboard.device.displayName,
          priority
        },
        session.deviceToken
      );
      const supportSession = await appBackend.createRemoteSession(
        {
          deviceId: clientDashboard.device.id,
          ticketId: ticket.id
        },
        session.deviceToken
      );

      setRemoteSession({
        code: supportSession.code,
        expiresInMinutes: supportSession.expiresInMinutes,
        instructions: supportSession.instructions
      });
      await refreshClient(session.deviceToken);
      notify(`Ticket ${ticket.id} creado y listo para remoto.`, 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo crear el ticket.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOpenRemote() {
    try {
      const message = await openRemoteTool();
      notify(message, 'neutral');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo abrir la herramienta remota.', 'danger');
    }
  }

  async function handleGeneratePairingCode() {
    if (session?.role !== 'admin') return;

    setIsBusy(true);
    try {
      const record = await appBackend.generatePairingCode();
      setPairingGenerated(record.code);
      notify(`Pairing code creado: ${record.code}`, 'ok');
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(record.code);
      }
      await refreshAdmin();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo generar el codigo.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpdateCheck() {
    setIsBusy(true);
    try {
      const result = await appBackend.checkForUpdates(APP_VERSION);
      setUpdateResult(result);
      notify(result.status === 'available' ? `Update disponible: ${result.nextVersion}` : result.notes, result.status === 'available' ? 'warn' : 'neutral');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleNativeUpdateCheck() {
    try {
      const result = await checkNativeUpdates();
      setUpdateResult(result);
      notify(result.notes, result.status === 'available' ? 'warn' : 'neutral');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo verificar el updater nativo.', 'danger');
    }
  }

  async function handleAgentAction(actionId: string) {
    setIsBusy(true);
    try {
      const result = await runAgentAction(actionId);
      setAgentResult(result);
      notify(result.message, result.ok ? 'ok' : 'warn');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo ejecutar la accion.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRefreshDashboard() {
    if (!session) {
      notify('No hay una sesion activa para sincronizar.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      if (session.role === 'admin') {
        await refreshAdmin();
      } else if (session.deviceToken) {
        await refreshClient(session.deviceToken);
      }

      notify('Panel sincronizado.', 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo sincronizar el panel.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  if (booting) {
    return (
      <main className="deck-shell">
        <div className="industrial-bg" />
        <div className="scanlines" />
        <div className="hud-frame" />
        <section className="center-stage">
          <div className="line-panel auth-panel">
            <p className="section-kicker">BOOT</p>
            <h2>Cargando UnderDock...</h2>
            <p>Preparando autentificacion, diagnostico y soporte remoto.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="deck-shell">
        <div className="industrial-bg" />
        <div className="scanlines" />
        <div className="hud-frame" />

        <header className="command-bar">
          <button className="brand-lockup" aria-label="UnderDock inicio">
            <span className="brand-mark"><i /></span>
            <span>
              <b>UNDERDOCK</b>
              <small>LOGIN</small>
            </span>
          </button>
          <div className="top-nav auth-top-nav">
            <button className="active" onClick={() => setShowAdminLogin(false)}>ACCESO CLIENTE</button>
          </div>
          <div className="mode-switch">
            <button className="active">{backendConfig.backendKind.toUpperCase()}</button>
          </div>
        </header>

        <section className="auth-shell">
          <section className="line-panel auth-card auth-card-single">
            <p className="section-kicker">ACCESO CLIENTE</p>
            <h2>Entrar con tu codigo de activacion</h2>
            <div className="field-stack">
              <label>
                <span>Codigo de activacion</span>
                <input
                  value={clientPairingCode}
                  onChange={(event) => setClientPairingCode(event.target.value.toUpperCase())}
                  placeholder={backendConfig.backendKind === 'local' ? 'DEMO-PAIR' : 'Codigo de activacion'}
                  autoComplete="one-time-code"
                />
              </label>
            </div>
            <button className="gold-action full" onClick={handleClientRegister} disabled={isBusy}>
              <MonitorCog size={14} /> Entrar
            </button>
            <div className="mini-notes auth-footnote">
              <p>Sin cuenta. Solo el codigo de activacion que te pasa soporte.</p>
              <button className="text-link" onClick={() => setShowAdminLogin(true)}>
                Acceso admin
              </button>
            </div>
          </section>
        </section>

        {showAdminLogin && (
          <div className="admin-modal-backdrop" role="presentation" onClick={() => setShowAdminLogin(false)}>
            <section className="line-panel auth-card admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-login-title" onClick={(event) => event.stopPropagation()}>
              <div className="admin-modal-header">
                <div>
                  <p className="section-kicker">ADMIN</p>
                  <h2 id="admin-login-title">Entrar al panel admin</h2>
                </div>
                <button className="admin-modal-close" onClick={() => setShowAdminLogin(false)} aria-label="Cerrar acceso admin">
                  Cerrar
                </button>
              </div>
              <div className="field-stack">
                <label>
                  <span>Email</span>
                  <input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@tudominio.com" />
                </label>
                <label>
                  <span>Password</span>
                  <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="Password" />
                </label>
              </div>
              <button className="gold-action full" onClick={handleAdminSignIn} disabled={isBusy}>
                <Lock size={14} /> Entrar como admin
              </button>
              <div className="mini-notes">
                <p>Con Supabase: usa tu usuario y la fila en `admin_users`.</p>
                <p>En local: usa las credenciales de `.env`.</p>
              </div>
            </section>
          </div>
        )}

        {toast && (
          <ToastBar toast={toast} />
        )}
      </main>
    );
  }

  return (
    <main className="deck-shell">
      <div className="industrial-bg" />
      <div className="scanlines" />
      <div className="hud-frame" />

      <header className="command-bar">
        <button className="brand-lockup" onClick={handleRefreshDashboard} aria-label="UnderDock inicio">
          <span className="brand-mark"><i /></span>
          <span>
            <b>UNDERDOCK</b>
            <small>{session.role.toUpperCase()} / {session.backendKind.toUpperCase()}</small>
          </span>
        </button>

        <nav className="top-nav">
          {session.role === 'admin' ? (
            <>
              <button className={adminTab === 'queue' ? 'active' : ''} onClick={() => setAdminTab('queue')}>QUEUE</button>
              <button className={adminTab === 'devices' ? 'active' : ''} onClick={() => setAdminTab('devices')}>DEVICES</button>
              <button className={adminTab === 'releases' ? 'active' : ''} onClick={() => setAdminTab('releases')}>RELEASES</button>
            </>
          ) : (
            <>
              <button className={clientTab === 'overview' ? 'active' : ''} onClick={() => setClientTab('overview')}>OVERVIEW</button>
              <button className={clientTab === 'ticket' ? 'active' : ''} onClick={() => setClientTab('ticket')}>TICKET</button>
              <button className={clientTab === 'maintenance' ? 'active' : ''} onClick={() => setClientTab('maintenance')}>MAINT</button>
            </>
          )}
        </nav>

        <div className="mode-switch">
          <button className="active" onClick={handleRefreshDashboard}>REFRESH</button>
          <button onClick={handleSignOut}>SALIR</button>
        </div>
      </header>

      <section className="hero-deck">
        <p className="kicker">{session.role === 'admin' ? 'ADMIN PANEL' : 'CLIENT PANEL'}</p>
        <h1>
          {session.role === 'admin'
            ? 'QUIEN PIDE AYUDA, QUIEN LA RECIBE Y COMO ENTRAR.'
            : 'EL EQUIPO SE REGISTRA, EL TICKET QUEDA Y EL REMOTO SE ABRE.'}
        </h1>
        <p className="subtitle">
          {session.role === 'admin'
            ? 'Panel central para ver cola, generar pairing codes, abrir remoto y mover estados.'
            : 'Mesa de ayuda en la PC del cliente con diagnostico on-demand, tickets y sesion remota.'}
        </p>
        <div className="hero-actions">
          <button className="gold-action" onClick={session.role === 'admin' ? handleGeneratePairingCode : handleCreateTicket} disabled={isBusy}>
            {session.role === 'admin' ? 'GENERAR PAIRING' : 'CREAR TICKET'}
          </button>
          <button className="line-action" onClick={session.role === 'admin' ? handleOpenRemote : handleRunDiagnostic} disabled={isBusy}>
            {session.role === 'admin' ? 'ABRIR REMOTO' : 'RUN DIAGNOSTIC'}
          </button>
        </div>
      </section>

      <section className="content-stage">
        <div className="stage-line"><span /></div>
        <StatusRail
          backendKind={session.backendKind}
          orgName={session.orgName ?? backendConfig.defaultOrgName}
          ticketCount={openTickets.length}
          deviceCount={session.role === 'admin' ? adminDashboard?.devices.length ?? 0 : clientDashboard ? 1 : 0}
          updateResult={updateResult}
        />

        {session.role === 'admin' ? (
          <AdminWorkspace
            dashboard={adminDashboard}
            activeTab={adminTab}
            selectedTicket={selectedTicket}
            selectedTicketId={selectedTicketId}
            onSelectTicket={setSelectedTicketId}
            pairingCode={pairingGenerated || adminDashboard?.pairingCodes[0]?.code || ''}
            onOpenRemote={handleOpenRemote}
            onUpdateTicket={async (status) => {
              if (!selectedTicket) return;
              setIsBusy(true);
              try {
                await appBackend.updateTicketStatus(selectedTicket.id, status);
                await refreshAdmin();
                notify(`Ticket ${selectedTicket.id} -> ${status}`, 'ok');
              } catch (error) {
                notify(error instanceof Error ? error.message : 'No se pudo actualizar el ticket.', 'danger');
              } finally {
                setIsBusy(false);
              }
            }}
            onCheckUpdates={handleUpdateCheck}
            onNativeUpdateCheck={handleNativeUpdateCheck}
          />
        ) : (
          <ClientWorkspace
            dashboard={clientDashboard}
            activeTab={clientTab}
            issue={clientIssue}
            setIssue={setClientIssue}
            diagnostic={diagnostic}
            remoteSession={remoteSession}
            agentStatus={agentStatus}
            agentResult={agentResult}
            updateResult={updateResult}
            onRunDiagnostic={handleRunDiagnostic}
            onCreateTicket={handleCreateTicket}
            onOpenRemote={handleOpenRemote}
            onCheckUpdates={handleUpdateCheck}
            onAgentAction={handleAgentAction}
          />
        )}
      </section>

      {toast && <ToastBar toast={toast} />}
    </main>
  );
}

function StatusRail({
  backendKind,
  orgName,
  ticketCount,
  deviceCount,
  updateResult
}: {
  backendKind: string;
  orgName: string;
  ticketCount: number;
  deviceCount: number;
  updateResult: UpdateResult | null;
}) {
  return (
    <aside className="status-rail">
      <div className="rail-cell">
        <span>BACKEND</span>
        <strong>{backendKind.toUpperCase()}</strong>
      </div>
      <div className="rail-cell">
        <span>ORG</span>
        <strong>{orgName}</strong>
      </div>
      <div className="rail-cell">
        <span>TICKETS</span>
        <strong>{ticketCount}</strong>
      </div>
      <div className="rail-cell">
        <span>DEVICES</span>
        <strong>{deviceCount}</strong>
      </div>
      <div className="rail-cell wide">
        <span>UPDATES</span>
        <strong>{updateResult?.status?.toUpperCase() ?? 'PENDING'}</strong>
      </div>
    </aside>
  );
}

function AdminWorkspace({
  dashboard,
  activeTab,
  selectedTicket,
  selectedTicketId,
  onSelectTicket,
  pairingCode,
  onOpenRemote,
  onUpdateTicket,
  onCheckUpdates,
  onNativeUpdateCheck
}: {
  dashboard: AdminDashboard | null;
  activeTab: AdminTab;
  selectedTicket?: TicketRecord;
  selectedTicketId: string;
  onSelectTicket: (ticketId: string) => void;
  pairingCode: string;
  onOpenRemote: () => void;
  onUpdateTicket: (status: TicketStatus) => void;
  onCheckUpdates: () => void;
  onNativeUpdateCheck: () => void;
}) {
  const selectedDevice = dashboard?.devices.find((device) => device.id === selectedTicket?.deviceId);
  const selectedDeviceDiagnostic = dashboard?.diagnostics.find((diagnostic) => diagnostic.deviceId === selectedTicket?.deviceId);
  const latestRelease = dashboard?.releases[0];
  const adminThermal = readThermalMax(selectedDeviceDiagnostic?.payload);

  return (
    <div className="stage-grid admin-grid">
      <section className="line-panel main-copy">
        <p className="section-kicker">ADMIN DECK</p>
        <h2>Cola central, pairing code y control remoto.</h2>
        <p>
          El backend guarda tickets, diagnosticos y releases. Desde este panel generas el codigo de acceso, revisas la cola
          y cambias el estado del trabajo sin depender de la PC del cliente.
        </p>
        <div className="button-row">
          <button className="gold-action" onClick={onCheckUpdates}><ArrowDownToLine size={14} /> Check updates</button>
          <button className="line-action" onClick={onNativeUpdateCheck}><RefreshCw size={14} /> Plugin updater</button>
        </div>
      </section>

      <section className="line-panel alert-panel">
        <p className="section-kicker">PAIRING</p>
        <div className="big-number">{pairingCode || '-----'}</div>
        <span>codigo de enrolamiento</span>
        <button className="line-action full" onClick={onOpenRemote}>
          <Wrench size={14} /> Abrir remoto
        </button>
      </section>

      <section className="thin-readout">
        <DataLine label="Ticket activo" value={selectedTicket?.id ?? '—'} />
        <DataLine label="Cliente" value={selectedTicket?.clientName ?? '—'} />
        <DataLine label="Equipo" value={selectedDevice?.displayName ?? '—'} />
        <DataLine label="Estado" value={selectedTicket?.status.toUpperCase() ?? '—'} />
        <DataLine label="Release" value={latestRelease?.version ?? '—'} />
        <DataLine label="Temp max" value={adminThermal != null ? `${adminThermal.toFixed(1)} °C` : '—'} muted={adminThermal == null} />
      </section>

      {activeTab === 'queue' && (
        <section className="line-panel queue-panel">
          <p className="section-kicker">QUEUE</p>
          <div className="ticket-list">
            {(dashboard?.tickets ?? []).map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} selected={ticket.id === selectedTicketId} onSelect={onSelectTicket} />
            ))}
          </div>
        </section>
      )}

      {activeTab === 'devices' && (
        <section className="line-panel device-panel">
          <p className="section-kicker">DEVICES</p>
          <div className="device-stack">
            {(dashboard?.devices ?? []).map((device) => (
              <div key={device.id} className="device-card">
                <strong>{device.displayName}</strong>
                <small>{device.computerName} · {device.userName}</small>
                <span>{device.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'releases' && (
        <section className="line-panel release-panel">
          <p className="section-kicker">RELEASES</p>
          <div className="release-stack">
            {(dashboard?.releases ?? []).map((release) => (
              <div key={release.id} className="release-card">
                <strong>{release.version}</strong>
                <small>{release.notes}</small>
                <span>{release.manifestUrl}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="line-panel ticket-detail">
        <p className="section-kicker">ACTIVE TICKET</p>
        <h2>{selectedTicket?.id ?? 'Sin ticket'}</h2>
        <p>{selectedTicket?.issue ?? 'Selecciona un ticket de la cola.'}</p>
        <div className="button-row">
          <button className="gold-action" onClick={() => onUpdateTicket('en-remoto')} disabled={!selectedTicket}><Check size={14} /> En remoto</button>
          <button className="line-action" onClick={() => onUpdateTicket('esperando')} disabled={!selectedTicket}>Esperando</button>
          <button className="line-action" onClick={() => onUpdateTicket('cerrado')} disabled={!selectedTicket}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}

function ClientWorkspace({
  dashboard,
  activeTab,
  issue,
  setIssue,
  diagnostic,
  remoteSession,
  agentStatus,
  agentResult,
  updateResult,
  onRunDiagnostic,
  onCreateTicket,
  onOpenRemote,
  onCheckUpdates,
  onAgentAction
}: {
  dashboard: ClientDashboard | null;
  activeTab: ClientTab;
  issue: string;
  setIssue: (value: string) => void;
  diagnostic: DiagnosticReport | null;
  remoteSession: RemoteSession | null;
  agentStatus: AgentStatus | null;
  agentResult: AgentActionResult | null;
  updateResult: UpdateResult | null;
  onRunDiagnostic: () => void;
  onCreateTicket: () => void;
  onOpenRemote: () => void;
  onCheckUpdates: () => void;
  onAgentAction: (actionId: string) => void;
}) {
  const latestTicket = dashboard?.tickets[0];
  const latestDiagnostic = dashboard?.diagnostics[0];
  const release = dashboard?.latestRelease ?? null;
  const latestDiagnosticPayload = latestDiagnostic?.payload as Partial<DiagnosticReport> | undefined;
  const thermalReport = diagnostic ?? latestDiagnosticPayload ?? null;
  const thermalSource = thermalReport?.thermalZones?.[0] ?? null;
  const thermalLabel = thermalReport?.maxTemperatureC ?? null;
  const thermalNote = thermalReport?.temperatureNote ?? 'Ejecuta el diagnostico para leer temperatura.';
  const thermalTone: 'neutral' | 'ok' | 'warn' | 'danger' = thermalLabel == null
    ? 'neutral'
    : thermalLabel >= 85
      ? 'danger'
      : thermalLabel >= 70
        ? 'warn'
        : 'ok';

  return (
    <div className="stage-grid client-grid">
      <section className="line-panel main-copy">
        <p className="section-kicker">CLIENT DECK</p>
        <h2>El equipo se registra y el soporte queda trazado.</h2>
        <p>
          Este lado crea tickets, guarda diagnostico on-demand y prepara la sesion remota. No queda monitoreando en segundo plano.
        </p>
        <div className="button-row">
          <button className="gold-action" onClick={onRunDiagnostic}><MonitorCog size={14} /> Correr diagnostico</button>
          <button className="line-action" onClick={onOpenRemote}><Wrench size={14} /> Abrir remoto</button>
        </div>
      </section>

      <section className="line-panel request-panel">
        <p className="section-kicker">SOPORTE</p>
        <textarea value={issue} onChange={(event) => setIssue(event.target.value)} />
        <button className="gold-action full" onClick={onCreateTicket}>
          <ClipboardList size={14} /> Crear ticket
        </button>
        <div className="session-code">
          <span>REMOTE CODE</span>
          <strong>{remoteSession?.code ?? latestTicket?.remoteCode ?? 'PENDIENTE'}</strong>
          <small>{remoteSession?.instructions ?? 'Creando ticket se habilita el codigo de sesion.'}</small>
        </div>
      </section>

      <section className="thin-readout">
        <DataLine label="Equipo" value={dashboard?.device.displayName ?? 'Pendiente'} muted={!dashboard} />
        <DataLine label="OS" value={dashboard?.device.os ?? 'Pendiente'} muted={!dashboard} />
        <DataLine label="Ticket" value={latestTicket?.id ?? 'Pendiente'} muted={!dashboard} />
        <DataLine label="Release" value={release?.version ?? 'Pendiente'} muted={!dashboard} />
        <DataLine label="Temp max" value={thermalLabel != null ? `${thermalLabel.toFixed(1)} °C` : 'Pendiente'} muted={thermalLabel == null} />
        <DataLine label="Zona" value={thermalSource?.name ?? 'No detectada'} muted={!thermalSource} />
        <DataLine label="Sensor" value={thermalSource?.source ?? 'ACPI / WMI'} muted={!thermalSource} />
        <DataLine label="Nota" value={thermalNote} muted={!thermalReport} />
        <DataLine label="Update" value={updateResult?.status.toUpperCase() ?? 'PENDIENTE'} muted={!updateResult} />
        <StatusPill tone={thermalTone}>{thermalLabel == null ? 'TEMP PENDIENTE' : thermalLabel >= 85 ? 'TEMP CRITICA' : thermalLabel >= 70 ? 'TEMP ALTA' : 'TEMP OK'}</StatusPill>
      </section>

      {activeTab === 'overview' && (
        <section className="line-panel overview-panel">
          <p className="section-kicker">OVERVIEW</p>
          <div className="device-stack">
            <DataLine label="Usuario" value={dashboard?.device.userName ?? 'Pendiente'} muted={!dashboard} />
            <DataLine label="Estado" value={dashboard?.device.status.toUpperCase() ?? 'Pendiente'} muted={!dashboard} />
            <DataLine label="Ultimo diagnostico" value={latestDiagnostic?.generatedAt ?? 'Sin datos'} muted={!latestDiagnostic} />
          </div>
        </section>
      )}

      {activeTab === 'ticket' && (
        <section className="line-panel ticket-detail">
          <p className="section-kicker">TICKET</p>
          <h2>{latestTicket?.id ?? 'Sin ticket'}</h2>
          <p>{latestTicket?.issue ?? 'No hay tickets sincronizados.'}</p>
          <div className="button-row">
            <button className="gold-action" onClick={onCreateTicket}><ArrowRight size={14} /> Nuevo ticket</button>
            <button className="line-action" onClick={onCheckUpdates}>Ver updates</button>
          </div>
        </section>
      )}

      {activeTab === 'maintenance' && (
        <section className="line-panel maintenance-panel">
          <p className="section-kicker">MAINTENANCE</p>
          <div className="action-matrix">
            <button className="matrix-action" onClick={() => onAgentAction('temp_scan')}>
              <HardDrive size={26} />
              Temp scan
            </button>
            <button className="matrix-action" onClick={() => onAgentAction('startup_review')}>
              <Activity size={26} />
              Startup
            </button>
            <button className="matrix-action" onClick={() => onAgentAction('windows_update')}>
              <ArrowDownToLine size={26} />
              Windows Update
            </button>
            <button className="matrix-action" onClick={() => onAgentAction('defender_status')}>
              <ShieldCheck size={26} />
              Defender
            </button>
            <button className="matrix-action" onClick={() => onAgentAction('thermal_status')}>
              <Thermometer size={26} />
              Temperatura
            </button>
          </div>
          <div className="mini-notes">
            <p>Agent status: {agentStatus?.mode ?? 'standby'}.</p>
            <p>{agentResult?.message ?? 'Las acciones se ejecutan on-demand.'}</p>
          </div>
        </section>
      )}
    </div>
  );
}

function TicketRow({ ticket, selected, onSelect }: { ticket: TicketRecord; selected?: boolean; onSelect: (ticketId: string) => void }) {
  return (
    <button className={`ticket-row ${selected ? 'active' : ''}`} onClick={() => onSelect(ticket.id)}>
      <span>
        <b>{ticket.id}</b>
        <small>{ticket.clientName} · {ticket.issue}</small>
      </span>
      <StatusPill tone={ticket.priority === 'alta' ? 'warn' : 'neutral'}>{ticket.priority.toUpperCase()}</StatusPill>
    </button>
  );
}

function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function DataLine({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="data-line">
      <span>{label}</span>
      <strong className={muted ? 'muted' : ''}>{value}</strong>
    </div>
  );
}

function ToastBar({ toast }: { toast: NonNullable<Toast> }) {
  return (
    <div className={`toast ${toast.tone ?? 'neutral'}`}>
      <Bell size={15} />
      {toast.message}
    </div>
  );
}

export default App;
