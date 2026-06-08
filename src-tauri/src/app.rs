#[cfg(not(target_os = "windows"))]
use chrono::Utc;
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, process::Command};
use tauri_plugin_updater::UpdaterExt;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticReport {
    generated_at: String,
    computer_name: String,
    user_name: String,
    os: String,
    cpu: String,
    ram_total_gb: f64,
    ram_free_gb: f64,
    system_drive_total_gb: f64,
    system_drive_free_gb: f64,
    startup_items: i64,
    defender_status: String,
    pending_reboot: bool,
    max_temperature_c: Option<f64>,
    temperature_note: String,
    thermal_zones: Vec<ThermalZoneReading>,
    storage_temperatures: Vec<StorageTemperatureReading>,
    recommendations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThermalZoneReading {
    name: String,
    temperature_c: Option<f64>,
    source: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageTemperatureReading {
    name: String,
    temperature_c: Option<f64>,
    source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteSession {
    code: String,
    expires_in_minutes: u8,
    instructions: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentStatus {
    mode: String,
    monitoring: bool,
    version: String,
    notes: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentActionResult {
    action: String,
    ok: bool,
    message: String,
    details: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteUpdateResult {
    status: String,
    current_version: String,
    next_version: Option<String>,
    notes: String,
    download_url: Option<String>,
}

#[tauri::command]
fn run_quick_diagnostic() -> Result<DiagnosticReport, String> {
    #[cfg(target_os = "windows")]
    {
        let raw = run_windows_diagnostic()?;
        let mut report: DiagnosticReport = serde_json::from_str(&raw)
            .map_err(|err| format!("No se pudo interpretar el diagnóstico: {err}. Salida: {raw}"))?;

        report.recommendations = build_recommendations(&report);
        Ok(report)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(DiagnosticReport {
            generated_at: Utc::now().to_rfc3339(),
            computer_name: "Equipo no Windows".to_string(),
            user_name: whoami_fallback(),
            os: std::env::consts::OS.to_string(),
            cpu: "No detectado".to_string(),
            ram_total_gb: 0.0,
            ram_free_gb: 0.0,
            system_drive_total_gb: 0.0,
            system_drive_free_gb: 0.0,
            startup_items: 0,
            defender_status: "No aplica".to_string(),
            pending_reboot: false,
            max_temperature_c: None,
            temperature_note: "No disponible fuera de Windows.".to_string(),
            thermal_zones: vec![],
            storage_temperatures: vec![],
            recommendations: vec!["Este MVP prioriza Windows. Preparar comandos por sistema operativo antes de liberar soporte multiplataforma.".to_string()],
        })
    }
}

#[tauri::command]
fn thermal_status() -> Result<AgentActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        let raw = run_windows_thermal_status()?;
        Ok(AgentActionResult {
            action: "thermal_status".to_string(),
            ok: true,
            message: "Temperatura ACPI leida.".to_string(),
            details: vec![raw],
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(AgentActionResult {
            action: "thermal_status".to_string(),
            ok: true,
            message: "Temperatura ACPI no aplica fuera de Windows.".to_string(),
            details: vec![],
        })
    }
}

#[tauri::command]
fn create_remote_session() -> Result<RemoteSession, String> {
    let code: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(6)
        .map(char::from)
        .collect::<String>()
        .to_uppercase();

    Ok(RemoteSession {
        code,
        expires_in_minutes: 20,
        instructions: "Compartí este código con el técnico. Próximo paso: asociarlo al ticket y abrir RustDesk/MeshCentral.".to_string(),
    })
}

#[tauri::command]
fn agent_status() -> Result<AgentStatus, String> {
    Ok(AgentStatus {
        mode: "on-demand".to_string(),
        monitoring: false,
        version: env!("CARGO_PKG_VERSION").to_string(),
        notes: "El agent se ejecuta solo cuando el usuario pide diagnóstico, soporte o mantenimiento. No queda monitoreando la PC.".to_string(),
    })
}

#[tauri::command]
fn open_admin_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("admin") {
        window.show().map_err(|err| format!("No se pudo mostrar el panel admin: {err}"))?;
        window.set_focus().map_err(|err| format!("No se pudo enfocar el panel admin: {err}"))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "admin", WebviewUrl::App("index.html?view=admin".into()))
        .title("UnderDock Admin")
        .inner_size(1280.0, 860.0)
        .resizable(true)
        .decorations(true)
        .build()
        .map_err(|err| format!("No se pudo abrir el panel admin: {err}"))?;

    Ok(())
}

#[tauri::command]
fn run_agent_action(action_id: String) -> Result<AgentActionResult, String> {
    match action_id.as_str() {
        "temp_scan" => scan_temp_files(),
        "startup_review" => startup_review(),
        "windows_update" => open_windows_update(),
        "defender_status" => defender_status(),
        "thermal_status" => thermal_status(),
        other => Ok(AgentActionResult {
            action: other.to_string(),
            ok: false,
            message: "Acción no reconocida.".to_string(),
            details: vec!["No se ejecutó ningún comando.".to_string()],
        }),
    }
}

#[tauri::command]
fn open_remote_tool() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(path) = find_rustdesk() {
            Command::new("cmd")
                .arg("/C")
                .arg("start")
                .arg("")
                .arg(path.as_os_str())
                .spawn()
                .map_err(|err| format!("No se pudo abrir RustDesk: {err}"))?;
            return Ok(format!("RustDesk abierto: {}", path.to_string_lossy()));
        }

        Ok("No encontré RustDesk. Poné rustdesk.exe en tools/rustdesk/rustdesk.exe o instalalo en Program Files. UnderDock sigue funcionando como ticket/diagnóstico.".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("La integración remota del MVP busca RustDesk en Windows. En otros sistemas hay que configurar el binario equivalente.".to_string())
    }
}

#[tauri::command]
async fn check_remote_update(app: tauri::AppHandle) -> Result<RemoteUpdateResult, String> {
    let updater = app
        .updater()
        .map_err(|err| format!("No se pudo preparar el updater nativo: {err}"))?;
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    match updater
        .check()
        .await
        .map_err(|err| format!("No se pudo consultar el feed de actualizaciones: {err}"))?
    {
        Some(update) => Ok(RemoteUpdateResult {
            status: "available".to_string(),
            current_version,
            next_version: Some(update.version.clone()),
            notes: update
                .body
                .clone()
                .unwrap_or_else(|| "Hay una actualización disponible.".to_string()),
            download_url: Some(update.download_url.to_string()),
        }),
        None => Ok(RemoteUpdateResult {
            status: "current".to_string(),
            current_version,
            next_version: None,
            notes: "La app está actualizada.".to_string(),
            download_url: None,
        }),
    }
}

#[tauri::command]
async fn install_remote_update(app: tauri::AppHandle) -> Result<RemoteUpdateResult, String> {
    let updater = app
        .updater()
        .map_err(|err| format!("No se pudo preparar el updater nativo: {err}"))?;
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    match updater
        .check()
        .await
        .map_err(|err| format!("No se pudo consultar el feed de actualizaciones: {err}"))?
    {
        Some(update) => {
            update
                .download_and_install(
                    |chunk_len, total| {
                        let downloaded_mb = chunk_len as f64 / (1024.0 * 1024.0);
                        let total_mb = total.map(|value| value as f64 / (1024.0 * 1024.0));
                        match total_mb {
                            Some(total_mb) => {
                                println!("Descargando actualización: {:.1} / {:.1} MB", downloaded_mb, total_mb);
                            }
                            None => {
                                println!("Descargando actualización: {:.1} MB", downloaded_mb);
                            }
                        }
                    },
                    || {
                        println!("Descarga completada, aplicando actualización...");
                    },
                )
                .await
                .map_err(|err| format!("No se pudo instalar la actualización: {err}"))?;

            Ok(RemoteUpdateResult {
                status: "available".to_string(),
                current_version,
                next_version: Some(update.version.clone()),
                notes: "Actualización aplicada. La app se reiniciará.".to_string(),
                download_url: Some(update.download_url.to_string()),
            })
        }
        None => Ok(RemoteUpdateResult {
            status: "current".to_string(),
            current_version,
            next_version: None,
            notes: "La app ya estaba actualizada.".to_string(),
            download_url: None,
        }),
    }
}

#[cfg(target_os = "windows")]
fn run_windows_diagnostic() -> Result<String, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$startupCount = (Get-CimInstance Win32_StartupCommand | Measure-Object).Count
$defender = Get-MpComputerStatus
$pending = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
$defenderStatus = if ($defender.AMServiceEnabled -eq $true) { 'Activo' } elseif ($null -eq $defender) { 'No detectado' } else { 'Revisar' }
$thermalZones = @()
$storageTemperatures = @()

try {
  $thermalZones = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | ForEach-Object {
    $tempC = $null
    if ($null -ne $_.CurrentTemperature) {
      $tempC = [Math]::Round(($_.CurrentTemperature / 10) - 273.15, 1)
    }

    [PSCustomObject]@{
      name = $_.InstanceName
      temperatureC = $tempC
      source = 'root\wmi:MSAcpi_ThermalZoneTemperature'
    }
  }
} catch {
  $thermalZones = @()
}

$storageTemperatures = @(
  Get-PhysicalDisk | ForEach-Object {
    $tempC = $null
    if ($null -ne $_.Temperature) {
      $tempC = [Math]::Round([double]$_.Temperature, 1)
    }

    [PSCustomObject]@{
      name = $_.FriendlyName
      temperatureC = $tempC
      source = 'Get-PhysicalDisk:Temperature'
    }
  }
) | Where-Object { $_.name }

$validTemps = $thermalZones | Where-Object { $null -ne $_.temperatureC }
$storageTemps = $storageTemperatures | Where-Object { $null -ne $_.temperatureC }
$allTemps = @()
if ($validTemps.Count -gt 0) { $allTemps += $validTemps }
if ($storageTemps.Count -gt 0) { $allTemps += $storageTemps }
$maxTemperatureC = if ($allTemps.Count -gt 0) { [Math]::Round((($allTemps | Measure-Object temperatureC -Maximum).Maximum), 1) } else { $null }
$temperatureNote = if ($storageTemps.Count -gt 0 -and $validTemps.Count -gt 0) {
  'Lectura combinada: ACPI para la zona térmica del equipo y sensores de almacenamiento cuando Windows los expone.'
} elseif ($storageTemps.Count -gt 0) {
  'Lectura de temperatura de almacenamiento disponible. No siempre representa CPU o GPU.'
} elseif ($validTemps.Count -gt 0) {
  'Lectura ACPI disponible. Puede reflejar la zona térmica del equipo, no siempre el sensor exacto del CPU.'
} else {
  'Windows no expuso zonas térmicas ACPI en este equipo. Para temperatura exacta de CPU/GPU usa una herramienta de sensores dedicada.'
}

[PSCustomObject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  computerName = $env:COMPUTERNAME
  userName = $env:USERNAME
  os = ($os.Caption + ' ' + $os.Version)
  cpu = $cpu.Name
  ramTotalGb = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  ramFreeGb = [Math]::Round($os.FreePhysicalMemory / 1MB, 1)
  systemDriveTotalGb = [Math]::Round($disk.Size / 1GB, 1)
  systemDriveFreeGb = [Math]::Round($disk.FreeSpace / 1GB, 1)
  startupItems = $startupCount
  defenderStatus = $defenderStatus
  pendingReboot = [bool]$pending
  maxTemperatureC = $maxTemperatureC
  temperatureNote = $temperatureNote
  thermalZones = @($thermalZones)
  storageTemperatures = @($storageTemperatures)
  recommendations = @()
} | ConvertTo-Json -Compress -Depth 4
"#;

    run_powershell(script)
}

#[cfg(target_os = "windows")]
fn run_windows_thermal_status() -> Result<String, String> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$thermalZones = @()

try {
  $thermalZones = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | ForEach-Object {
    $tempC = $null
    if ($null -ne $_.CurrentTemperature) {
      $tempC = [Math]::Round(($_.CurrentTemperature / 10) - 273.15, 1)
    }

    [PSCustomObject]@{
      name = $_.InstanceName
      temperatureC = $tempC
      source = 'root\wmi:MSAcpi_ThermalZoneTemperature'
    }
  }
} catch {
  $thermalZones = @()
}

$validTemps = $thermalZones | Where-Object { $null -ne $_.temperatureC }
$storageTemperatures = @(
  Get-PhysicalDisk | ForEach-Object {
    $tempC = $null
    if ($null -ne $_.Temperature) {
      $tempC = [Math]::Round([double]$_.Temperature, 1)
    }

    [PSCustomObject]@{
      name = $_.FriendlyName
      temperatureC = $tempC
      source = 'Get-PhysicalDisk:Temperature'
    }
  }
) | Where-Object { $_.name }

$storageTemps = $storageTemperatures | Where-Object { $null -ne $_.temperatureC }
$allTemps = @()
if ($validTemps.Count -gt 0) { $allTemps += $validTemps }
if ($storageTemps.Count -gt 0) { $allTemps += $storageTemps }
$maxTemperatureC = if ($allTemps.Count -gt 0) { [Math]::Round((($allTemps | Measure-Object temperatureC -Maximum).Maximum), 1) } else { $null }
$temperatureNote = if ($storageTemps.Count -gt 0 -and $validTemps.Count -gt 0) {
  'Lectura combinada: ACPI para la zona térmica del equipo y sensores de almacenamiento cuando Windows los expone.'
} elseif ($storageTemps.Count -gt 0) {
  'Lectura de temperatura de almacenamiento disponible. No siempre representa CPU o GPU.'
} elseif ($validTemps.Count -gt 0) {
  'Lectura ACPI disponible. Puede reflejar la zona térmica del equipo, no siempre el sensor exacto del CPU.'
} else {
  'Windows no expuso zonas térmicas ACPI en este equipo. Para temperatura exacta de CPU/GPU usa una herramienta de sensores dedicada.'
}

[PSCustomObject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  maxTemperatureC = $maxTemperatureC
  temperatureNote = $temperatureNote
  thermalZones = @($thermalZones)
  storageTemperatures = @($storageTemperatures)
} | ConvertTo-Json -Compress -Depth 4
"#;

    run_powershell(script)
}

fn build_recommendations(report: &DiagnosticReport) -> Vec<String> {
    let mut items = Vec::new();

    if report.system_drive_total_gb > 0.0 {
        let free_ratio = report.system_drive_free_gb / report.system_drive_total_gb;
        if free_ratio < 0.15 {
            items.push("Espacio bajo en C:. Limpiar temporales y revisar carpetas pesadas antes de actualizar Windows.".to_string());
        } else {
            items.push("Espacio en disco aceptable. Mantener mínimo 15% libre para actualizaciones y rendimiento.".to_string());
        }
    }

    if report.startup_items > 14 {
        items.push("Hay muchos programas iniciando con Windows. Revisar uno por uno, no desactivar drivers ni seguridad a ciegas.".to_string());
    } else {
        items.push("Cantidad de programas de inicio razonable. No hace falta tocarlo si el usuario no reporta lentitud.".to_string());
    }

    if report.pending_reboot {
        items.push("Hay reinicio pendiente. Reiniciar antes de diagnosticar errores raros o ejecutar reparaciones.".to_string());
    }

    if report.defender_status != "Activo" {
        items.push("Defender no aparece activo. Verificar antivirus instalado, licencias y protección en tiempo real.".to_string());
    }

    items.push("Crear punto de restauración antes de mantenimiento profundo.".to_string());
    items.push("Evitar limpieza de registro y optimizadores agresivos: generan más problemas que soluciones.".to_string());

    items
}

#[cfg(target_os = "windows")]
fn run_powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|err| format!("No se pudo ejecutar PowerShell: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn scan_temp_files() -> Result<AgentActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
$paths = @($env:TEMP, 'C:\Windows\Temp') | Where-Object { Test-Path $_ }
$items = foreach ($p in $paths) { Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue }
$total = ($items | Measure-Object Length -Sum).Sum
$count = ($items | Measure-Object).Count
[PSCustomObject]@{ count = $count; gb = [Math]::Round($total / 1GB, 2); paths = $paths } | ConvertTo-Json -Compress
"#;
        let raw = run_powershell(script)?;
        Ok(AgentActionResult {
            action: "temp_scan".to_string(),
            ok: true,
            message: "Temporales escaneados. No se borró nada.".to_string(),
            details: vec![raw],
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(AgentActionResult {
            action: "temp_scan".to_string(),
            ok: true,
            message: "Escaneo demo: esta acción está implementada para Windows.".to_string(),
            details: vec![],
        })
    }
}

fn startup_review() -> Result<AgentActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
Get-CimInstance Win32_StartupCommand | Select-Object -First 12 Name, Command, Location | ConvertTo-Json -Compress -Depth 4
"#;
        let raw = run_powershell(script)?;
        Ok(AgentActionResult {
            action: "startup_review".to_string(),
            ok: true,
            message: "Inicio revisado. No se desactivó nada.".to_string(),
            details: vec![raw],
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(AgentActionResult {
            action: "startup_review".to_string(),
            ok: true,
            message: "Revisión demo: esta acción está implementada para Windows.".to_string(),
            details: vec![],
        })
    }
}

fn open_windows_update() -> Result<AgentActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg("ms-settings:windowsupdate")
            .spawn()
            .map_err(|err| format!("No se pudo abrir Windows Update: {err}"))?;

        Ok(AgentActionResult {
            action: "windows_update".to_string(),
            ok: true,
            message: "Windows Update abierto.".to_string(),
            details: vec!["El usuario mantiene control visual de la acción.".to_string()],
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(AgentActionResult {
            action: "windows_update".to_string(),
            ok: true,
            message: "Windows Update no aplica fuera de Windows.".to_string(),
            details: vec![],
        })
    }
}

fn defender_status() -> Result<AgentActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
$defender = Get-MpComputerStatus
[PSCustomObject]@{
  amServiceEnabled = $defender.AMServiceEnabled
  antivirusEnabled = $defender.AntivirusEnabled
  realTimeProtectionEnabled = $defender.RealTimeProtectionEnabled
  quickScanAge = $defender.QuickScanAge
  fullScanAge = $defender.FullScanAge
} | ConvertTo-Json -Compress
"#;
        let raw = run_powershell(script)?;
        Ok(AgentActionResult {
            action: "defender_status".to_string(),
            ok: true,
            message: "Estado de Defender leído.".to_string(),
            details: vec![raw],
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(AgentActionResult {
            action: "defender_status".to_string(),
            ok: true,
            message: "Defender no aplica fuera de Windows.".to_string(),
            details: vec![],
        })
    }
}

#[cfg(target_os = "windows")]
fn find_rustdesk() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("tools").join("rustdesk").join("rustdesk.exe"));
            candidates.push(dir.join("rustdesk.exe"));
        }
    }

    candidates.push(PathBuf::from(r"C:\Program Files\RustDesk\RustDesk.exe"));
    candidates.push(PathBuf::from(r"C:\Program Files (x86)\RustDesk\RustDesk.exe"));

    candidates.into_iter().find(|path| path.exists())
}

#[cfg(not(target_os = "windows"))]
fn whoami_fallback() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "usuario".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            check_remote_update,
            install_remote_update,
            run_quick_diagnostic,
            thermal_status,
            create_remote_session,
            agent_status,
            open_admin_window,
            run_agent_action,
            open_remote_tool
        ])
        .run(tauri::generate_context!())
        .expect("error while running UnderDock");
}
