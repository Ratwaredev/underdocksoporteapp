import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';
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
      currentVersion: '0.1.13-dev',
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
      currentVersion: '0.1.13',
      notes: 'La app está actualizada.'
    };
  } catch (error) {
    console.error('Updater check failed:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return {
      status: 'error',
      currentVersion: '0.1.13',
      notes: `No se pudo comprobar actualizaciones: ${message}`
    };
  }
}

export async function installLatestUpdate(onProgress?: (progress: string) => void): Promise<UpdateResult> {
  if (!isTauriRuntime()) {
    return {
      status: 'unconfigured',
      currentVersion: '0.1.13-dev',
      notes: 'Modo navegador: el updater real funciona dentro del build Tauri.'
    };
  }

  try {
    const update = await check();

    if (!update) {
      return {
        status: 'current',
        currentVersion: '0.1.13',
        notes: 'La app ya estaba actualizada.'
      };
    }

    let totalBytes = 0;
    let downloadedBytes = 0;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') {
        totalBytes = event.data.contentLength ?? 0;
        downloadedBytes = 0;
        onProgress?.('0%');
        return;
      }

      if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
          onProgress?.(`${percent}%`);
        } else {
          onProgress?.('Descargando');
        }
        return;
      }

      if (event.event === 'Finished') {
        onProgress?.('Instalando');
      }
    });

    return {
      status: 'available',
      currentVersion: update.currentVersion,
      nextVersion: update.version,
      notes: update.body || 'Actualización instalada. Reiniciando...'
    };
  } catch (error) {
    console.error('Updater install failed:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return {
      status: 'error',
      currentVersion: '0.1.13',
      notes: `No se pudo instalar la actualización: ${message}`
    };
  }
}
