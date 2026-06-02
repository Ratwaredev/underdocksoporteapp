import { safeInvoke, isTauriRuntime } from './tauri';

export async function openAdminWindow(): Promise<string> {
  if (isTauriRuntime()) {
    return safeInvoke<string>('open_admin_window');
  }

  return 'Panel admin disponible solo dentro de UnderDock.';
}
