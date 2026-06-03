import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { appBackend } from './lib/backend';
import type {
  AdminDashboard,
  AppSession,
  ClientDashboard,
  DiagnosticRecord,
  PairingCodeRecord,
  Priority,
  ReleaseRecord,
  TicketRecord,
  UpdateResult
} from './lib/domain';
import { APP_VERSION } from './lib/domain';
import { DiagnosticReport, runQuickDiagnostic } from './lib/diagnostics';
import { openRemoteTool, RemoteSession } from './lib/support';
import { checkForUpdates as checkNativeUpdates, installLatestUpdate as installNativeUpdate } from './lib/updates';
import { getAgentStatus, runAgentAction } from './lib/agent';
import { AdminDevicesPage } from './components/AdminDevicesPage';
import { AdminLayout } from './components/AdminLayout';
import { AdminLogin } from './components/AdminLogin';
import { ClientActivation } from './components/ClientActivation';
import { ClientHome } from './components/ClientHome';

type Toast = { message: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' } | null;
type AppView = 'client' | 'admin';
type SectionId = 'remote' | 'ticket' | 'quick' | 'advanced' | 'cleaner';
type AdminPage = 'devices' | 'tickets' | 'sessions' | 'diagnostics' | 'settings';

type QuickCheckItem = {
  id: string;
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
};

type HealthSummary = {
  version: string;
  lastDiagnostic: string;
  machine: string;
  cpu: string;
  cpuTone: 'ok' | 'warn' | 'neutral' | 'danger';
  temp: string;
  tempTone: 'ok' | 'warn' | 'neutral' | 'danger';
  ram: string;
  ramTone: 'ok' | 'warn' | 'neutral' | 'danger';
  disk: string;
  diskTone: 'ok' | 'warn' | 'neutral' | 'danger';
  security: string;
  securityTone: 'ok' | 'warn' | 'neutral' | 'danger';
  stability: string;
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
  const [agentResult, setAgentResult] = useState<unknown>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('quick');
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [pairingCode, setPairingCode] = useState('DEMO-PAIR');
  const [deviceName, setDeviceName] = useState('');
  const [clientName, setClientName] = useState('');
  const [ticketIssue, setTicketIssue] = useState('Mi PC necesita asistencia.');
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
        if (alive) {
          setSession(restored);
          if (restored?.displayName) setDeviceName(restored.displayName);
        }
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
        await getAgentStatus();
      } catch {
        if (!alive) return;
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
        notify(`Actualizacion disponible: ${result.nextVersion}.`, 'warn');
      } else if (result.status === 'error') {
        notify(result.notes, 'danger');
      } else {
        notify(result.notes || 'Todo al dia.', 'ok');
      }
    } catch {
      notify('No se pudo comprobar actualizaciones.', 'danger');
    }
  }

  async function handleRequestRemoteSupport() {
    const deviceId = session?.deviceId ?? clientDashboard?.device?.id;
    const deviceLabel = deviceName || clientDashboard?.device?.displayName || session?.displayName || 'Equipo activo';

    if (!session?.deviceToken || !deviceId) {
      notify('Activar el equipo primero.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      const issueSummary = [ticketCategory, ticketIssue, ticketDescription].filter(Boolean).join(' - ');
      const ticket = await appBackend.createTicket(
        {
          deviceId,
          issue: issueSummary,
          clientName: deviceLabel,
          priority: ticketUrgency
        },
        session.deviceToken
      );

      const supportSession = await appBackend.createRemoteSession(
        { deviceId, ticketId: ticket.id },
        session.deviceToken
      );

      setRemoteSession({
        code: supportSession.code,
        expiresInMinutes: supportSession.expiresInMinutes,
        instructions: supportSession.instructions
      });
      setActiveSection('remote');
      await refreshClient(session.deviceToken);
      await handleOpenRemote();
      notify(`Ticket ${ticket.id} listo para remoto.`, 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo pedir soporte.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateTicket() {
    const deviceId = session?.deviceId ?? clientDashboard?.device?.id;
    const deviceLabel = deviceName || clientDashboard?.device?.displayName || session?.displayName || 'Equipo activo';

    if (!session?.deviceToken || !deviceId) {
      notify('Activar el equipo primero.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      const issueSummary = [ticketCategory, ticketIssue, ticketDescription].filter(Boolean).join(' - ');
      const ticket = await appBackend.createTicket(
        {
          deviceId,
          issue: issueSummary,
          clientName: deviceLabel,
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

  async function handleActivateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const computerName = window.navigator.platform || 'Windows';
      const userName = clientName.trim() || window.navigator.userAgent || 'Usuario';
      const result = await appBackend.registerClient({
        pairingCode,
        deviceName: deviceName.trim() || 'Equipo',
        computerName,
        userName,
        os: window.navigator.platform || 'Windows',
        platform: window.navigator.platform || 'desktop'
      });

      setSession(result.session);
      setDeviceName(result.device.displayName);
      setClientName(result.device.userName);
      setShowTicketForm(false);
      setActiveSection('quick');
      notify(`Equipo vinculado: ${result.device.displayName}`, 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo activar el equipo.', 'danger');
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
        notify('Diagnostico rapido guardado.', 'ok');
        return;
      }

      notify('Diagnostico rapido completado.', 'ok');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo ejecutar el diagnostico.', 'danger');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRunAdvancedDiagnostic() {
    setAdvancedDiagnostic((current) => ({
      ...current,
      running: true,
      progress: 'Preparando recoleccion avanzada...',
      summary: 'Este proceso puede tardar un poco mas.',
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
        summary: 'Generado para envio al tecnico.',
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
      notify('Diagnostico avanzado completado.', 'ok');
    } catch (error) {
      setAdvancedDiagnostic((current) => ({
        ...current,
        running: false,
        progress: '',
        summary: 'No se pudo completar el informe.',
        result: null
      }));
      notify(error instanceof Error ? error.message : 'No se pudo ejecutar el diagnostico avanzado.', 'danger');
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
      notify(error instanceof Error ? error.message : 'No se pudo limpiar la seleccion.', 'danger');
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

  const latestDiagnostic = clientDashboard?.diagnostics[0] ?? null;
  const healthReport = quickDiagnostic ?? diagnostic ?? null;
  const healthSummary = useMemo<HealthSummary>(() => {
    const report = healthReport;
    const cpuTemp = report?.maxTemperatureC ?? null;
    const ramUsed = report ? Math.max(0, report.ramTotalGb - report.ramFreeGb) : null;
    const ramUsage = report && report.ramTotalGb > 0 && ramUsed != null ? Math.round((ramUsed / report.ramTotalGb) * 100) : null;
    const diskUsage = report && report.systemDriveTotalGb > 0
      ? Math.round(((report.systemDriveTotalGb - report.systemDriveFreeGb) / report.systemDriveTotalGb) * 100)
      : null;

    return {
      version: APP_VERSION,
      lastDiagnostic: latestDiagnostic?.generatedAt ?? 'Sin revision',
      machine: report?.computerName ?? session?.displayName ?? 'Equipo activo',
      cpu: report?.cpu ?? 'Sin dato',
      cpuTone: report?.cpu ? 'ok' : 'neutral',
      temp: cpuTemp == null ? 'Pendiente' : `${cpuTemp.toFixed(1)} °C`,
      tempTone: cpuTemp == null ? 'neutral' : cpuTemp >= 85 ? 'danger' : cpuTemp >= 70 ? 'warn' : 'ok',
      ram: report && ramUsed != null ? `${ramUsed.toFixed(1)} GB usados · ${ramUsage ?? 0}%` : 'Sin dato',
      ramTone: ramUsage == null ? 'neutral' : ramUsage >= 90 ? 'danger' : ramUsage >= 75 ? 'warn' : 'ok',
      disk: report ? `${report.systemDriveFreeGb.toFixed(0)} GB libres · ${diskUsage ?? 0}% usado` : 'Sin dato',
      diskTone: diskUsage == null ? 'neutral' : diskUsage >= 90 ? 'danger' : diskUsage >= 80 ? 'warn' : 'ok',
      security: report?.defenderStatus ?? 'Pendiente',
      securityTone: report?.defenderStatus?.toLowerCase().includes('desactiv') ? 'danger' : report?.defenderStatus ? 'ok' : 'neutral',
      stability: report?.pendingReboot ? 'Reinicio pendiente' : report ? 'Sin alertas criticas' : 'Esperando diagnostico'
    };
  }, [healthReport, latestDiagnostic, session?.displayName]);

  const quickChecks = useMemo<QuickCheckItem[]>(() => {
    return [
      { id: 'cpu', label: 'CPU', value: healthSummary.cpu, tone: healthSummary.cpuTone },
      { id: 'temp', label: 'Temperatura', value: healthSummary.temp, tone: healthSummary.tempTone },
      { id: 'ram', label: 'RAM', value: healthSummary.ram, tone: healthSummary.ramTone },
      { id: 'disk', label: 'Disco', value: healthSummary.disk, tone: healthSummary.diskTone },
      { id: 'defender', label: 'Seguridad', value: healthSummary.security, tone: healthSummary.securityTone },
      { id: 'stability', label: 'Estado', value: healthSummary.stability, tone: healthSummary.stability.includes('Reinicio') ? 'warn' : healthReport ? 'ok' : 'neutral' }
    ];
  }, [healthReport, healthSummary]);

  if (booting) {
    return <ShellBoot label="Iniciando cliente" subtitle="Cargando estado, diagnosticos y soporte remoto." />;
  }

  if (!session) {
    return (
      <ClientActivation
        pairingCode={pairingCode}
        setPairingCode={setPairingCode}
        deviceName={deviceName}
        setDeviceName={setDeviceName}
        clientName={clientName}
        setClientName={setClientName}
        isBusy={isBusy}
        onSubmit={handleActivateClient}
      />
    );
  }

  return (
    <ClientHome
      session={session}
      clientDashboard={clientDashboard}
      remoteSession={remoteSession}
      updateResult={updateResult}
      isUpdating={isUpdating}
      updateProgress={updateProgress}
      isBusy={isBusy}
      activeSection={activeSection}
      showTicketForm={showTicketForm}
      setShowTicketForm={setShowTicketForm}
      ticketIssue={ticketIssue}
      setTicketIssue={setTicketIssue}
      ticketCategory={ticketCategory}
      setTicketCategory={setTicketCategory}
      ticketUrgency={ticketUrgency}
      setTicketUrgency={setTicketUrgency}
      ticketDescription={ticketDescription}
      setTicketDescription={setTicketDescription}
      cleanerSelection={cleanerSelection}
      setCleanerSelection={setCleanerSelection}
      quickChecks={quickChecks}
      quickDiagnostic={quickDiagnostic ?? diagnostic}
      advancedDiagnostic={advancedDiagnostic}
      onSelectSection={setActiveSection}
      onRequestRemoteSupport={handleRequestRemoteSupport}
      onCreateTicket={handleCreateTicket}
      onRunQuickDiagnostic={handleRunQuickDiagnostic}
      onRunAdvancedDiagnostic={handleRunAdvancedDiagnostic}
      onCleanerAnalyze={handleCleanerAnalyze}
      onCleanerRun={handleCleanerRun}
      onOpenRemote={handleOpenRemote}
      onRefresh={handleRefresh}
      onSignOut={handleSignOut}
      onInstallUpdate={handleNativeUpdateInstall}
      agentResult={agentResult}
    />
  );
}

function AdminApp() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [clientSessionActive, setClientSessionActive] = useState(false);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [email, setEmail] = useState('admin@underdock.local');
  const [orgName, setOrgName] = useState('UnderDock Demo');
  const [password, setPassword] = useState('');
  const [generatedCode, setGeneratedCode] = useState<PairingCodeRecord | null>(null);
  const [selectedPage, setSelectedPage] = useState<AdminPage>('devices');
  const [searchQuery, setSearchQuery] = useState('');

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
    let alive = true;
    (async () => {
      try {
        const restored = await appBackend.bootstrap();
        if (alive) setClientSessionActive(Boolean(restored?.deviceToken));
      } catch {
        if (alive) setClientSessionActive(false);
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
      const result = await appBackend.signInAdmin(email.trim(), password, orgName.trim());
      setSession(result.session);
      setPassword('');
      notify('Acceso admin concedido.', 'ok');
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

  const counts = {
    devices: dashboard?.devices.length ?? 0,
    tickets: dashboard?.tickets.length ?? 0,
    diagnostics: dashboard?.diagnostics.length ?? 0,
    codes: dashboard?.pairingCodes.length ?? 0
  };

  const filteredDevices = (dashboard?.devices ?? []).filter((device) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [device.displayName, device.computerName, device.userName, device.orgName, device.status, device.os].some((value) =>
      value.toLowerCase().includes(q)
    );
  });

  const filteredTickets = (dashboard?.tickets ?? []).filter((ticket) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [ticket.id, ticket.issue, ticket.status, ticket.clientName].some((value) => value.toLowerCase().includes(q));
  });

  const filteredDiagnostics = (dashboard?.diagnostics ?? []).filter((diagnostic) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [diagnostic.id, diagnostic.deviceId].some((value) => value.toLowerCase().includes(q));
  });

  if (!session) {
    return (
      <AdminLogin
        email={email}
        setEmail={setEmail}
        orgName={orgName}
        setOrgName={setOrgName}
        password={password}
        setPassword={setPassword}
        onSubmit={handleSignIn}
        isBusy={isBusy}
        clientStatusLabel={clientSessionActive ? 'Sesion cliente activa' : 'Sesion cliente inactiva'}
        adminStatusLabel="Admin no iniciado"
      />
    );
  }

  return (
    <AdminLayout
      session={session}
      selectedPage={selectedPage}
      setSelectedPage={setSelectedPage}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      isBusy={isBusy}
      updateResult={updateResult}
      isUpdating={isUpdating}
      updateProgress={updateProgress}
      counts={counts}
      onRefresh={handleRefreshAdmin}
      onSignOut={handleSignOutAdmin}
      onInstallUpdate={handleInstallUpdate}
    >
      {selectedPage === 'devices' && (
        <AdminDevicesPage
          dashboard={dashboard}
          filteredDevices={filteredDevices}
          generatedCode={generatedCode}
          isBusy={isBusy}
          onGeneratePairingCode={handleGeneratePairingCode}
          onCopyCode={async () => {
            if (generatedCode?.code) {
              await copyText(generatedCode.code);
              notify('Codigo copiado.', 'ok');
            }
          }}
          onOpenRemoteTool={async () => {
            const message = await openRemoteTool();
            notify(message, 'neutral');
          }}
          onShowDiagnostics={() => setSelectedPage('diagnostics')}
        />
      )}

      {selectedPage === 'tickets' && (
        <SimpleAdminPage
          title="Tickets"
          eyebrow="Mesa de ayuda"
          description="Lista directa para revisar estados y priorizar casos."
          rows={filteredTickets.map((ticket) => ({
            primary: ticket.id,
            secondary: `${ticket.clientName} · ${ticket.priority}`,
            meta: ticket.status
          }))}
        />
      )}

      {selectedPage === 'sessions' && (
        <SimpleAdminPage
          title="Sesiones remotas"
          eyebrow="Soporte remoto"
          description="Sesiones activas y referencias del ticket asociado."
          rows={(dashboard?.tickets ?? [])
            .filter((ticket) => Boolean(ticket.remoteCode))
            .map((ticket) => ({
              primary: ticket.remoteCode ?? ticket.id,
              secondary: ticket.issue,
              meta: ticket.status
            }))}
        />
      )}

      {selectedPage === 'diagnostics' && (
        <SimpleAdminPage
          title="Diagnosticos"
          eyebrow="Salud"
          description="Informe compacto de los equipos con actividad reciente."
          rows={filteredDiagnostics.map((diagnostic) => ({
            primary: diagnostic.deviceId,
            secondary: diagnostic.generatedAt,
            meta: diagnostic.id
          }))}
        />
      )}

      {selectedPage === 'settings' && (
        <div className="panel stack-panel">
          <div className="stack-panel__head">
            <div>
              <p className="eyebrow">Configuracion</p>
              <h2>Panel admin</h2>
            </div>
          </div>
          <div className="settings-grid">
            <InfoCard label="Equipo" value={session.orgName ?? 'Sin equipo'} />
            <InfoCard label="Email" value={session.email ?? 'Admin'} />
            <InfoCard label="Version" value={`v${APP_VERSION}`} />
            <InfoCard label="Equipos" value={`${counts.devices}`} />
          </div>
          {updateResult?.status === 'available' && (
            <div className="subtle-card">
              <strong>Actualizacion disponible</strong>
              <p>{updateResult.notes}</p>
              <button className="btn btn-primary" onClick={handleInstallUpdate} disabled={isUpdating}>
                <Download size={16} /> {isUpdating ? updateProgress || 'Aplicando' : 'Actualizar y reiniciar'}
              </button>
            </div>
          )}
        </div>
      )}

      {toast && <ToastBar toast={toast} />}
      <VersionFooter />
    </AdminLayout>
  );
}

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function ShellBoot({ label, subtitle }: { label: string; subtitle: string }) {
  return (
    <main className="page-shell page-shell--centered">
      <div className="shell-backdrop" />
      <section className="panel boot-panel">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <p className="eyebrow">{label}</p>
            <h1>UnderDock</h1>
            <p>{subtitle}</p>
          </div>
        </div>
      </section>
      <VersionFooter />
    </main>
  );
}

function SimpleAdminPage({
  title,
  eyebrow,
  description,
  rows
}: {
  title: string;
  eyebrow: string;
  description: string;
  rows: Array<{ primary: string; secondary: string; meta: string }>;
}) {
  return (
    <section className="panel stack-panel">
      <div className="stack-panel__head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span className="subtle">{description}</span>
      </div>
      <div className="row-list">
        {rows.length === 0 ? (
          <div className="empty-state">Sin registros para mostrar.</div>
        ) : (
          rows.map((row) => (
            <div className="row-item" key={`${row.primary}-${row.meta}`}>
              <div>
                <strong>{row.primary}</strong>
                <p>{row.secondary}</p>
              </div>
              <span className="pill">{row.meta}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ToastBar({ toast }: { toast: NonNullable<Toast> }) {
  return (
    <div className={`toast toast--${toast.tone ?? 'neutral'}`}>
      <Bell size={15} />
      {toast.message}
    </div>
  );
}

function VersionFooter() {
  return <footer className="version-footer">UnderDock v{APP_VERSION}</footer>;
}

export default App;
