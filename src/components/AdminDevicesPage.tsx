import { Monitor, ShieldCheck, SquareTerminal } from 'lucide-react';
import type { AdminDashboard, PairingCodeRecord, DeviceRecord } from '../lib/domain';
import { PairDevicePanel } from './PairDevicePanel';

export function AdminDevicesPage({
  dashboard,
  filteredDevices,
  generatedCode,
  isBusy,
  onGeneratePairingCode,
  onCopyCode,
  onOpenRemoteTool,
  onShowDiagnostics
}: {
  dashboard: AdminDashboard | null;
  filteredDevices: DeviceRecord[];
  generatedCode: PairingCodeRecord | null;
  isBusy: boolean;
  onGeneratePairingCode: () => void;
  onCopyCode: () => void;
  onOpenRemoteTool: () => void;
  onShowDiagnostics: (deviceId?: string) => void;
}) {
  return (
    <div className="admin-workspace">
      <section className="panel stack-panel">
        <div className="stack-panel__head">
          <div>
            <p className="eyebrow">Equipos</p>
            <h2>Lista de equipos</h2>
          </div>
          <span className="subtle">{filteredDevices.length} activos</span>
        </div>
        <div className="table-like">
          {filteredDevices.length === 0 ? (
            <div className="empty-state">No hay equipos para mostrar.</div>
          ) : (
            filteredDevices.map((device) => (
              <article className="device-row" key={device.id}>
                <div>
                  <div className="device-row__top">
                    <strong>{device.displayName}</strong>
                    <span className="pill">{device.status}</span>
                  </div>
                  <p>{device.computerName} · {device.os}</p>
                </div>
                <div className="device-row__meta">
                  <span><Monitor size={14} /> {device.orgName}</span>
                  <span><ShieldCheck size={14} /> {device.userName}</span>
                </div>
                <div className="button-row">
                  <button className="btn btn-ghost btn-mini" onClick={onGeneratePairingCode} disabled={isBusy}>
                    Vincular equipo
                  </button>
                  <button className="btn btn-ghost btn-mini" onClick={onOpenRemoteTool} disabled={isBusy}>
                    <SquareTerminal size={14} /> Abrir sesion remota
                  </button>
                  <button className="btn btn-ghost btn-mini" onClick={() => onShowDiagnostics(device.id)}>
                    Ver diagnostico
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <PairDevicePanel
        generatedCode={generatedCode}
        pairingCodes={dashboard?.pairingCodes ?? []}
        devices={dashboard?.devices ?? []}
        isBusy={isBusy}
        onGeneratePairingCode={onGeneratePairingCode}
        onCopyCode={onCopyCode}
      />
    </div>
  );
}
