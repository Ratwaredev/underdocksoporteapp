export type AppErrorEntry = {
  id: string;
  createdAt: string;
  source: string;
  message: string;
  details?: string;
};

const ERROR_LOG_KEY = 'underdock.errors.v1';
const ERROR_LOG_LIMIT = 40;

function safeParse(raw: string | null): AppErrorEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AppErrorEntry[]) : [];
  } catch {
    return [];
  }
}

export function listAppErrors(): AppErrorEntry[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(ERROR_LOG_KEY));
}

export function appendAppError(source: string, message: string, details?: string) {
  if (typeof window === 'undefined') return;

  const entries = listAppErrors();
  const next: AppErrorEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    message,
    ...(details ? { details } : {})
  };

  window.localStorage.setItem(ERROR_LOG_KEY, JSON.stringify([next, ...entries].slice(0, ERROR_LOG_LIMIT)));
}

export function clearAppErrors() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ERROR_LOG_KEY);
}
