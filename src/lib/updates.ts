import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './tauri';

export type UpdateResult = {
  status: 'available' | 'current' | 'unconfigured' | 'error';
  currentVersion: string;
  nextVersion?: string;
  notes: string;
  downloadUrl?: string;
};

type NativeUpdateResult = {
  status: 'available' | 'current';
  currentVersion: string;
  nextVersion?: string;
  notes: string;
  downloadUrl?: string;
};

async function invokeUpdateCommand(command: string): Promise<NativeUpdateResult> {
  return invoke<NativeUpdateResult>(command);
}

export async function checkForUpdates(): Promise<UpdateResult> {
  if (!isTauriRuntime()) {
    return {
      status: 'unconfigured',
      currentVersion: '0.1.24-dev',
      notes: 'Modo navegador: el updater real funciona dentro del build Tauri.'
    };
  }

  try {
    return await invokeUpdateCommand('check_remote_update');
  } catch (error) {
    console.error('Updater check failed:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return {
      status: 'error',
      currentVersion: '0.1.24',
      notes: `No se pudo comprobar actualizaciones: ${message}`
    };
  }
}

export async function installLatestUpdate(onProgress?: (progress: string) => void): Promise<UpdateResult> {
  if (!isTauriRuntime()) {
    return {
      status: 'unconfigured',
      currentVersion: '0.1.24-dev',
      notes: 'Modo navegador: el updater real funciona dentro del build Tauri.'
    };
  }

  try {
    onProgress?.('Preparando actualización');
    const result = await invokeUpdateCommand('install_remote_update');
    onProgress?.('Aplicando actualización');
    return result;
  } catch (error) {
    console.error('Updater install failed:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return {
      status: 'error',
      currentVersion: '0.1.24',
      notes: `No se pudo instalar la actualización: ${message}`
    };
  }
}
