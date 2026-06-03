import type {
  AdminDashboard,
  AdminProfile,
  AppSession,
  BackendKind,
  ClientBootstrap,
  ClientDashboard,
  CreateSessionInput,
  CreateTicketInput,
  DeviceRecord,
  DiagnosticRecord,
  PairingCodeRecord,
  ReleaseRecord,
  RegisterClientInput,
  RuntimeConfig,
  SaveDiagnosticInput,
  SessionRecord,
  SignInResult,
  TicketRecord,
  TicketStatus,
  UpdateResult
} from './domain';
import {
  DEFAULT_REMOTE_INSTRUCTIONS,
  STORAGE_KEYS,
  compareVersions,
  createId,
  createPairingCode,
  createSessionCode,
  nowIso
} from './domain';

type LocalState = {
  profile: AdminProfile;
  devices: DeviceRecord[];
  tickets: TicketRecord[];
  diagnostics: DiagnosticRecord[];
  sessions: SessionRecord[];
  releases: ReleaseRecord[];
  pairingCodes: PairingCodeRecord[];
  rememberedSession: StoredSession;
};

type StoredSession = AppSession | null;

type BackendBase = {
  kind: BackendKind;
  configured: boolean;
  description: string;
  bootstrap(): Promise<StoredSession>;
  signInAdmin(email: string, password: string, orgName: string): Promise<SignInResult>;
  completePasswordRecovery(accessToken: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  signOutAdmin(): Promise<void>;
  generatePairingCode(): Promise<PairingCodeRecord>;
  registerClient(input: RegisterClientInput): Promise<ClientBootstrap>;
  createPreviewClientSession(): Promise<ClientBootstrap>;
  getAdminDashboard(): Promise<AdminDashboard>;
  getClientDashboard(deviceToken: string): Promise<ClientDashboard>;
  createTicket(input: CreateTicketInput, deviceToken: string): Promise<TicketRecord>;
  saveDiagnostic(input: SaveDiagnosticInput, deviceToken: string): Promise<DiagnosticRecord>;
  createRemoteSession(input: CreateSessionInput, deviceToken: string): Promise<SessionRecord>;
  deleteDevice(deviceId: string): Promise<void>;
  updateTicketStatus(ticketId: string, status: TicketStatus): Promise<TicketRecord>;
  listReleases(): Promise<ReleaseRecord[]>;
  checkForUpdates(currentVersion: string): Promise<UpdateResult>;
};

function readSession(): StoredSession {
  if (typeof window === 'undefined') return null;

  const tryParse = (raw: string | null) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  };

  const current = tryParse(window.localStorage.getItem(STORAGE_KEYS.clientSession));
  if (current?.role === 'client' && current.deviceToken) return current;

  const legacy = tryParse(window.localStorage.getItem('underdock.session.v1'));
  if (legacy?.role === 'client' && legacy.deviceToken) {
    window.localStorage.setItem(STORAGE_KEYS.clientSession, JSON.stringify(legacy));
    return legacy;
  }

  return null;
}

function readStoredSession(key: string): StoredSession {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function readAdminSession(): StoredSession {
  return readStoredSession(STORAGE_KEYS.adminSession);
}

function writeSession(session: StoredSession) {
  if (typeof window === 'undefined') return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEYS.clientSession);
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.clientSession, JSON.stringify(session));
}

function writeAdminSession(session: StoredSession) {
  if (typeof window === 'undefined') return;
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEYS.adminSession);
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.adminSession, JSON.stringify(session));
}

function clearClientSessionIfMatching(deviceId: string) {
  if (typeof window === 'undefined') return;

  const session = readSession();
  if (session?.deviceId === deviceId) {
    writeSession(null);
  }
}

function readLocalState(): LocalState {
  if (typeof window === 'undefined') return createSeedState();

  const raw = window.localStorage.getItem(STORAGE_KEYS.localState);
  if (!raw) {
    const seed = createSeedState();
    window.localStorage.setItem(STORAGE_KEYS.localState, JSON.stringify(seed));
    return seed;
  }

  try {
    return JSON.parse(raw) as LocalState;
  } catch {
    const seed = createSeedState();
    window.localStorage.setItem(STORAGE_KEYS.localState, JSON.stringify(seed));
    return seed;
  }
}

function writeLocalState(state: LocalState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEYS.localState, JSON.stringify(state));
}

function createSeedState(): LocalState {
  const orgName = 'UnderDock Demo';
  const deviceId = createId('dev_');
  const pairingCode = 'DEMO-PAIR';
  const deviceToken = createId('tok_');
  const releaseBase = nowIso();

  return {
    profile: {
      userId: 'local-admin',
      email: 'admin@underdock.local',
      orgName,
      role: 'admin'
    },
    devices: [
      {
        id: deviceId,
        orgName,
        displayName: 'Equipo demo',
        computerName: 'DEMO-PC',
        userName: 'usuario-demo',
        os: 'Windows 11 Pro 24H2',
        platform: 'windows',
        pairingCode,
        deviceToken,
        status: 'idle',
        lastSeenAt: releaseBase,
        createdAt: releaseBase,
        updatedAt: releaseBase
      }
    ],
    tickets: [
      {
        id: 'UD-1024',
        deviceId,
        clientName: 'Cliente demo',
        issue: 'La PC tarda mucho en iniciar y se queda al 100% de disco.',
        status: 'nuevo',
        priority: 'alta',
        remoteCode: 'XK3P92',
        createdAt: releaseBase,
        updatedAt: releaseBase
      },
      {
        id: 'UD-1023',
        deviceId,
        clientName: 'Oficina demo',
        issue: 'Piden limpieza y chequeo antes de instalar SSD.',
        status: 'esperando',
        priority: 'normal',
        createdAt: releaseBase,
        updatedAt: releaseBase
      }
    ],
    diagnostics: [],
    sessions: [],
    releases: [
      {
        id: createId('rel_'),
        channel: 'stable',
        version: '0.1.1',
        notes: 'Release de prueba con sync de tickets, pairing y soporte remoto.',
        manifestUrl: 'https://updates.example.com/underdock/manifest.json',
        signature: 'REPLACE_WITH_SIGNATURE',
        publishedAt: releaseBase,
        isActive: true
      }
    ],
    pairingCodes: [
      {
        code: pairingCode,
        orgName,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        createdAt: releaseBase
      }
    ],
    rememberedSession: null
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getRuntimeConfig(): RuntimeConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || null;
  const defaultOrgName = import.meta.env.VITE_DEFAULT_ORG_NAME?.trim() || 'UnderDock';
  const remoteToolUrl = import.meta.env.VITE_REMOTE_TOOL_URL?.trim() || '';
  const localAdminEmail = import.meta.env.VITE_LOCAL_ADMIN_EMAIL?.trim() || 'admin@underdock.local';
  const localAdminPassword = import.meta.env.VITE_LOCAL_ADMIN_PASSWORD?.trim() || 'admin123';
  const localAdminOrg = import.meta.env.VITE_LOCAL_ADMIN_ORG?.trim() || 'UnderDock Demo';

  return {
    backendKind: supabaseUrl && supabaseAnonKey ? 'supabase' : (import.meta.env.PROD ? 'supabase' : 'local'),
    supabaseUrl,
    supabaseAnonKey,
    defaultOrgName,
    remoteToolUrl,
    localAdminEmail,
    localAdminPassword,
    localAdminOrg
  };
}

function createLocalBackend(config: RuntimeConfig): BackendBase {
  const getState = () => readLocalState();
  const setState = (state: LocalState) => writeLocalState(state);
  const requireAdminSession = () => {
    const session = readAdminSession();
    if (!session?.email) {
      throw new Error('No hay sesion admin activa.');
    }

    return session;
  };

  return {
    kind: 'local',
    configured: true,
    description: 'Modo local demo. Los datos quedan en el navegador de esta maquina.',
    async bootstrap() {
      const adminSession = readAdminSession();
      if (adminSession?.email) return adminSession;

      const session = readSession();
      if (session?.role === 'client' && session.deviceToken) return session;

      return null;
    },
    async signInAdmin(email, password) {
      if (email !== config.localAdminEmail || password !== config.localAdminPassword) {
        throw new Error('Credenciales invalidas para el panel admin local.');
      }

      const state = getState();
      const session: AppSession = {
        role: 'admin',
        backendKind: 'local',
        email,
        displayName: 'Administrador local',
        orgName: state.profile.orgName
      };

      writeAdminSession(session);
      return { session, profile: state.profile };
    },
    async completePasswordRecovery() {
      throw new Error('Recuperacion de contraseña no disponible en modo local.');
    },
    async signOut() {
      writeSession(null);
    },
    async signOutAdmin() {
      writeAdminSession(null);
    },
    async generatePairingCode() {
      requireAdminSession();
      const state = getState();
      const code = createPairingCode();
      const record: PairingCodeRecord = {
        code,
        orgName: state.profile.orgName,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        createdAt: nowIso()
      };

      state.pairingCodes = [record, ...state.pairingCodes].slice(0, 12);
      setState(state);
      return record;
    },
    async registerClient(input) {
      const state = getState();
      const code = state.pairingCodes.find((item) => item.code.toUpperCase() === input.pairingCode.toUpperCase() && !item.claimedAt);
      if (!code) throw new Error('Codigo de activacion invalido o vencido.');

      const createdAt = nowIso();
      const device: DeviceRecord = {
        id: createId('dev_'),
        orgName: code.orgName,
        displayName: input.deviceName,
        computerName: input.computerName,
        userName: input.userName,
        os: input.os,
        platform: input.platform,
        pairingCode: code.code,
        deviceToken: createId('tok_'),
        status: 'waiting',
        lastSeenAt: createdAt,
        createdAt,
        updatedAt: createdAt
      };

      state.devices = [device, ...state.devices];
      code.claimedAt = createdAt;
      code.claimedDeviceId = device.id;
      state.pairingCodes = [code, ...state.pairingCodes.filter((item) => item.code !== code.code)];
      setState(state);

      const session: AppSession = {
        role: 'client',
        backendKind: 'local',
        deviceId: device.id,
        deviceToken: device.deviceToken,
        displayName: device.displayName,
        orgName: device.orgName
      };

      writeSession(session);
      return { session, device };
    },
    async createPreviewClientSession() {
      requireAdminSession();
      const state = getState();
      const existingDevice = state.devices.find((item) => item.displayName === 'Equipo de prueba' && item.orgName === state.profile.orgName);
      const timestamp = nowIso();

      const device: DeviceRecord =
        existingDevice ??
        {
          id: createId('dev_'),
          orgName: state.profile.orgName,
          displayName: 'Equipo de prueba',
          computerName: 'ADMIN-PREVIEW',
          userName: 'admin',
          os: 'Windows 11 Pro 24H2',
          platform: 'windows',
          deviceToken: createId('tok_'),
          status: 'idle',
          lastSeenAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        };

      if (!existingDevice) {
        state.devices = [device, ...state.devices];
      } else {
        existingDevice.lastSeenAt = timestamp;
        existingDevice.updatedAt = timestamp;
      }
      setState(state);

      const session: AppSession = {
        role: 'client',
        backendKind: 'local',
        deviceId: device.id,
        deviceToken: device.deviceToken,
        displayName: device.displayName,
        orgName: device.orgName
      };

      writeSession(session);
      return { session, device };
    },
    async getAdminDashboard() {
      requireAdminSession();
      const state = getState();
      return clone({
        profile: state.profile,
        devices: state.devices,
        tickets: state.tickets,
        diagnostics: state.diagnostics,
        sessions: state.sessions,
        releases: state.releases,
        pairingCodes: state.pairingCodes
      });
    },
    async getClientDashboard(deviceToken) {
      const state = getState();
      const device = state.devices.find((item) => item.deviceToken === deviceToken);
      if (!device) throw new Error('No se encontro el dispositivo asociado.');

      const tickets = state.tickets.filter((item) => item.deviceId === device.id);
      const diagnostics = state.diagnostics.filter((item) => item.deviceId === device.id);
      const latestSession = state.sessions.filter((item) => item.deviceId === device.id)[0] ?? null;
      const latestRelease = state.releases.filter((item) => item.isActive).sort((left, right) => compareVersions(right.version, left.version))[0] ?? null;

      return clone({
        device,
        tickets,
        diagnostics,
        latestRelease,
        latestSession
      });
    },
    async createTicket(input, deviceToken) {
      const state = getState();
      const device = state.devices.find((item) => item.deviceToken === deviceToken || item.id === input.deviceId);
      if (!device) throw new Error('No se encontro el dispositivo para crear el ticket.');

      const ticket: TicketRecord = {
        id: `UD-${Math.floor(1000 + Math.random() * 8999)}`,
        deviceId: device.id,
        clientName: input.clientName,
        issue: input.issue,
        status: 'nuevo',
        priority: input.priority,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      state.tickets = [ticket, ...state.tickets];
      device.status = 'waiting';
      device.updatedAt = nowIso();
      setState(state);
      return clone(ticket);
    },
    async saveDiagnostic(input, deviceToken) {
      const state = getState();
      const device = state.devices.find((item) => item.deviceToken === deviceToken || item.id === input.deviceId);
      if (!device) throw new Error('No se encontro el dispositivo para guardar diagnostico.');

      const diagnostic: DiagnosticRecord = {
        id: createId('diag_'),
        deviceId: device.id,
        generatedAt: nowIso(),
        payload: input.payload
      };

      state.diagnostics = [diagnostic, ...state.diagnostics];
      device.lastSeenAt = diagnostic.generatedAt;
      device.updatedAt = diagnostic.generatedAt;
      setState(state);
      return clone(diagnostic);
    },
    async createRemoteSession(input, deviceToken) {
      const state = getState();
      const device = state.devices.find((item) => item.deviceToken === deviceToken || item.id === input.deviceId);
      if (!device) throw new Error('No se encontro el dispositivo para la sesion remota.');

      const ticket = state.tickets.find((item) => item.id === input.ticketId);
      const session: SessionRecord = {
        id: createId('ses_'),
        ticketId: input.ticketId,
        deviceId: device.id,
        code: createSessionCode(),
        expiresInMinutes: 20,
        instructions: DEFAULT_REMOTE_INSTRUCTIONS,
        createdAt: nowIso()
      };

      state.sessions = [session, ...state.sessions];
      if (ticket) {
        ticket.remoteCode = session.code;
        ticket.status = 'en-remoto';
        ticket.updatedAt = nowIso();
      }
      device.status = 'en-remoto';
      device.updatedAt = nowIso();
      setState(state);
      return clone(session);
    },
    async deleteDevice(deviceId) {
      requireAdminSession();
      const state = getState();
      const device = state.devices.find((item) => item.id === deviceId);
      if (!device) throw new Error('No se encontro el equipo.');

      state.devices = state.devices.filter((item) => item.id !== deviceId);
      state.tickets = state.tickets.filter((item) => item.deviceId !== deviceId);
      state.diagnostics = state.diagnostics.filter((item) => item.deviceId !== deviceId);
      state.sessions = state.sessions.filter((item) => item.deviceId !== deviceId);
      state.pairingCodes = state.pairingCodes.filter((item) => item.claimedDeviceId !== deviceId);
      setState(state);
      clearClientSessionIfMatching(deviceId);
    },
    async updateTicketStatus(ticketId, status) {
      requireAdminSession();
      const state = getState();
      const ticket = state.tickets.find((item) => item.id === ticketId);
      if (!ticket) throw new Error('No se encontro el ticket.');

      ticket.status = status;
      ticket.updatedAt = nowIso();
      setState(state);
      return clone(ticket);
    },
    async listReleases() {
      const state = getState();
      return clone(state.releases);
    },
    async checkForUpdates(currentVersion) {
      const releases = await this.listReleases();
      const active = releases.filter((item) => item.isActive).sort((left, right) => compareVersions(right.version, left.version))[0];
      if (!active) {
        return {
          status: 'unconfigured',
          currentVersion,
          notes: 'No hay releases publicadas en el backend local.'
        };
      }

      if (compareVersions(active.version, currentVersion) > 0) {
        return {
          status: 'available',
          currentVersion,
          nextVersion: active.version,
          notes: active.notes,
          manifestUrl: active.manifestUrl,
          signature: active.signature
        };
      }

      return {
        status: 'current',
        currentVersion,
        notes: 'La version instalada esta al dia.',
        manifestUrl: active.manifestUrl,
        signature: active.signature
      };
    }
  };
}

function createSupabaseBackend(config: RuntimeConfig): BackendBase {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    if (import.meta.env.PROD) {
      return {
        kind: 'supabase',
        configured: false,
        description: 'Supabase no esta configurado para esta build.',
        async bootstrap() {
          return null;
        },
        async signInAdmin(_email, _password, _orgName) {
          throw new Error('Supabase no esta configurado.');
        },
        async completePasswordRecovery() {
          throw new Error('Supabase no esta configurado.');
        },
        async signOut() {
          return;
        },
        async signOutAdmin() {
          return;
        },
        async generatePairingCode() {
          throw new Error('Supabase no esta configurado.');
        },
        async registerClient() {
          throw new Error('Supabase no esta configurado.');
        },
        async createPreviewClientSession() {
          throw new Error('Supabase no esta configurado.');
        },
        async getAdminDashboard() {
          throw new Error('Supabase no esta configurado.');
        },
        async getClientDashboard() {
          throw new Error('Supabase no esta configurado.');
        },
        async createTicket() {
          throw new Error('Supabase no esta configurado.');
        },
        async saveDiagnostic() {
          throw new Error('Supabase no esta configurado.');
        },
        async createRemoteSession() {
          throw new Error('Supabase no esta configurado.');
        },
        async deleteDevice() {
          throw new Error('Supabase no esta configurado.');
        },
        async updateTicketStatus() {
          throw new Error('Supabase no esta configurado.');
        },
        async listReleases() {
          return [];
        },
        async checkForUpdates(currentVersion) {
          return {
            status: 'unconfigured',
            currentVersion,
            notes: 'Supabase no esta configurado en esta build.'
          };
        }
      };
    }

    return createLocalBackend(config);
  }

  const url = config.supabaseUrl.replace(/\/$/, '');
  const anonKey = config.supabaseAnonKey;

  const makeHeaders = (token?: string) => ({
    apikey: anonKey,
    Authorization: `Bearer ${token ?? anonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  });

  const request = async <T>(path: string, init?: RequestInit, token?: string): Promise<T> => {
    const response = await fetch(`${url}${path}`, {
      ...init,
      headers: {
        ...makeHeaders(token),
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Supabase error ${response.status}`);
    }

    if (response.status === 204) return null as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : null) as T;
  };

  const restPath = (table: string, params: Record<string, string> = {}) => {
    const search = new URLSearchParams({ select: '*' });
    Object.entries(params).forEach(([key, value]) => search.set(key, value));
    return `/rest/v1/${table}?${search.toString()}`;
  };

  const rpc = async <T>(name: string, payload: Record<string, unknown>, token?: string) =>
    request<T>(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }, token);

  const select = async <T>(table: string, params: Record<string, string> = {}, token?: string) =>
    request<T[]>(restPath(table, params), undefined, token);

  const single = async <T>(table: string, params: Record<string, string> = {}, token?: string) => {
    const rows = await select<T>(table, { ...params, limit: '1' }, token);
    return rows[0] ?? null;
  };

  const bootstrap = async (): Promise<StoredSession> => {
    const session = readSession();
    if (!session?.accessToken) return null;

    try {
      const user = await request<{ id: string; email: string | null; user_metadata?: Record<string, unknown> }>(
        '/auth/v1/user',
        { method: 'GET' },
        session.accessToken
      );

      if (session.role !== 'admin') return session;

      const profile = await single<AdminProfile>('admin_users', { user_id: `eq.${user.id}` }, session.accessToken);
      if (!profile) return null;
      return {
        role: 'admin',
        backendKind: 'supabase',
        userId: user.id,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        email: profile.email,
        displayName: profile.orgName,
        orgName: profile.orgName
      };
    } catch {
      return null;
    }
  };

  return {
    kind: 'supabase',
    configured: true,
    description: 'Backend Supabase conectado para tickets, login y realtime.',
    bootstrap,
    async signInAdmin(email, password, orgName) {
      const auth = await request<{ access_token: string; refresh_token: string; user: { id: string; email: string } }>(
        '/auth/v1/token?grant_type=password',
        {
          method: 'POST',
          body: JSON.stringify({ email, password })
        }
      );

      const profile = await single<AdminProfile>('admin_users', { user_id: `eq.${auth.user.id}` }, auth.access_token);
      if (!profile) {
        throw new Error('El usuario autenticado no figura como admin en la base.');
      }
      const session: AppSession = {
        role: 'admin',
        backendKind: 'supabase',
        userId: auth.user.id,
        accessToken: auth.access_token,
        refreshToken: auth.refresh_token,
        email,
        displayName: profile.orgName,
        orgName: profile.orgName
      };

      writeAdminSession(session);
      return { session, profile };
    },
    async completePasswordRecovery(accessToken, newPassword) {
      await request('/auth/v1/user', {
        method: 'PUT',
        body: JSON.stringify({ password: newPassword })
      }, accessToken);
    },
    async signOut() {
      writeSession(null);
    },
    async signOutAdmin() {
      writeAdminSession(null);
    },
    async generatePairingCode() {
      const session = readAdminSession();
      if (!session?.accessToken) {
        throw new Error('Necesitas iniciar sesion como admin para generar codigos de activacion.');
      }

      const result = await rpc<PairingCodeRecord>('generate_pairing_code', {}, session.accessToken);
      const record = Array.isArray(result) ? result[0] : result;
      return record as PairingCodeRecord;
    },
    async registerClient(input) {
      const result = await rpc<{ device: DeviceRecord; session: AppSession }>('register_device', {
        p_pairing_code: input.pairingCode,
        p_device_name: input.deviceName,
        p_computer_name: input.computerName,
        p_user_name: input.userName,
        p_os: input.os,
        p_platform: input.platform
      });

      const device = result.device;
      const session = {
        ...result.session,
        backendKind: 'supabase' as const,
        role: 'client' as const
      };

      writeSession(session);
      return { session, device };
    },
    async createPreviewClientSession() {
      throw new Error('La vista cliente de prueba solo esta disponible en modo local.');
    },
    async getAdminDashboard() {
      const session = readAdminSession();
      if (!session?.accessToken) throw new Error('No hay sesion admin activa.');

      const [profile, devices, tickets, diagnostics, sessions, releases, pairingCodes] = await Promise.all([
        single<AdminProfile>('admin_users', { user_id: `eq.${session.userId ?? ''}` }, session.accessToken),
        select<DeviceRecord>('devices', { order: 'updated_at.desc' }, session.accessToken),
        select<TicketRecord>('tickets', { order: 'updated_at.desc' }, session.accessToken),
        select<DiagnosticRecord>('diagnostics', { order: 'generated_at.desc' }, session.accessToken),
        select<SessionRecord>('sessions', { order: 'created_at.desc' }, session.accessToken),
        select<ReleaseRecord>('releases', { order: 'published_at.desc' }, session.accessToken),
        select<PairingCodeRecord>('pairing_codes', { order: 'created_at.desc' }, session.accessToken)
      ]);

      if (!profile) {
        throw new Error('No se pudo leer el perfil admin.');
      }

      return { profile, devices, tickets, diagnostics, sessions, releases, pairingCodes };
    },
    async getClientDashboard(deviceToken) {
      const result = await rpc<ClientDashboard>('get_client_dashboard', { p_device_token: deviceToken });
      return result;
    },
    async createTicket(input, deviceToken) {
      const result = await rpc<TicketRecord>('create_ticket', {
        p_device_token: deviceToken,
        p_issue: input.issue,
        p_client_name: input.clientName,
        p_priority: input.priority
      });
      return Array.isArray(result) ? result[0] : result;
    },
    async saveDiagnostic(input, deviceToken) {
      const result = await rpc<DiagnosticRecord>('save_diagnostic', {
        p_device_token: deviceToken,
        p_diagnostic: input.payload
      });
      return Array.isArray(result) ? result[0] : result;
    },
    async createRemoteSession(input, deviceToken) {
      const result = await rpc<SessionRecord>('create_remote_session', {
        p_device_token: deviceToken,
        p_ticket_id: input.ticketId
      });
      return Array.isArray(result) ? result[0] : result;
    },
    async deleteDevice(deviceId) {
      const session = readAdminSession();
      if (!session?.accessToken) throw new Error('No hay sesion admin activa.');

      await request(
        `/rest/v1/devices?id=eq.${deviceId}`,
        {
          method: 'DELETE'
        },
        session.accessToken
      );

      clearClientSessionIfMatching(deviceId);
    },
    async updateTicketStatus(ticketId, status) {
      const session = readAdminSession();
      if (!session?.accessToken) throw new Error('No hay sesion admin activa.');

      const rows = await request<TicketRecord[]>(
        restPath('tickets', { id: `eq.${ticketId}` }),
        {
          method: 'PATCH',
          body: JSON.stringify({ status, updated_at: nowIso() })
        },
        session.accessToken
      );

      return rows[0];
    },
    async listReleases() {
      return select<ReleaseRecord>('releases', { order: 'published_at.desc' }, anonKey);
    },
    async checkForUpdates(currentVersion) {
      try {
        const releases = await this.listReleases();
        const active = releases.filter((item) => item.isActive).sort((left, right) => compareVersions(right.version, left.version))[0];

        if (!active) {
          return {
            status: 'unconfigured',
            currentVersion,
            notes: 'No hay releases activas en Supabase.'
          };
        }

        if (compareVersions(active.version, currentVersion) > 0) {
          return {
            status: 'available',
            currentVersion,
            nextVersion: active.version,
            notes: active.notes,
            manifestUrl: active.manifestUrl,
            signature: active.signature
          };
        }

        return {
          status: 'current',
          currentVersion,
          notes: 'La version instalada esta al dia.',
          manifestUrl: active.manifestUrl,
          signature: active.signature
        };
      } catch (error) {
        return {
          status: 'error',
          currentVersion,
          notes: error instanceof Error ? error.message : 'No se pudo consultar updates.'
        };
      }
    }
  };
}

export function createBackend() {
  const config = getRuntimeConfig();
  return config.backendKind === 'supabase' ? createSupabaseBackend(config) : createLocalBackend(config);
}

export const backendConfig = getRuntimeConfig();
export const appBackend = createBackend();

export type { BackendBase as AppBackend };
