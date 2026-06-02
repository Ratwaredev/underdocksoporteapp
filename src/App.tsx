import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Bell,
  CheckCircle2,
  Download,
  Globe2,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Wifi
} from 'lucide-react';
import { appBackend } from './lib/backend';
import type {
  AdminDashboard,
  AppSession,
  ClientDashboard,
  DiagnosticRecord,
  PairingCodeRecord,
  Priority,
  TicketRecord,
  UpdateResult
} from './lib/domain';
import { APP_VERSION } from './lib/domain';
import { DiagnosticReport, runQuickDiagnostic } from './lib/diagnostics';
import { openAdminWindow } from './lib/admin';
import { checkForUpdates as checkNativeUpdates, installLatestUpdate as installNativeUpdate } from './lib/updates';
import { openRemoteTool, RemoteSession } from './lib/support';
import { AgentActionResult, AgentStatus, getAgentStatus, runAgentAction } from './lib/agent';

type Toast = { message: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' } | null;
type AppView = 'client' | 'admin';
type SectionId = 'remote' | 'ticket' | 'quick' | 'advanced' | 'cleaner';

type QuickCheckItem = {
  id: string;
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
};

function getAppView(): AppView {
  if (typeof window === 'undefined') return 'client';

  const view = new URLSearchParams(window.location.search).get('view');
  return view === 'admin' ? 'admin' : 'client';
}

function App() {
  return getAppView() === 'admin' ? <AdminApp /> : <ClientApp />;
}

function ClientApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [clientDashboard, setClientDashboard] = useState<ClientDashboard | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticReport | null>(null);
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentResult, setAgentResult] = useState<AgentActionResult | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('quick');
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketIssue, setTicketIssue] = useState('Mi PC tiene un problema y necesito ayuda.');
  const [ticketCategory, setTicketCategory] = useState('Hardware');
  const [ticketUrgency, setTicketUrgency] = useState<Priority>('normal');
  const [ticketDescription, setTicketDescription] = useState('');
  const [cleanerSelection, setCleanerSelection] = useState({
    tempFiles: true,
    browserCache: false,
    recycleBin: false,
    oldLogs: false,
    startupReview: true
  });
  const [quickDiagnostic, setQuickDiagnostic] = useState<DiagnosticReport | null>(null);
  const [advancedDiagnostic, setAdvancedDiagnostic] = useState<{
    running: boolean;
    progress: string;
    summary: string;
    result: DiagnosticReport | null;
  }>({
    running: false,
    progress: '',
    summary: 'Listo para generar un informe más completo.',
    result: null
  });

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
    let alive = true;
    (async () => {
      const result = await checkNativeUpdates();
      if (!alive) return;
      setUpdateResult(result);
      if (result.status === 'available') {
        notify(`Hay una actualización disponible: ${result.nextVersion ?? 'nueva versión'}`, 'warn');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.deviceToken) {
      setClientDashboard(null);
      setRemoteSession(null);
      setDiagnostic(null);
      return;
    }

    void refreshClient(session.deviceToken);
  }, [session]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const status = await getAgentStatus();
        if (alive) setAgentStatus(status);
      } catch {
        if (alive) setAgentStatus(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveSection('remote');
        setShowTicketForm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function refreshClient(deviceToken: string) {
    setIsBusy(true);
    try {
      const dashboard = await appBackend.getClientDashboard(deviceToken);
      setClientDashboard(dashboard);

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
      notify(error instanceof Error ? error.message : 'No se pudo cargar el panel.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  function notify(message: string, tone: NonNullable<Toast>['tone'] = 'neutral') {
    setToast({ message, tone });
  }

  function handleSignOut() {
    void appBackend.signOut().finally(() => {
      setSession(null);
      setClientDashboard(null);
      setRemoteSession(null);
      setDiagnostic(null);
      setQuickDiagnostic(null);
      setAgentResult(null);
      setShowTicketForm(false);
      setActiveSection('quick');
      notify('Sesion cerrada.', 'neutral');
    });
  }

  async function handleRefresh() {
    try {
      const result = await checkNativeUpdates();
      setUpdateResult(result);
      if (result.status === 'available') {
        notify(`Actualización disponible: ${result.nextVersion}. Instalando...`, 'warn');
        await handleNativeUpdateInstall();
        return;
      }

      notify(result.notes || 'Todo al día.', 'ok');
    } catch {
      notify('No se pudo comprobar actualizaciones.', 'danger');
    }
  }

  async function handleRequestRemoteSupport() {
    if (!session?.deviceToken || !clientDashboard?.device) {
      notify('No hay un equipo listo para soporte remoto.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      const issueSummary = [ticketCategory, ticketIssue, ticketDescription].filter(Boolean).join(' - ');
      const ticket = await appBackend.createTicket(
        {
          deviceId: clientDashboard.device.id,
          issue: issueSummary,
          clientName: clientDashboard.device.displayName,
          priority: ticketUrgency
        },
        session.deviceToken
      );

      const supportSession = await appBackend.createRemoteSession(
        { deviceId: clientDashboard.device.id, ticketId: ticket.id },
        session.deviceToken
      );

      const latest = {
        code: supportSession.code,
        expiresInMinutes: supportSession.expiresInMinutes,
        instructions: supportSession.instructions
      };
      setRemoteSession(latest);
      setActiveSection('remote');
      await refreshClient(session.deviceToken);
      notify(`Ticket ${ticket.id} creado y listo para remoto.`, 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo pedir soporte.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateTicket() {
    if (!session?.deviceToken || !clientDashboard?.device) {
      notify('No hay un equipo listo para crear tickets.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      const issueSummary = [ticketCategory, ticketIssue, ticketDescription].filter(Boolean).join(' - ');
      const ticket = await appBackend.createTicket(
        {
          deviceId: clientDashboard.device.id,
          issue: issueSummary,
          clientName: clientDashboard.device.displayName,
          priority: ticketUrgency
        },
        session.deviceToken
      );
      setShowTicketForm(true);
      setActiveSection('ticket');
      notify(`Ticket ${ticket.id} enviado.`, 'ok');
      await refreshClient(session.deviceToken);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo crear el ticket.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRunQuickDiagnostic() {
    setIsBusy(true);
    try {
      const report = await runQuickDiagnostic();
      setQuickDiagnostic(report);
      setDiagnostic(report);
      setActiveSection('quick');
      if (session?.deviceToken && session.deviceId) {
        await appBackend.saveDiagnostic(
          {
            deviceId: session.deviceId,
            payload: report as unknown as Record<string, unknown>
          },
          session.deviceToken
        );
        await refreshClient(session.deviceToken);
        notify('Diagnóstico rápido guardado.', 'ok');
        return;
      }

      notify('Diagnóstico rápido completado en esta PC.', 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo ejecutar el diagnóstico.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRunAdvancedDiagnostic() {
    setAdvancedDiagnostic((current) => ({
      ...current,
      running: true,
      progress: 'Preparando recolección avanzada...',
      summary: 'Este proceso puede tardar un poco más.',
      result: null
    }));
    setActiveSection('advanced');

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setAdvancedDiagnostic((current) => ({
        ...current,
        progress: 'Revisando CPU, memoria, disco, seguridad y red...'
      }));
      const report = await runQuickDiagnostic();
      const enriched = {
        ...report,
        temperatureNote: report.temperatureNote || 'Informe avanzado completado.'
      } as DiagnosticReport;
      setAdvancedDiagnostic({
        running: false,
        progress: 'Informe listo.',
        summary: 'Generado para envío al técnico.',
        result: enriched
      });
      setDiagnostic(enriched);
      if (session?.deviceToken && session.deviceId) {
        await appBackend.saveDiagnostic(
          {
            deviceId: session.deviceId,
            payload: enriched as unknown as Record<string, unknown>
          },
          session.deviceToken
        );
        await refreshClient(session.deviceToken);
      }
      notify('Diagnóstico avanzado completado.', 'ok');
    } catch (error) {
      setAdvancedDiagnostic((current) => ({
        ...current,
        running: false,
        progress: '',
        summary: 'No se pudo completar el informe.',
        result: null
      }));
      notify(error instanceof Error ? error.message : 'No se pudo ejecutar el diagnóstico avanzado.', 'danger');
    }
  }

  async function handleCleanerAnalyze() {
    setIsBusy(true);
    try {
      const result = await runAgentAction('temp_scan');
      setAgentResult(result);
      setActiveSection('cleaner');
      notify(result.message, result.ok ? 'ok' : 'warn');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo analizar el cleaner.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCleanerRun() {
    setIsBusy(true);
    try {
      const result = await runAgentAction('startup_review');
      setAgentResult(result);
      notify(result.message, result.ok ? 'ok' : 'warn');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo limpiar la selección.', 'danger');
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

  async function handleOpenAdminPanel() {
    try {
      await openAdminWindow();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo abrir el panel interno.', 'danger');
    }
  }

  async function handleNativeUpdateInstall() {
    setIsUpdating(true);
    try {
      const result = await installNativeUpdate((progress) => setUpdateProgress(progress));
      setUpdateResult(result);
      notify(result.notes, result.status === 'available' ? 'warn' : 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo instalar la actualizacion.', 'danger');
    } finally {
      setIsUpdating(false);
      setUpdateProgress('');
    }
  }

  const status = useMemo(() => {
    const latestDiagnostic = clientDashboard?.diagnostics[0];
    return {
      version: APP_VERSION,
      lastDiagnostic: latestDiagnostic?.generatedAt ?? 'Sin revisión'
    };
  }, [clientDashboard?.diagnostics, clientDashboard?.tickets, remoteSession, session]);

  const quickChecks = useMemo<QuickCheckItem[]>(() => {
    const report = quickDiagnostic ?? diagnostic ?? null;
    const cpuTemp = report?.maxTemperatureC ?? null;
    const memoryLoad = report ? Math.round(((report.ramTotalGb - report.ramFreeGb) / report.ramTotalGb) * 100) : null;
    const diskFree = report?.systemDriveFreeGb ?? null;
    const defender = report?.defenderStatus ?? null;
    const connectivity = remoteSession || clientDashboard ? 'OK' : 'Pendiente';

    return [
      {
        id: 'cpu',
        label: 'CPU',
        value: cpuTemp == null ? 'Sin dato' : cpuTemp >= 85 ? 'Crítico' : cpuTemp >= 70 ? 'Atención' : 'OK',
        tone: cpuTemp == null ? 'neutral' : cpuTemp >= 85 ? 'danger' : cpuTemp >= 70 ? 'warn' : 'ok'
      },
      {
        id: 'ram',
        label: 'RAM',
        value: memoryLoad == null ? 'Sin dato' : memoryLoad >= 90 ? 'Crítico' : memoryLoad >= 75 ? 'Atención' : 'OK',
        tone: memoryLoad == null ? 'neutral' : memoryLoad >= 90 ? 'danger' : memoryLoad >= 75 ? 'warn' : 'ok'
      },
      {
        id: 'disk',
        label: 'Disco',
        value: diskFree == null ? 'Sin dato' : diskFree < 50 ? 'Atención' : 'OK',
        tone: diskFree == null ? 'neutral' : diskFree < 50 ? 'warn' : 'ok'
      },
      {
        id: 'temp',
        label: 'Temperatura',
        value: cpuTemp == null ? 'Pendiente' : `${cpuTemp.toFixed(1)} °C`,
        tone: cpuTemp == null ? 'neutral' : cpuTemp >= 85 ? 'danger' : cpuTemp >= 70 ? 'warn' : 'ok'
      },
      {
        id: 'defender',
        label: 'Seguridad',
        value: defender ?? 'Pendiente',
        tone: defender?.toLowerCase().includes('desactiv') ? 'danger' : defender ? 'ok' : 'neutral'
      },
      {
        id: 'network',
        label: 'Red',
        value: connectivity,
        tone: remoteSession || clientDashboard ? 'ok' : 'neutral'
      }
    ];
  }, [clientDashboard, diagnostic, quickDiagnostic, remoteSession]);

  if (booting) {
    return (
      <main className="app-shell">
        <div className="app-shell__bg" />
        <div className="app-shell__scan" />
        <div className="app-shell__frame" />
        <section className="boot-panel">
          <div className="panel">
            <p className="eyebrow">BOOT</p>
            <h1>UnderDock</h1>
            <p>Preparando soporte remoto, diagnóstico y mantenimiento.</p>
          </div>
        </section>
        <VersionFooter />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="app-shell__bg" />
      <div className="app-shell__scan" />
      <div className="app-shell__frame" />

      <header className="shell-header panel">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <h1>UnderDock</h1>
            <p>Soporte técnico remoto</p>
          </div>
        </div>

        <div className="status-strip">
          <StatusItem label="Versión" value={`v${status.version}`} tone="neutral" />
          <StatusItem label="Última revisión" value={status.lastDiagnostic} tone="neutral" />
        </div>

        <div className="header-actions">
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={isBusy || isUpdating}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="btn btn-ghost btn-quiet" onClick={handleOpenAdminPanel}>
            Interno
          </button>
          <button className="btn btn-ghost btn-quiet" onClick={handleSignOut}>
            Salir
          </button>
        </div>
      </header>

      <section className="dashboard-grid">
        <SystemStatusPanel
          session={session}
          status={status}
          updateResult={updateResult}
          isUpdating={isUpdating}
          updateProgress={updateProgress}
          onUpdateInstall={handleNativeUpdateInstall}
        />

        <section className="workspace-grid">
          <HomeDashboard
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            onOpenRemote={handleRequestRemoteSupport}
            onCreateTicket={() => {
              setShowTicketForm(true);
              setActiveSection('ticket');
            }}
            onQuickDiagnostic={handleRunQuickDiagnostic}
            onAdvancedDiagnostic={handleRunAdvancedDiagnostic}
            onOpenCleaner={() => setActiveSection('cleaner')}
            showTicketForm={showTicketForm}
          />

          <DetailPanel
            activeSection={activeSection}
            session={session}
            clientDashboard={clientDashboard}
            remoteSession={remoteSession}
            ticketIssue={ticketIssue}
            setTicketIssue={setTicketIssue}
            ticketCategory={ticketCategory}
            setTicketCategory={setTicketCategory}
            ticketUrgency={ticketUrgency}
            setTicketUrgency={setTicketUrgency}
            ticketDescription={ticketDescription}
            setTicketDescription={setTicketDescription}
            showTicketForm={showTicketForm}
            setShowTicketForm={setShowTicketForm}
            quickChecks={quickChecks}
            quickDiagnostic={quickDiagnostic ?? diagnostic}
            advancedDiagnostic={advancedDiagnostic}
            cleanerSelection={cleanerSelection}
            setCleanerSelection={setCleanerSelection}
            isBusy={isBusy}
            onRequestRemoteSupport={handleRequestRemoteSupport}
            onCreateTicket={handleCreateTicket}
            onRunQuickDiagnostic={handleRunQuickDiagnostic}
            onRunAdvancedDiagnostic={handleRunAdvancedDiagnostic}
            onCleanerAnalyze={handleCleanerAnalyze}
            onCleanerRun={handleCleanerRun}
            onOpenRemote={handleOpenRemote}
            onGoHome={() => {
              setShowTicketForm(false);
              setActiveSection('quick');
            }}
          />
        </section>
      </section>

      {toast && <ToastBar toast={toast} />}
      <VersionFooter />
    </main>
  );
}

function AdminApp() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [email, setEmail] = useState('admin@underdock.local');
  const [password, setPassword] = useState('');
  const [generatedCode, setGeneratedCode] = useState<PairingCodeRecord | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await checkNativeUpdates();
      if (!alive) return;
      setUpdateResult(result);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadDashboard() {
    setIsBusy(true);
    try {
      const panel = await appBackend.getAdminDashboard();
      setDashboard(panel);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo cargar el panel admin.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  function notify(message: string, tone: NonNullable<Toast>['tone'] = 'neutral') {
    setToast({ message, tone });
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const result = await appBackend.signInAdmin(email.trim(), password);
      setSession(result.session);
      setPassword('');
      notify('Panel admin activado.', 'ok');
      await loadDashboard();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo iniciar sesion admin.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOutAdmin() {
    setIsBusy(true);
    try {
      await appBackend.signOutAdmin();
      setSession(null);
      setDashboard(null);
      setGeneratedCode(null);
      notify('Sesion admin cerrada.', 'neutral');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGeneratePairingCode() {
    setIsBusy(true);
    try {
      const code = await appBackend.generatePairingCode();
      setGeneratedCode(code);
      await loadDashboard();
      notify(`Codigo generado: ${code.code}`, 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo generar el codigo.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRefreshAdmin() {
    try {
      const result = await checkNativeUpdates();
      setUpdateResult(result);
      if (session) {
        await loadDashboard();
      }
      notify(result.notes || 'Panel actualizado.', 'ok');
    } catch {
      notify('No se pudo actualizar el panel admin.', 'danger');
    }
  }

  async function handleInstallUpdate() {
    setIsUpdating(true);
    try {
      const result = await installNativeUpdate((progress) => setUpdateProgress(progress));
      setUpdateResult(result);
      notify(result.notes, result.status === 'available' ? 'warn' : 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo instalar la actualizacion.', 'danger');
    } finally {
      setIsUpdating(false);
      setUpdateProgress('');
    }
  }

  if (!session) {
    return (
      <main className="app-shell admin-shell">
        <div className="app-shell__bg" />
        <div className="app-shell__scan" />
        <div className="app-shell__frame" />

        <header className="shell-header panel">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <h1>UnderDock</h1>
              <p>Panel interno</p>
            </div>
          </div>

          <div className="status-strip">
            <StatusItem label="Acceso" value="Admin" tone="neutral" />
            <StatusItem label="Versión" value={`v${APP_VERSION}`} tone="neutral" />
          </div>
        </header>

        <section className="admin-login panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Administrador</p>
              <h2>Acceso interno</h2>
            </div>
            <span className="subtle">Separado de la pantalla cliente</span>
          </div>

          <p className="lead">Este panel no comparte sesión con el equipo cliente. Iniciá sesión solo si vas a administrar equipos, tickets y activación.</p>

          <form className="admin-login-form" onSubmit={handleSignIn}>
            <label>
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
            </label>
            <label>
              <span>Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <div className="button-row">
              <button className="btn btn-primary" type="submit" disabled={isBusy}>
                <KeyRound size={16} /> Ingresar
              </button>
            </div>
          </form>
        </section>

        {toast && <ToastBar toast={toast} />}
        <VersionFooter />
      </main>
    );
  }

  const counts = {
    devices: dashboard?.devices.length ?? 0,
    tickets: dashboard?.tickets.length ?? 0,
    diagnostics: dashboard?.diagnostics.length ?? 0,
    codes: dashboard?.pairingCodes.length ?? 0
  };

  return (
    <main className="app-shell admin-shell">
      <div className="app-shell__bg" />
      <div className="app-shell__scan" />
      <div className="app-shell__frame" />

      <header className="shell-header panel">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <h1>UnderDock Admin</h1>
            <p>Administración interna</p>
          </div>
        </div>

        <div className="status-strip">
          <StatusItem label="Sesión" value={session.email ?? 'Admin'} tone="neutral" />
          <StatusItem label="Versión" value={`v${APP_VERSION}`} tone="neutral" />
          <StatusItem label="Equipos" value={`${counts.devices}`} tone="neutral" />
        </div>

        <div className="header-actions">
          <button className="btn btn-ghost" onClick={handleRefreshAdmin} disabled={isBusy || isUpdating}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button className="btn btn-ghost btn-quiet" onClick={handleSignOutAdmin}>
            Salir
          </button>
        </div>
      </header>

      <section className="admin-grid">
        <section className="panel admin-summary">
          <div className="section-head">
            <div>
              <p className="eyebrow">Resumen</p>
              <h2>Centro de administración</h2>
            </div>
            <span className="subtle">{isBusy ? 'Procesando...' : 'Listo'}</span>
          </div>

          <div className="status-matrix admin-matrix">
            <Metric label="Equipos" value={`${counts.devices}`} />
            <Metric label="Tickets" value={`${counts.tickets}`} />
            <Metric label="Diagnósticos" value={`${counts.diagnostics}`} />
            <Metric label="Códigos" value={`${counts.codes}`} />
          </div>

          <div className="button-row">
            <button className="btn btn-primary" onClick={handleGeneratePairingCode} disabled={isBusy}>
              <Download size={16} /> Generar código
            </button>
            {updateResult?.status === 'available' && (
              <button className="btn btn-ghost" onClick={handleInstallUpdate} disabled={isUpdating}>
                <Download size={16} /> {isUpdating ? updateProgress || 'Instalando' : 'Actualizar app'}
              </button>
            )}
          </div>

          {generatedCode && (
            <div className="status-note">
              <ShieldCheck size={16} />
              <span>Código activo: {generatedCode.code} - vence {generatedCode.expiresAt}</span>
            </div>
          )}
        </section>

        <section className="panel admin-list">
          <div className="section-head">
            <div>
              <p className="eyebrow">Equipos</p>
              <h2>Actividad reciente</h2>
            </div>
          </div>
          <div className="admin-stack">
            {(dashboard?.devices ?? []).slice(0, 5).map((device) => (
              <div className="admin-row" key={device.id}>
                <div>
                  <strong>{device.displayName}</strong>
                  <p>{device.computerName} · {device.os}</p>
                </div>
                <span className="pill">{device.status}</span>
              </div>
            ))}
            {(dashboard?.tickets ?? []).slice(0, 5).map((ticket) => (
              <div className="admin-row" key={ticket.id}>
                <div>
                  <strong>{ticket.id}</strong>
                  <p>{ticket.issue}</p>
                </div>
                <span className="pill">{ticket.status}</span>
              </div>
            ))}
          </div>
        </section>
      </section>

      {toast && <ToastBar toast={toast} />}
      <VersionFooter />
    </main>
  );
}

function SystemStatusPanel({
  session,
  status,
  updateResult,
  isUpdating,
  updateProgress,
  onUpdateInstall
}: {
  session: AppSession | null;
  status: { version: string; lastDiagnostic: string };
  updateResult: UpdateResult | null;
  isUpdating: boolean;
  updateProgress: string;
  onUpdateInstall: () => void;
}) {
  return (
    <section className="panel status-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Estado del equipo</p>
          <h2>PC y salud</h2>
        </div>
        <span className="pill">{session ? 'Activa' : 'Sin sesión'}</span>
      </div>
      <div className="status-matrix">
        <Metric label="Equipo" value={session?.displayName ?? 'Sin sesión'} />
        <Metric label="Última revisión" value={status.lastDiagnostic} />
        <Metric label="Versión" value={`v${status.version}`} />
        <Metric label="Sesión" value={session ? 'Guardada' : 'No iniciada'} />
      </div>
      <div className="status-note">
        <ShieldCheck size={16} />
        <span>{session ? 'Sin problemas críticos' : 'Esperando inicio de sesión del cliente.'}</span>
      </div>
      {updateResult?.status === 'available' && (
        <div className="update-banner">
          <div>
            <strong>Actualización disponible</strong>
            <p>{isUpdating ? updateProgress || 'Actualizando...' : updateResult.notes}</p>
          </div>
          <button className="btn btn-primary" onClick={onUpdateInstall} disabled={isUpdating}>
            <Download size={16} /> {isUpdating ? updateProgress || 'Instalando' : 'Actualizar'}
          </button>
        </div>
      )}
    </section>
  );
}

function HomeDashboard({
  activeSection,
  onSelectSection,
  onOpenRemote,
  onCreateTicket,
  onQuickDiagnostic,
  onAdvancedDiagnostic,
  onOpenCleaner,
  showTicketForm
}: {
  activeSection: SectionId;
  onSelectSection: (section: SectionId) => void;
  onOpenRemote: () => void;
  onCreateTicket: () => void;
  onQuickDiagnostic: () => void;
  onAdvancedDiagnostic: () => void;
  onOpenCleaner: () => void;
  showTicketForm: boolean;
}) {
  return (
    <section className="panel dashboard-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Acciones</p>
          <h2>Centro de soporte</h2>
        </div>
        <span className="subtle">{showTicketForm ? 'Formulario abierto' : 'Vista principal'}</span>
      </div>
      <div className="action-grid">
        <PrimaryActionCard
          active={activeSection === 'remote'}
          icon={<Wifi size={22} />}
          title="Soporte remoto"
          description="Enviá una solicitud para que un técnico se conecte y revise tu PC."
          buttonLabel="Pedir soporte"
          stateLabel="Esperando técnico · Conectado · Disponible"
          onClick={() => {
            onSelectSection('remote');
            onOpenRemote();
          }}
        />
        <PrimaryActionCard
          active={activeSection === 'ticket'}
          icon={<TerminalSquare size={22} />}
          title="Crear ticket"
          description="Contá qué problema tenés y adjuntá detalles del equipo."
          buttonLabel="Abrir ticket"
          stateLabel="Formulario simple dentro del panel"
          onClick={() => {
            onSelectSection('ticket');
            onCreateTicket();
          }}
        />
        <PrimaryActionCard
          active={activeSection === 'quick'}
          icon={<CheckCircle2 size={22} />}
          title="Diagnóstico rápido"
          description="Revisa temperatura, memoria, disco, procesos y estado básico."
          buttonLabel="Ejecutar rápido"
          stateLabel="Resultado en chips claros"
          onClick={() => {
            onSelectSection('quick');
            onQuickDiagnostic();
          }}
        />
        <PrimaryActionCard
          active={activeSection === 'advanced'}
          icon={<Globe2 size={22} />}
          title="Diagnóstico avanzado"
          description="Genera un informe más completo para el técnico."
          buttonLabel="Ejecutar avanzado"
          stateLabel="Puede tardar más"
          onClick={() => {
            onSelectSection('advanced');
            onAdvancedDiagnostic();
          }}
        />
        <PrimaryActionCard
          active={activeSection === 'cleaner'}
          icon={<Trash2 size={22} />}
          title="Cleaner"
          description="Limpieza segura de temporales, caché y revisiones básicas."
          buttonLabel="Abrir cleaner"
          stateLabel="Análisis antes de limpiar"
          onClick={() => {
            onSelectSection('cleaner');
            onOpenCleaner();
          }}
        />
      </div>
    </section>
  );
}

function DetailPanel({
  activeSection,
  session,
  clientDashboard,
  remoteSession,
  ticketIssue,
  setTicketIssue,
  ticketCategory,
  setTicketCategory,
  ticketUrgency,
  setTicketUrgency,
  ticketDescription,
  setTicketDescription,
  showTicketForm,
  setShowTicketForm,
  quickChecks,
  quickDiagnostic,
  advancedDiagnostic,
  cleanerSelection,
  setCleanerSelection,
  isBusy,
  onRequestRemoteSupport,
  onCreateTicket,
  onRunQuickDiagnostic,
  onRunAdvancedDiagnostic,
  onCleanerAnalyze,
  onCleanerRun,
  onOpenRemote,
  onGoHome
}: {
  activeSection: SectionId;
  session: AppSession | null;
  clientDashboard: ClientDashboard | null;
  remoteSession: RemoteSession | null;
  ticketIssue: string;
  setTicketIssue: (value: string) => void;
  ticketCategory: string;
  setTicketCategory: (value: string) => void;
  ticketUrgency: Priority;
  setTicketUrgency: (value: Priority) => void;
  ticketDescription: string;
  setTicketDescription: (value: string) => void;
  showTicketForm: boolean;
  setShowTicketForm: (value: boolean) => void;
  quickChecks: QuickCheckItem[];
  quickDiagnostic: DiagnosticReport | null;
  advancedDiagnostic: { running: boolean; progress: string; summary: string; result: DiagnosticReport | null };
  cleanerSelection: {
    tempFiles: boolean;
    browserCache: boolean;
    recycleBin: boolean;
    oldLogs: boolean;
    startupReview: boolean;
  };
  setCleanerSelection: (value: {
    tempFiles: boolean;
    browserCache: boolean;
    recycleBin: boolean;
    oldLogs: boolean;
    startupReview: boolean;
  }) => void;
  isBusy: boolean;
  onRequestRemoteSupport: () => void;
  onCreateTicket: () => void;
  onRunQuickDiagnostic: () => void;
  onRunAdvancedDiagnostic: () => void;
  onCleanerAnalyze: () => void;
  onCleanerRun: () => void;
  onOpenRemote: () => void;
  onGoHome: () => void;
}) {
  return (
    <section className="panel detail-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Detalle</p>
          <h2>
            {activeSection === 'remote' && 'Soporte remoto'}
            {activeSection === 'ticket' && 'Crear ticket'}
            {activeSection === 'quick' && 'Diagnóstico rápido'}
            {activeSection === 'advanced' && 'Diagnóstico avanzado'}
            {activeSection === 'cleaner' && 'Cleaner'}
          </h2>
        </div>
        <button
          className="btn btn-ghost btn-mini"
          onClick={() => {
            setShowTicketForm(false);
            onGoHome();
          }}
        >
          Inicio
        </button>
      </div>

      {activeSection === 'remote' && (
        <div className="detail-block">
          <p className="lead">Solicitá asistencia remota sin salir de esta pantalla.</p>
          <div className="detail-meta">
            <div>
              <span>Estado</span>
              <strong>{remoteSession ? 'Conectado' : 'Disponible'}</strong>
            </div>
            <div>
              <span>Código de sesión</span>
              <strong>{remoteSession?.code ?? 'PENDIENTE'}</strong>
            </div>
          </div>
          <p className="detail-copy">
            {remoteSession?.instructions ?? 'Integración remota pendiente. Se mostrará el código cuando el técnico esté listo.'}
          </p>
          <div className="button-row">
            <button className="btn btn-primary" onClick={onRequestRemoteSupport} disabled={isBusy}>
              Pedir soporte
            </button>
            <button className="btn btn-ghost" onClick={onOpenRemote} disabled={isBusy}>
              Abrir herramienta remota
            </button>
          </div>
        </div>
      )}

      {activeSection === 'ticket' && (
        <div className="detail-block">
          <p className="lead">Formulario simple para que el técnico entienda el caso sin pérdida de tiempo.</p>
          <div className="field-grid">
            <label>
              <span>Categoría</span>
              <select value={ticketCategory} onChange={(event) => setTicketCategory(event.target.value)}>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Red">Red</option>
                <option value="Rendimiento">Rendimiento</option>
                <option value="Seguridad">Seguridad</option>
              </select>
            </label>
            <label>
              <span>Problema</span>
              <input value={ticketIssue} onChange={(event) => setTicketIssue(event.target.value)} />
            </label>
            <label>
              <span>Urgencia</span>
              <select value={ticketUrgency} onChange={(event) => setTicketUrgency(event.target.value as Priority)}>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </label>
            <label className="field-wide">
              <span>Descripción</span>
              <textarea
                value={ticketDescription}
                onChange={(event) => setTicketDescription(event.target.value)}
                placeholder="Contá qué pasa, cuándo ocurre y qué ya probaste."
              />
            </label>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" onClick={onCreateTicket} disabled={isBusy}>
              Enviar ticket
            </button>
            <button className="btn btn-ghost" onClick={() => setShowTicketForm(false)}>
              Volver a inicio
            </button>
          </div>
          <p className="detail-copy">Último ticket: {clientDashboard?.tickets[0]?.id ?? 'Sin tickets'}</p>
        </div>
      )}

      {activeSection === 'quick' && (
        <div className="detail-block">
          <p className="lead">Revisión corta para detectar si hay algo fuera de rango.</p>
          <div className="button-row">
            <button className="btn btn-primary" onClick={onRunQuickDiagnostic} disabled={isBusy}>
              Ejecutar diagnóstico rápido
            </button>
          </div>
          <div className="chip-grid">
            {quickChecks.map((item) => (
              <StatusChip key={item.id} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </div>
          {quickDiagnostic && (
            <p className="detail-copy">
              Última revisión: {quickDiagnostic.generatedAt || 'Sin fecha'}.
            </p>
          )}
        </div>
      )}

      {activeSection === 'advanced' && (
        <div className="detail-block">
          <p className="lead">Informe más completo para el técnico. Puede tardar unos minutos.</p>
          <div className="progress-box">
            <span>{advancedDiagnostic.running ? advancedDiagnostic.progress || 'Procesando...' : advancedDiagnostic.summary}</span>
            <strong>{advancedDiagnostic.running ? 'En progreso' : 'Listo'}</strong>
          </div>
          <div className="button-row">
            <button className="btn btn-primary" onClick={onRunAdvancedDiagnostic} disabled={isBusy || advancedDiagnostic.running}>
              Ejecutar diagnóstico avanzado
            </button>
          </div>
          {advancedDiagnostic.result && (
            <div className="detail-copy">
              {advancedDiagnostic.result.temperatureNote ?? 'Informe avanzado generado correctamente.'}
            </div>
          )}
        </div>
      )}

      {activeSection === 'cleaner' && (
        <div className="detail-block">
          <p className="lead">Opciones seguras. No limpia nada sin revisar primero.</p>
          <div className="checklist">
            <CheckOption
              label="Archivos temporales"
              checked={cleanerSelection.tempFiles}
              onChange={(checked) => setCleanerSelection({ ...cleanerSelection, tempFiles: checked })}
            />
            <CheckOption
              label="Caché de navegador"
              checked={cleanerSelection.browserCache}
              onChange={(checked) => setCleanerSelection({ ...cleanerSelection, browserCache: checked })}
            />
            <CheckOption
              label="Papelera"
              checked={cleanerSelection.recycleBin}
              onChange={(checked) => setCleanerSelection({ ...cleanerSelection, recycleBin: checked })}
            />
            <CheckOption
              label="Logs antiguos"
              checked={cleanerSelection.oldLogs}
              onChange={(checked) => setCleanerSelection({ ...cleanerSelection, oldLogs: checked })}
            />
            <CheckOption
              label="Revisión de inicio de Windows"
              checked={cleanerSelection.startupReview}
              onChange={(checked) => setCleanerSelection({ ...cleanerSelection, startupReview: checked })}
            />
          </div>
          <div className="button-row">
            <button className="btn btn-ghost" onClick={onCleanerAnalyze} disabled={isBusy}>
              Analizar primero
            </button>
            <button className="btn btn-primary" onClick={onCleanerRun} disabled={isBusy}>
              Limpiar selección
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PrimaryActionCard({
  active,
  icon,
  title,
  description,
  buttonLabel,
  stateLabel,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  stateLabel: string;
  onClick: () => void;
}) {
  return (
    <button className={`action-card ${active ? 'is-active' : ''}`} onClick={onClick}>
      <div className="action-card__icon">{icon}</div>
      <div className="action-card__body">
        <strong>{title}</strong>
        <p>{description}</p>
        <span>{stateLabel}</span>
      </div>
      <div className="action-card__footer">
        <span>{buttonLabel}</span>
      </div>
    </button>
  );
}

function StatusItem({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'neutral' }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  return (
    <div className={`status-chip ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CheckOption({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check-option">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
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

function VersionFooter() {
  return <footer className="version-footer">UnderDock v{APP_VERSION}</footer>;
}

export default App;
