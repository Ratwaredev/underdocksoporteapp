import { KeyRound, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';
import { CustomTitlebar } from './CustomTitlebar';

export function AdminLogin({
  email,
  setEmail,
  orgName,
  setOrgName,
  password,
  setPassword,
  onSubmit,
  isBusy,
  clientStatusLabel,
  adminStatusLabel,
  onGoClient,
  onBrandDoubleClick
}: {
  email: string;
  setEmail: (value: string) => void;
  orgName: string;
  setOrgName: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isBusy: boolean;
  clientStatusLabel: string;
  adminStatusLabel: string;
  onGoClient: () => void;
  onBrandDoubleClick?: () => void;
}) {
  return (
    <main className="page-shell">
      <div className="shell-backdrop" />
      <CustomTitlebar title="UnderDock" subtitle="Acceso admin" status={adminStatusLabel} onBrandDoubleClick={onBrandDoubleClick} />

      <section className="auth-shell">
        <form className="auth-card panel" onSubmit={onSubmit}>
          <div className="auth-card__head">
            <div className="brand-lockup brand-lockup--compact">
              <div className="brand-mark" aria-hidden="true">
                <span />
              </div>
              <div>
                <p className="eyebrow">Admin</p>
                <h1>Acceso admin</h1>
              </div>
            </div>
          </div>

          <div className="field-stack">
            <label>
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
            </label>
            <label>
              <span>Equipo / organizacion</span>
              <input value={orgName} onChange={(event) => setOrgName(event.target.value)} autoComplete="organization" />
            </label>
            <label>
              <span>Contraseña o codigo admin</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
          </div>

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={isBusy}>
              <KeyRound size={16} /> Ingresar
            </button>
            <button className="btn btn-ghost" type="button" disabled>
              Continuar con Google
            </button>
          </div>

          <p className="tiny-copy">Google es opcional y solo para administradores.</p>
          <button className="btn btn-quiet btn-mini" type="button" onClick={onGoClient}>
            Volver a cliente
          </button>
          <div className="status-foot">
            <span className="status-foot__item">
              <ShieldCheck size={14} />
              {clientStatusLabel}
            </span>
            <span className="status-foot__item">{adminStatusLabel}</span>
          </div>
        </form>
      </section>

      <footer className="version-footer">UnderDock</footer>
    </main>
  );
}
