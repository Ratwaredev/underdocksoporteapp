import { KeyRound, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { appBackend } from '../lib/backend';
import { CustomTitlebar } from './CustomTitlebar';

export function PasswordRecovery({
  recovery,
  onCancel,
  onCompleted
}: {
  recovery: { accessToken: string; refreshToken: string | null; emailHint: string | null };
  onCancel: () => void;
  onCompleted: (emailHint: string | null) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setToast('Usa al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setToast('Las contrasenas no coinciden.');
      return;
    }

    setIsBusy(true);
    setToast(null);
    try {
      await appBackend.completePasswordRecovery(recovery.accessToken, password);
      setCompleted(true);
      onCompleted(recovery.emailHint);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo actualizar la contrasena.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="shell-backdrop" />
      <CustomTitlebar title="UnderDock" subtitle="Restablecer contrasena" status="Recuperacion activa" />

      <section className="auth-shell">
        <form className="auth-card panel" onSubmit={handleSubmit}>
          <div className="auth-card__head">
            <div className="brand-lockup brand-lockup--compact">
              <div className="brand-mark" aria-hidden="true">
                <span />
              </div>
              <div>
                <p className="eyebrow">Supabase Auth</p>
                <h1>Crear nueva contrasena</h1>
              </div>
            </div>
          </div>

          <div className="field-stack">
            <label>
              <span>Cuenta</span>
              <input value={recovery.emailHint ?? ''} readOnly placeholder="Cuenta recuperada" />
            </label>
            <label>
              <span>Nueva contrasena</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>Confirmar contrasena</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>

          {completed ? (
            <div className="subtle-card">
              <strong>Contraseña actualizada</strong>
              <p>Ya podés volver al acceso correspondiente con la clave nueva.</p>
            </div>
          ) : null}

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={isBusy || completed}>
              <KeyRound size={16} /> {completed ? 'Actualizada' : 'Guardar contrasena'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={isBusy}>
              {completed ? 'Ir al acceso' : 'Volver al login admin'}
            </button>
          </div>

          <p className="tiny-copy">
            {recovery.emailHint ? `Se detecto la cuenta ${recovery.emailHint}.` : 'Este enlace sirve para fijar una nueva contrasena.'}
          </p>

          {toast ? (
            <div className="status-foot">
              <span className="status-foot__item">
                <ShieldCheck size={14} />
                {toast}
              </span>
            </div>
          ) : null}
        </form>
      </section>

      <footer className="version-footer">UnderDock</footer>
    </main>
  );
}
