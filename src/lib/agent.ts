import { safeInvoke, isTauriRuntime } from './tauri';

export type AgentStatus = {
  mode: string;
  monitoring: boolean;
  version: string;
  notes: string;
};

export type AgentActionResult = {
  action: string;
  ok: boolean;
  message: string;
  details: string[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getAgentStatus(): Promise<AgentStatus> {
  if (isTauriRuntime()) {
    return safeInvoke<AgentStatus>('agent_status');
  }

  await wait(400);
  return {
    mode: 'on-demand/dev',
    monitoring: false,
    version: '0.1.0-dev',
    notes: 'Modo navegador: el agent real corre dentro de Tauri.'
  };
}

export async function runAgentAction(actionId: string): Promise<AgentActionResult> {
  if (isTauriRuntime()) {
    return safeInvoke<AgentActionResult>('run_agent_action', { actionId });
  }

  await wait(650);
  return {
    action: actionId,
    ok: true,
    message: `Acción demo ejecutada: ${actionId}`,
    details: ['No se modificó el sistema.', 'En build Tauri se ejecuta el comando on-demand.']
  };
}
