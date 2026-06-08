import { Copy, RotateCcw } from 'lucide-react';
import type { PairingCodeRecord, DeviceRecord } from '../lib/domain';

export function PairDevicePanel({
  generatedCode,
  pairingCodes,
  devices,
  isBusy,
  onGeneratePairingCode,
  onCopyCode
}: {
  generatedCode: PairingCodeRecord | null;
  pairingCodes: PairingCodeRecord[];
  devices: DeviceRecord[];
  isBusy: boolean;
  onGeneratePairingCode: () => void;
  onCopyCode: () => void;
}) {
  const activeCode = generatedCode ?? pairingCodes[0] ?? null;
  const status = activeCode ? (activeCode.claimedAt ? 'vinculado' : 'esperando cliente') : 'sin codigo';

  return (
    <section className="panel pair-panel">
      <div className="pair-panel__head">
        <div>
          <p className="eyebrow">Admin {'>'} Equipos {'>'} Vincular equipo</p>
          <h3>Vinculacion de equipo</h3>
        </div>
        <span className="pill">{status}</span>
      </div>

      <div className="pair-code-card">
        <div>
          <span>Codigo de vinculacion</span>
          <strong>{activeCode?.code ?? 'Sin generar'}</strong>
        </div>
        <div className="pair-code-meta">
          <span>Expira</span>
          <strong>{activeCode ? formatTime(activeCode.expiresAt) : '--'}</strong>
        </div>
      </div>

      <div className="button-row">
        <button className="btn btn-primary" onClick={onGeneratePairingCode} disabled={isBusy}>
          <RotateCcw size={16} /> Generar codigo
        </button>
        <button className="btn btn-ghost" onClick={onCopyCode} disabled={!activeCode || isBusy}>
          <Copy size={16} /> Copiar codigo
        </button>
      </div>

      <p className="tiny-copy">Codigo corto, expiracion visible y sin texto extra.</p>

      <div className="subgrid">
        <div className="subgrid__head">
          <strong>Equipos recientes</strong>
          <span>{devices.length}</span>
        </div>
        <div className="row-list row-list--compact">
          {devices.slice(0, 5).map((device) => (
            <div className="row-item" key={device.id}>
              <div>
                <strong>{device.displayName}</strong>
                <p>{device.computerName}</p>
              </div>
              <span className="pill">{device.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
