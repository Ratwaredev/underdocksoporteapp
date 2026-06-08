import { KeyRound } from 'lucide-react';
import type { FormEvent } from 'react';
import { CustomTitlebar } from './CustomTitlebar';

export function ClientActivation({
  pairingCode,
  setPairingCode,
  isBusy,
  onSubmit,
  onBrandDoubleClick
}: {
  pairingCode: string;
  setPairingCode: (value: string) => void;
  isBusy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBrandDoubleClick?: () => void;
}) {
  return (
    <main className="page-shell">
      <div className="shell-backdrop" />
      <CustomTitlebar title="UnderDock" subtitle="Vincular equipo" status="Cliente no activado" onBrandDoubleClick={onBrandDoubleClick} />

      <section className="auth-shell">
        <form className="auth-card panel" onSubmit={onSubmit}>
          <div className="auth-card__head">
            <div className="brand-lockup brand-lockup--compact">
              <div className="brand-mark" aria-hidden="true">
                <span />
              </div>
              <div>
                <p className="eyebrow">Cliente</p>
                <h1>Activar equipo</h1>
              </div>
            </div>
          </div>

          <div className="field-stack">
            <label>
              <span>Codigo de vinculacion</span>
              <input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} autoComplete="off" />
            </label>
          </div>

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={isBusy}>
              <KeyRound size={16} /> Vincular equipo
            </button>
          </div>

          <p className="tiny-copy">Si ya tenes un codigo activo, ingresalo aca y seguimos.</p>
        </form>
      </section>

      <footer className="version-footer">UnderDock</footer>
    </main>
  );
}
