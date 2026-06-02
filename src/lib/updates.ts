import { check } from '@tauri-apps/plugin-updater';
import { isTauriRuntime } from './tauri';

export type UpdateResult = {
  status: 'available' | 'current' | 'unconfigured' | 'error';
  currentVersion: string;
  nextVersion?: string;
  notes: string;
};

export async function checkForUpdates(): Promise<UpdateResult> {
  if (!isTauriRuntime()) {
    return {
      status: 'unconfigured',
      currentVersion: '0.1.4-dev',
      notes: 'Modo navegador: el updater real funciona dentro del build Tauri.'
    };
  }

  try {
    const update = await check();

    if (update) {
      return {
        status: 'available',
        currentVersion: update.currentVersion,
        nextVersion: update.version,
        notes: update.body || 'Hay una versión nueva disponible.'
      };
    }

    return {
      status: 'current',
      currentVersion: '0.1.4',
      notes: 'La app está actualizada.'
    };
  } catch (error) {
    return {
      status: 'error',
      currentVersion: '0.1.4',
      notes: error instanceof Error ? error.message : 'No se pudo comprobar actualizaciones.'
    };
  }
}

export async function installLatestUpdate(): Promise<UpdateResult> {
  if (!isTauriRuntime()) {
    return {
      status: 'unconfigured',
      currentVersion: '0.1.4-dev',
      notes: 'Modo navegador: el updater real funciona dentro del build Tauri.'
    };
  }

  try {
    const update = await check();

    if (!update) {
      return {
        status: 'current',
        currentVersion: '0.1.4',
        notes: 'La app ya estaba actualizada.'
      };
    }

    await update.downloadAndInstall();

    return {
      status: 'available',
      currentVersion: update.currentVersion,
      nextVersion: update.version,
      notes: update.body || 'Actualizacion instalada. Reiniciando...'
    };
  } catch (error) {
    return {
      status: 'error',
      currentVersion: '0.1.4',
      notes: error instanceof Error ? error.message : 'No se pudo instalar la actualizacion.'
    };
  }
}
