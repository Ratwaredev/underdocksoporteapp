# UnderDock Command UI

UnderDock is a desktop support deck built with Tauri + React + TypeScript.

It now supports two modes:

- `Client`: register a machine, run on-demand diagnostics, create tickets, and open remote support.
- `Admin`: sign in, see the central queue, generate pairing codes, change ticket status, and check releases.

## What is working

- Windows diagnostic on demand through Tauri + PowerShell/WMI.
- Local demo backend with persisted tickets, devices, pairing codes, and releases.
- Supabase-compatible backend path for real sync across machines.
- RustDesk integration for remote support.
- Update feed checking from the backend/release table.

## What you need for a real multi-PC setup

1. A Supabase project.
2. The schema from `infra/supabase/schema.sql`.
3. `.env` values copied from `.env.example`.
4. A release row in `public.releases`.
5. A matching remote tool binary or URL.

## Local demo mode

If you do not set Supabase env vars, the app runs in local demo mode.

- Admin login defaults to `admin@underdock.local` / `admin123`.
- Client pairing code defaults to `DEMO-PAIR`.
- Data stays in the current browser profile.

## Supabase setup

1. Create a project.
2. Run `infra/supabase/schema.sql` in the SQL editor.
3. Insert an admin row in `public.admin_users` for your Supabase user ID.
4. Copy values into `.env`.
5. Rebuild the desktop app.

## Dev

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

## Notes

- The app is still Windows-first.
- Remote support uses RustDesk as the default engine.
- Automatic updater delivery still needs a real hosted manifest and signed release assets.

