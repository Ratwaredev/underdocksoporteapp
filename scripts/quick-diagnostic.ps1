$ErrorActionPreference = 'SilentlyContinue'

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$startupCount = (Get-CimInstance Win32_StartupCommand | Measure-Object).Count
$defender = Get-MpComputerStatus
$pending = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
$defenderStatus = if ($defender.AMServiceEnabled -eq $true) { 'Activo' } elseif ($null -eq $defender) { 'No detectado' } else { 'Revisar' }

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
} | ConvertTo-Json -Depth 4
