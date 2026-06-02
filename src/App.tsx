import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  Ellipsis,
  Globe2,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Wifi
} from 'lucide-react';
import { appBackend, backendConfig } from './lib/backend';
import type {
  AppSession,
  ClientDashboard,
  DiagnosticRecord,
  Priority,
  TicketRecord,
  UpdateResult
} from './lib/domain';
import { APP_VERSION, STORAGE_KEYS } from './lib/domain';
import { DiagnosticReport, runQuickDiagnostic } from './lib/diagnostics';
import { checkForUpdates as checkNativeUpdates, installLatestUpdate as installNativeUpdate } from './lib/updates';
import { openRemoteTool, RemoteSession } from './lib/support';
import { AgentActionResult, AgentStatus, getAgentStatus, runAgentAction } from './lib/agent';

type Toast = { message: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' } | null;
type SectionId = 'remote' | 'ticket' | 'quick' | 'advanced' | 'cleaner';

type QuickCheckItem = {
  id: string;
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
};

function App() {
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
  const [activeSection, setActiveSection] = useState<SectionId>('remote');
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
      if (result.status !== 'available') return;
      try {
        setIsUpdating(true);
        setUpdateProgress('0%');
        const installed = await installNativeUpdate((progress) => {
          if (alive) setUpdateProgress(progress);
        });
        if (alive) setUpdateResult(installed);
      } finally {
        if (alive) {
          setIsUpdating(false);
          setUpdateProgress('');
        }
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
      setActiveSection('remote');
      notify('Sesion cerrada.', 'neutral');
    });
  }

  async function handleRefresh() {
    if (!session?.deviceToken) {
      notify('No hay un equipo activo para actualizar.', 'warn');
      return;
    }

    await refreshClient(session.deviceToken);
    try {
      const status = await getAgentStatus();
      setAgentStatus(status);
    } catch {
      setAgentStatus(null);
    }
    notify('Estado actualizado.', 'ok');
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
    if (!session?.deviceToken) {
      notify('Necesitas un equipo activo para correr el diagnóstico.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      const report = await runQuickDiagnostic();
      setQuickDiagnostic(report);
      setDiagnostic(report);
      await appBackend.saveDiagnostic(
        {
          deviceId: session.deviceId ?? '',
          payload: report as unknown as Record<string, unknown>
        },
        session.deviceToken
      );
      await refreshClient(session.deviceToken);
      setActiveSection('quick');
      notify('Diagnóstico rápido guardado.', 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo ejecutar el diagnóstico.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRunAdvancedDiagnostic() {
    if (!session?.deviceToken) {
      notify('Necesitas un equipo activo para el diagnóstico avanzado.', 'warn');
      return;
    }

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
      await appBackend.saveDiagnostic(
        {
          deviceId: session.deviceId ?? '',
          payload: enriched as unknown as Record<string, unknown>
        },
        session.deviceToken
      );
      await refreshClient(session.deviceToken);
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
    const latestTicket = clientDashboard?.tickets[0];
    const remoteState = remoteSession
      ? 'Conectado'
      : latestTicket?.status === 'nuevo'
        ? 'Esperando técnico'
        : 'Disponible';
    return {
      online: session ? 'Online' : 'Sin sesión',
      version: APP_VERSION,
      lastDiagnostic: latestDiagnostic?.generatedAt ?? 'Sin revisión',
      remoteState
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
          <StatusItem label="Estado del equipo" value={status.online} tone={session ? 'ok' : 'warn'} />
          <StatusItem label="Versión" value={`v${status.version}`} tone="neutral" />
          <StatusItem label="Última revisión" value={status.lastDiagnostic} tone="neutral" />
        </div>

        <div className="header-actions">
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={isBusy || isUpdating}>
            <RefreshCw size={16} /> Actualizar
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

        <ActivityPanel
          clientDashboard={clientDashboard}
          remoteSession={remoteSession}
          quickDiagnostic={quickDiagnostic ?? diagnostic}
          agentStatus={agentStatus}
          agentResult={agentResult}
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
        />
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
  status: { online: string; version: string; lastDiagnostic: string; remoteState: string };
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
          <h2>Centro de control</h2>
        </div>
        <span className="pill">{status.remoteState}</span>
      </div>
      <div className="status-matrix">
        <Metric label="Equipo" value={session?.displayName ?? 'Sin sesión'} />
        <Metric label="Online" value={status.online} />
        <Metric label="Última revisión" value={status.lastDiagnostic} />
        <Metric label="Versión" value={`v${status.version}`} />
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
          <p className="eyebrow">Inicio</p>
          <h2>Todo en un solo panel</h2>
        </div>
        <span className="subtle">{showTicketForm ? 'Formulario abierto' : 'Panel principal'}</span>
      </div>
      <div className="action-grid">
        <PrimaryActionCard
          active={activeSection === 'remote'}
          icon={<Wifi size={22} />}
          title="Soporte remoto"
          description="Enviá una solicitud para que un técnico se conecte y revise tu PC."
          buttonLabel="Pedir soporte"
          stateLabel="Esperando técnico / Conectado / Disponible"
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
  onOpenRemote
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
        <button className="btn btn-ghost btn-mini" onClick={() => setShowTicketForm(false)}>
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
            <button className="btn btn-ghost" onClick={onOpenRemote}>
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

function ActivityPanel({
  clientDashboard,
  remoteSession,
  quickDiagnostic,
  agentStatus,
  agentResult
}: {
  clientDashboard: ClientDashboard | null;
  remoteSession: RemoteSession | null;
  quickDiagnostic: DiagnosticRecord | DiagnosticReport | null;
  agentStatus: AgentStatus | null;
  agentResult: AgentActionResult | null;
}) {
  const latestTicket = clientDashboard?.tickets[0];
  return (
    <aside className="panel activity-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Actividad reciente</p>
          <h2>Historial útil</h2>
        </div>
        <Ellipsis size={18} className="muted-icon" />
      </div>
      <div className="activity-list">
        <ActivityRow title="Último diagnóstico" value={quickDiagnostic ? 'Guardado' : 'Sin datos'} meta={clientDashboard?.diagnostics[0]?.generatedAt ?? 'Pendiente'} tone={quickDiagnostic ? 'ok' : 'neutral'} />
        <ActivityRow title="Último ticket" value={latestTicket?.id ?? 'Sin tickets'} meta={latestTicket?.issue ?? 'Todavía no hay casos'} tone={latestTicket ? 'warn' : 'neutral'} />
        <ActivityRow title="Última limpieza" value={agentResult?.ok ? 'Completada' : 'Pendiente'} meta={agentResult?.message ?? 'Sin ejecución reciente'} tone={agentResult?.ok ? 'ok' : 'neutral'} />
        <ActivityRow title="Soporte remoto" value={remoteSession ? 'Activo' : 'Disponible'} meta={remoteSession?.code ?? 'Sin sesión'} tone={remoteSession ? 'ok' : 'neutral'} />
      </div>
      <div className="activity-foot">
        <div>
          <span>Estado general</span>
          <strong>{agentStatus?.mode ?? 'standby'}</strong>
        </div>
        <div>
          <span>Red</span>
          <strong>{clientDashboard?.device?.platform ?? 'windows'}</strong>
        </div>
      </div>
    </aside>
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

function ActivityRow({
  title,
  value,
  meta,
  tone
}: {
  title: string;
  value: string;
  meta: string;
  tone: 'ok' | 'warn' | 'neutral';
}) {
  return (
    <div className="activity-row">
      <div className="activity-row__icon">
        {tone === 'ok' ? <CheckCircle2 size={18} /> : tone === 'warn' ? <CircleAlert size={18} /> : <Clock3 size={18} />}
      </div>
      <div className="activity-row__body">
        <strong>{title}</strong>
        <p>{meta}</p>
      </div>
      <span className={`activity-tag ${tone}`}>{value}</span>
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

function VersionFooter() {
  return <footer className="version-footer">UnderDock v{APP_VERSION}</footer>;
}

export default App;
