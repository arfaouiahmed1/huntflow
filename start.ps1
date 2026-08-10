$ErrorActionPreference = "Stop"

Write-Host @"
=============================================================================
  _   _ _   _ _   _ _____ _____ _     _____        __ 
 | | | | | | | \ | |_   _|  ___| |   / _ \ \      / / 
 | |_| | | | |  \| | | | | |_  | |  | | | \ \ /\ / /  
 |  _  | |_| | |\  | | | |  _| | |__| |_| |\ V  V /   
 |_| |_|\___/|_| \_| |_| |_|   |_____\___/  \_/\_/    
                                                      
                  Job Finder v0.1.0                   
=============================================================================
"@ -ForegroundColor Cyan

# Clean up any leftover process on port 8001 before starting
$existing8001 = Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue
if ($existing8001) {
    Write-Host "Port 8001 is currently in use by PID $($existing8001.OwningProcess). Freeing port..." -ForegroundColor Yellow
    Stop-Process -Id $existing8001.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

$pythonJob = $null
$nextJob = $null

try {
    Write-Host "Starting Scrapling Agent server..." -ForegroundColor Green
    $pythonJob = Start-Process -FilePath "uv" -ArgumentList "run uvicorn server:app --port 8001" -WorkingDirectory "$PSScriptRoot/scrapling-agent" -PassThru -NoNewWindow

    Write-Host "Starting Next.js dev server..." -ForegroundColor Green
    $npmExecutable = if ($IsWindows -or $env:OS -like "*Windows*") { "npm.cmd" } else { "npm" }
    $nextJob = Start-Process -FilePath $npmExecutable -ArgumentList "run dev" -WorkingDirectory $PSScriptRoot -PassThru -NoNewWindow

    Write-Host "Both servers are running. Press Ctrl+C to stop." -ForegroundColor Yellow

    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping servers..." -ForegroundColor Yellow
    if ($pythonJob -and -not $pythonJob.HasExited) {
        Stop-Process -Id $pythonJob.Id -Force -ErrorAction SilentlyContinue
    }
    if ($nextJob -and -not $nextJob.HasExited) {
        Stop-Process -Id $nextJob.Id -Force -ErrorAction SilentlyContinue
    }
    $leftover8001 = Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue
    if ($leftover8001) {
        Stop-Process -Id $leftover8001.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Write-Host "All servers stopped." -ForegroundColor Green
}
