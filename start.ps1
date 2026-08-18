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

$npmExecutable = if ($IsWindows -or $env:OS -like "*Windows*") { "npm.cmd" } else { "npm" }

Write-Host "Starting HUNTFLOW (Next.js + Scrapling Agent)..." -ForegroundColor Green
& $npmExecutable run dev

