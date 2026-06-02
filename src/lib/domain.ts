export type Role = 'admin' | 'client';

export type TicketStatus = 'nuevo' | 'esperando' | 'en-remoto' | 'cerrado';
export type Priority = 'normal' | 'alta';
export type ReleaseChannel = 'stable' | 'beta';

export type BackendKind = 'local' | 'supabase';

export type RuntimeConfig = {
  backendKind: BackendKind;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  defaultOrgName: string;
  remoteToolUrl: string;
  localAdminEmail: string;
  localAdminPassword: string;
  localAdminOrg: string;
};

export type AppSession = {
  role: Role;
  backendKind: BackendKind;
  userId?: string;
  accessToken?: string;
  refreshToken?: string;
  email?: string;
  displayName?: string;
  orgName?: string;
  deviceId?: string;
  deviceToken?: string;
};

export type DeviceRecord = {
  id: string;
  orgName: string;
  displayName: string;
  computerName: string;
  userName: string;
  os: string;
  platform: string;
  pairingCode?: string;
  deviceToken?: string;
  status: 'idle' | 'waiting' | 'en-remoto' | 'maintenance';
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketRecord = {
  id: string;
  deviceId: string;
  clientName: string;
  issue: string;
  status: TicketStatus;
  priority: Priority;
  remoteCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type DiagnosticRecord = {
  id: string;
  deviceId: string;
  generatedAt: string;
  payload: Record<string, unknown>;
};

export type SessionRecord = {
  id: string;
  ticketId: string;
  deviceId: string;
  code: string;
  expiresInMinutes: number;
  instructions: string;
  createdAt: string;
};

export type ReleaseRecord = {
  id: string;
  channel: ReleaseChannel;
  version: string;
  notes: string;
  manifestUrl: string;
  signature: string;
  publishedAt: string;
  isActive: boolean;
};

export type PairingCodeRecord = {
  code: string;
  orgName: string;
  expiresAt: string;
  claimedAt?: string;
  claimedDeviceId?: string;
  createdAt: string;
};

export type AdminProfile = {
  userId: string;
  email: string;
  orgName: string;
  role: 'admin';
};

export type ClientBootstrap = {
  session: AppSession;
  device: DeviceRecord;
};

export type AdminDashboard = {
  profile: AdminProfile;
  devices: DeviceRecord[];
  tickets: TicketRecord[];
  diagnostics: DiagnosticRecord[];
  releases: ReleaseRecord[];
  pairingCodes: PairingCodeRecord[];
};

export type ClientDashboard = {
  device: DeviceRecord;
  tickets: TicketRecord[];
  diagnostics: DiagnosticRecord[];
  latestRelease?: ReleaseRecord | null;
  latestSession?: SessionRecord | null;
};

export type UpdateResult = {
  status: 'available' | 'current' | 'unconfigured' | 'error';
  currentVersion: string;
  nextVersion?: string;
  notes: string;
  manifestUrl?: string;
  signature?: string;
};

export type SignInResult = {
  session: AppSession;
  profile: AdminProfile;
};

export type RegisterClientInput = {
  pairingCode: string;
  deviceName: string;
  issue?: string;
  computerName: string;
  userName: string;
  os: string;
  platform: string;
};

export type CreateTicketInput = {
  deviceId: string;
  issue: string;
  clientName: string;
  priority: Priority;
};

export type SaveDiagnosticInput = {
  deviceId: string;
  payload: Record<string, unknown>;
};

export type CreateSessionInput = {
  deviceId: string;
  ticketId: string;
};

export const APP_VERSION = '0.1.9';

export const STORAGE_KEYS = {
  session: 'underdock.session.v1',
  localState: 'underdock.local-state.v1'
} as const;

export const DEFAULT_REMOTE_INSTRUCTIONS =
  'Comparti este codigo con el tecnico. No requiere dejar la PC monitoreando: solo se usa para abrir la sesion de soporte.';

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = '') {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  return prefix ? `${prefix}${raw}` : raw;
}

export function createPairingCode() {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

export function createSessionCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function compareVersions(left: string, right: string) {
  const parse = (value: string) =>
    value
      .split('.')
      .map((part) => Number.parseInt(part, 10))
      .map((part) => Number.isFinite(part) ? part : 0);

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}
