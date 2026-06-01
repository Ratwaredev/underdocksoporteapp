import { safeInvoke, isTauriRuntime } from './tauri';

export type DiagnosticReport = {
  generatedAt: string;
  computerName: string;
  userName: string;
  os: string;
  cpu: string;
  ramTotalGb: number;
  ramFreeGb: number;
  systemDriveTotalGb: number;
  systemDriveFreeGb: number;
  startupItems: number;
  defenderStatus: string;
  pendingReboot: boolean;
  recommendations: string[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runQuickDiagnostic(): Promise<DiagnosticReport> {
  if (isTauriRuntime()) {
    return safeInvoke<DiagnosticReport>('run_quick_diagnostic');
  }

  await wait(850);

  return {
    generatedAt: new Date().toISOString(),
    computerName: 'FRANCISCO-PC',
    userName: 'cliente-demo',
    os: 'Windows 11 Pro 24H2',
    cpu: 'AMD Ryzen 7 5700G',
    ramTotalGb: 16,
    ramFreeGb: 4.8,
    systemDriveTotalGb: 476,
    systemDriveFreeGb: 93,
    startupItems: 18,
    defenderStatus: 'Activo',
    pendingReboot: false,
    recommendations: [
      'Revisar programas de inicio: hay más de 12 entradas cargando con Windows.',
      'Espacio en disco aceptable, pero conviene limpiar temporales si baja de 15%.',
      'Crear punto de restauración antes de cualquier mantenimiento profundo.',
      'No ejecutar limpieza de registro ni scripts no auditados.'
    ]
  };
}
