import { KeyRound, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';
import { CustomTitlebar } from './CustomTitlebar';

export function AdminLogin({
  email,
  setEmail,
  password,
  setPassword,
  onSubmit,
  isBusy,
  authError,
  version
}: {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isBusy: boolean;
  authError?: string;
  version: string;
}) {
  return (
    <main className="page-shell">
      <div className="shell-backdrop" />
      <CustomTitlebar title="UnderDock" subtitle="Acceso admin" />

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
              <span>Contraseña</span>
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
          </div>

          {authError ? <div className="subtle-card"><strong>Error</strong><p>{authError}</p></div> : null}
        </form>
      </section>

      <footer className="version-footer">UnderDock {version}</footer>
    </main>
  );
}
