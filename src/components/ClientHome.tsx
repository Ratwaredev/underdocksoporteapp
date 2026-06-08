import {
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Wifi
} from 'lucide-react';
import type {
  AppSession,
  ClientDashboard,
  DiagnosticRecord,
  Priority,
  UpdateResult
} from '../lib/domain';
import { CustomTitlebar } from './CustomTitlebar';
import type { ReactNode, RefObject } from 'react';

type SectionId = 'remote' | 'ticket' | 'quick' | 'advanced' | 'cleaner';

type QuickCheckItem = {
  id: string;
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
};

export function ClientHome({
  session,
  clientDashboard,
  remoteSession,
  updateResult,
  isUpdating,
  updateProgress,
  isBusy,
  activeSection,
  showTicketForm,
  setShowTicketForm,
  ticketIssue,
  setTicketIssue,
  ticketCategory,
  setTicketCategory,
  ticketUrgency,
  setTicketUrgency,
  ticketDescription,
  setTicketDescription,
  cleanerSelection,
  setCleanerSelection,
  quickChecks,
  quickDiagnostic,
  advancedDiagnostic,
  onSelectSection,
  onRequestRemoteSupport,
  onCreateTicket,
  onRunQuickDiagnostic,
  onRunAdvancedDiagnostic,
  onCleanerAnalyze,
  onCleanerRun,
  onOpenRemote,
  onRefresh,
  onSignOut,
  onInstallUpdate,
  agentResult,
  detailRef,
  canReturnToAdmin,
  onReturnToAdmin
}: {
  session: AppSession;
  clientDashboard: ClientDashboard | null;
  remoteSession: { code: string; expiresInMinutes: number; instructions: string } | null;
  updateResult: UpdateResult | null;
  isUpdating: boolean;
  updateProgress: string;
  isBusy: boolean;
  activeSection: SectionId;
  showTicketForm: boolean;
  setShowTicketForm: (value: boolean) => void;
  ticketIssue: string;
  setTicketIssue: (value: string) => void;
  ticketCategory: string;
  setTicketCategory: (value: string) => void;
  ticketUrgency: Priority;
  setTicketUrgency: (value: Priority) => void;
  ticketDescription: string;
  setTicketDescription: (value: string) => void;
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
  quickChecks: QuickCheckItem[];
  quickDiagnostic: DiagnosticRecord | null | DiagnosticReportLike;
  advancedDiagnostic: { running: boolean; progress: string; summary: string; result: DiagnosticReportLike | null };
  onSelectSection: (section: SectionId) => void;
  onRequestRemoteSupport: () => void;
  onCreateTicket: () => void;
  onRunQuickDiagnostic: () => void;
  onRunAdvancedDiagnostic: () => void;
  onCleanerAnalyze: () => void;
  onCleanerRun: () => void;
  onOpenRemote: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onInstallUpdate: () => void;
  agentResult: unknown;
  detailRef: RefObject<HTMLElement | null>;
  canReturnToAdmin: boolean;
  onReturnToAdmin: () => void;
}) {
  return (
    <main className="page-shell">
      <div className="shell-backdrop" />
      <CustomTitlebar
        title="UnderDock"
        subtitle="Soporte tecnico"
        status={session.orgName ?? 'Cliente activo'}
        rightSlot={
          <div className="titlebar__actions">
            {canReturnToAdmin && (
              <button className="btn btn-ghost btn-mini" onClick={onReturnToAdmin}>
                Volver al panel
              </button>
            )}
            <button className="btn btn-ghost btn-mini" onClick={onRefresh}>
              <RefreshCw size={14} /> Actualizar
            </button>
            <button className="btn btn-ghost btn-mini" onClick={onSignOut}>
              Salir
            </button>
          </div>
        }
      />

      <section className="client-workspace">
        <section className="panel client-summary">
          <div className="client-summary__top">
            <div className="client-summary__identity">
              <p className="eyebrow">Salud de la PC</p>
              <h2>{clientDashboard?.device.displayName ?? session.displayName ?? 'Equipo activo'}</h2>
              <span className="subtle">{clientDashboard?.device.os ?? 'Windows - Win32'} · {session.orgName ?? 'Cliente'}</span>
            </div>
            <div className="summary-strip">
              {quickChecks.map((item) => (
                <InfoMetric key={item.id} label={item.label} value={item.value} tone={item.tone} compact />
              ))}
            </div>
            <div className="status-band status-band--compact">
              <span>
                <ShieldCheck size={14} /> Ultima revision: {clientDashboard?.diagnostics[0]?.generatedAt ?? 'Sin revision'}
              </span>
            </div>
          </div>
        </section>

        <section className="panel client-actions">
          <div className="stack-panel__head">
            <div>
              <p className="eyebrow">Acciones</p>
              <h2>Soporte</h2>
            </div>
            <span className="subtle">{showTicketForm ? 'Ticket' : 'Principal'}</span>
          </div>

          <div className="action-grid action-grid--rail">
            <ActionCard
              active={activeSection === 'remote'}
              icon={<Wifi size={20} />}
              title="Soporte remoto"
              description="Abrir ayuda."
              onClick={() => {
                onSelectSection('remote');
                onRequestRemoteSupport();
              }}
            />
            <ActionCard
              active={activeSection === 'ticket'}
              icon={<TerminalSquare size={20} />}
              title="Crear ticket"
              description="Nuevo caso."
              onClick={() => {
                onSelectSection('ticket');
                onCreateTicket();
              }}
            />
            <ActionCard
              active={activeSection === 'quick'}
              icon={<CheckCircle2 size={20} />}
              title="Diagnostico rapido"
              description="Chequeo corto."
              onClick={() => {
                onSelectSection('quick');
                onRunQuickDiagnostic();
              }}
            />
            <ActionCard
              active={activeSection === 'advanced'}
              icon={<CheckCircle2 size={20} />}
              title="Diagnostico avanzado"
              description="Informe largo."
              onClick={() => {
                onSelectSection('advanced');
                onRunAdvancedDiagnostic();
              }}
            />
            <ActionCard
              active={activeSection === 'cleaner'}
              icon={<Trash2 size={20} />}
              title="Cleaner"
              description="Limpieza."
              onClick={() => {
                onSelectSection('cleaner');
                onCleanerAnalyze();
              }}
            />
          </div>
          <p className="detail-copy detail-copy--muted">
            Las tarjetas solo activan la seccion. Las acciones reales quedan abajo para evitar clicks accidentales.
          </p>
        </section>

        <section className="panel client-detail" ref={detailRef}>
          <div className="detail-head">
            <div>
              <p className="eyebrow">Activa</p>
              <h2>{detailTitle(activeSection)}</h2>
            </div>
            <span className="subtle">Toca una tarjeta.</span>
          </div>

          {activeSection === 'remote' && (
            <DetailStack
              lead="Solicita asistencia remota sin cambiar de pantalla."
              meta={[
                ['Estado', remoteSession ? 'Conectado' : 'Disponible'],
                ['Codigo', remoteSession?.code ?? 'PENDIENTE']
              ]}
              copy={remoteSession?.instructions ?? 'La sesion remota se mostrara cuando este lista.'}
              actions={
                <>
                  <button className="btn btn-primary" onClick={onRequestRemoteSupport} disabled={isBusy}>
                    Pedir soporte
                  </button>
                  <button className="btn btn-ghost" onClick={onOpenRemote} disabled={isBusy}>
                    Abrir remoto
                  </button>
                </>
              }
            />
          )}

          {activeSection === 'ticket' && (
            <div className="detail-form">
              <p className="detail-lead">Formulario corto, sin explicaciones largas.</p>
              <div className="field-grid">
                <label>
                  <span>Categoria</span>
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
                  <span>Descripcion</span>
                  <textarea value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} />
                </label>
              </div>
              <div className="button-row">
                <button className="btn btn-primary" onClick={onCreateTicket} disabled={isBusy}>
                  Enviar ticket
                </button>
              </div>
            </div>
          )}

          {activeSection === 'quick' && (
            <div className="detail-form">
              <p className="detail-lead">Chequeo corto del hardware y seguridad.</p>
              <div className="chip-grid">
                {quickChecks.map((item) => (
                  <StatusChip key={item.id} label={item.label} value={item.value} tone={item.tone} />
                ))}
              </div>
            </div>
          )}

          {activeSection === 'advanced' && (
            <div className="detail-form">
              <p className="detail-lead">Informe mas completo para enviar al tecnico.</p>
              <div className="status-inline">
                <strong>{advancedDiagnostic.running ? advancedDiagnostic.progress || 'Procesando...' : advancedDiagnostic.summary}</strong>
                <span>{advancedDiagnostic.running ? 'En progreso' : 'Listo'}</span>
              </div>
              <div className="button-row">
                <button className="btn btn-primary" onClick={onRunAdvancedDiagnostic} disabled={isBusy || advancedDiagnostic.running}>
                  Ejecutar diagnostico avanzado
                </button>
              </div>
            </div>
          )}

          {activeSection === 'cleaner' && (
            <div className="detail-form">
              <p className="detail-lead">Seleccion simple, sin paneles gigantes.</p>
              <div className="checklist">
                <CheckOption
                  label="Archivos temporales"
                  checked={cleanerSelection.tempFiles}
                  onChange={(checked) => setCleanerSelection({ ...cleanerSelection, tempFiles: checked })}
                />
                <CheckOption
                  label="Cache de navegador"
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
                  label="Revisar inicio"
                  checked={cleanerSelection.startupReview}
                  onChange={(checked) => setCleanerSelection({ ...cleanerSelection, startupReview: checked })}
                />
              </div>
              <div className="button-row">
                <button className="btn btn-ghost" onClick={onCleanerAnalyze} disabled={isBusy}>
                  Analizar primero
                </button>
                <button className="btn btn-primary" onClick={onCleanerRun} disabled={isBusy}>
                  Limpiar seleccion
                </button>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function ActionCard({
  active,
  icon,
  title,
  description,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button className={`action-card ${active ? 'is-active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="action-card__icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </button>
  );
}

function InfoMetric({
  label,
  value,
  tone,
  compact = false
}: {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
  compact?: boolean;
}) {
  return (
    <div className={`info-metric info-metric--${tone} ${compact ? 'info-metric--compact' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailStack({
  lead,
  meta,
  copy,
  actions
}: {
  lead: string;
  meta: Array<[string, string]>;
  copy: string;
  actions: ReactNode;
}) {
  return (
    <div className="detail-stack">
      <p className="detail-lead">{lead}</p>
      <div className="detail-meta">
        {meta.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="detail-copy">{copy}</p>
      <div className="button-row">{actions}</div>
    </div>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  return (
    <div className={`status-chip status-chip--${tone}`}>
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

function detailTitle(section: SectionId) {
  switch (section) {
    case 'remote':
      return 'Soporte remoto';
    case 'ticket':
      return 'Crear ticket';
    case 'quick':
      return 'Diagnostico rapido';
    case 'advanced':
      return 'Diagnostico avanzado';
    case 'cleaner':
      return 'Cleaner';
  }
}

type DiagnosticReportLike = {
  generatedAt?: string;
  computerName?: string;
  cpu?: string;
  maxTemperatureC?: number | null;
  ramTotalGb?: number;
  ramFreeGb?: number;
  systemDriveTotalGb?: number;
  systemDriveFreeGb?: number;
  defenderStatus?: string;
  pendingReboot?: boolean;
  temperatureNote?: string;
};
