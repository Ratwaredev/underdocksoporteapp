# UnderDock Command UI

UnderDock is a desktop support deck built with Tauri + React + TypeScript.

It now supports two modes:

- `Client`: enter an activation code, register the machine, run on-demand diagnostics, create tickets, and open remote support.
- `Admin`: sign in, see the central queue, generate activation codes, change ticket status, and check releases.

## What is working

- Windows diagnostic on demand through Tauri + PowerShell/WMI.
- Local demo backend with persisted tickets, devices, activation codes, and releases.
- Supabase-compatible backend path for real sync across machines.
- RustDesk integration for remote support.
- Update feed checking from the backend/release table.

## What you need for a real multi-PC setup

1. A Supabase project.
2. The schema from `infra/supabase/schema.sql`.
3. `.env` values copied from `.env.example`.
4. A release row in `public.releases`.
5. A matching remote tool binary or URL.
6. A real Tauri updater manifest hosted over HTTPS.

## Local demo mode

If you do not set Supabase env vars, the app runs in local demo mode.

- Admin login defaults to `admin@underdock.local` / `admin123`.
- Client activation code defaults to `DEMO-PAIR`.
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
- Automatic updater delivery is wired to GitHub Releases, but you still need to publish a real `latest.json` manifest and replace the placeholder updater public key with the key that matches your signed builds.

## Remote update flow

1. Generate a Tauri signing key once.
2. Build a new Windows release with the signing key in your environment.
3. Publish the generated installer, its `.sig` file, and `latest.json` to `Ratwaredev/underdocksoporteapp` GitHub Releases.
4. Keep `public.releases` in Supabase in sync so the admin panel shows the active version.
5. On the client PC, the updater checks GitHub Releases and installs the available version when the user clicks update.

## Exact update setup

In PowerShell:

```powershell
# Use the release signing key generated for this repo.
# The private key is password-protected, so set both env vars before building.
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$env:USERPROFILE\.tauri\underdock-release.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content -Raw "$env:USERPROFILE\.tauri\underdock-release.pass"
npm run tauri:build
```

After the build finishes, upload these files from `src-tauri/target/release/bundle/` to GitHub Releases:

- `UnderDock Command UI_0.1.3_x64-setup.exe` or `UnderDock Command UI_0.1.3_x64_en-US.msi`
- the matching `.sig`
- `latest.json`

The `latest.json` file must contain the version, notes, pub_date, and a `platforms.windows-x86_64` entry with the release URL and signature content.

If you want to use a different key instead, regenerate the private/public pair and update `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` to match the new `.pub` file. Keep the private key password out of the repo and load it from a local file or secret store when building.
