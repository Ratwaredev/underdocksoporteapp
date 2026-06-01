import { safeInvoke, isTauriRuntime } from './tauri';

export type RemoteSession = {
  code: string;
  expiresInMinutes: number;
  instructions: string;
};

export async function createRemoteSession(): Promise<RemoteSession> {
  if (isTauriRuntime()) {
    return safeInvoke<RemoteSession>('create_remote_session');
  }

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();

  return {
    code,
    expiresInMinutes: 20,
    instructions: 'Modo demo: en build Tauri se prepara RustDesk/MeshCentral.'
  };
}

export async function openRemoteTool(): Promise<string> {
  if (isTauriRuntime()) {
    return safeInvoke<string>('open_remote_tool');
  }

  return 'Modo navegador: poné RustDesk portable en tools/rustdesk/rustdesk.exe o instalalo en Windows.';
}
