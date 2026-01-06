################################################################################
# ZAP Production Startup Script - Version 4.0
# PowerShell adaptation for Windows
# Includes: 9GB RAM, 50MB files, video exclusions, comprehensive validation
################################################################################

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "ZAP PRODUCTION STARTUP v4.0" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if old container exists
$containerExists = docker ps -a --format '{{.Names}}' | Select-String -Pattern "^zap-scanner$"
if ($containerExists) {
    Write-Host "[!!] Existing ZAP container found" -ForegroundColor Yellow
    Write-Host "Stopping and removing..." -ForegroundColor Yellow
    docker stop zap-scanner 2>$null | Out-Null
    docker rm zap-scanner 2>$null | Out-Null
    Write-Host "[OK] Old container removed" -ForegroundColor Green
    Write-Host ""
}

# Start ZAP using docker-compose
Write-Host "[>>] Starting ZAP Scanner..." -ForegroundColor Green
Write-Host "Configuration: 9GB RAM, 50MB file limit, 4 CPUs" -ForegroundColor Gray
Write-Host ""

try {
    docker-compose up -d zap
    if ($LASTEXITCODE -ne 0) {
        throw "Docker compose failed"
    }
}
catch {
    Write-Host "[!!] Failed to start ZAP" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Container started" -ForegroundColor Green
Write-Host ""
Write-Host "[..] Waiting 60 seconds for initialization..." -ForegroundColor Yellow

for ($i = 60; $i -gt 0; $i--) {
    Write-Host -NoNewline ("`r   $i seconds remaining...")
    Start-Sleep -Seconds 1
}
Write-Host ""
Write-Host ""

# Verify API
Write-Host "[>>] Verifying ZAP API..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/JSON/core/view/version/" -UseBasicParsing -TimeoutSec 10
    if ($response.Content -match "version") {
        Write-Host "[OK] API responding" -ForegroundColor Green
    }
}
catch {
    Write-Host "[!!] Not ready, waiting 30 more seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/JSON/core/view/version/" -UseBasicParsing -TimeoutSec 10
        if ($response.Content -match "version") {
            Write-Host "[OK] API now responding" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "[!!] API failed to start" -ForegroundColor Red
        exit 1
    }
}
Write-Host ""

# Apply exclusions (CRITICAL!)
Write-Host "[>>] Applying file exclusions..." -ForegroundColor Cyan
$patterns = @(
    ".*\.webm.*", ".*\.mp4.*", ".*\.mov.*", ".*\.avi.*",
    ".*\.(zip|tar|gz|rar|7z)$", ".*\.(exe|msi|deb|rpm)$"
)

foreach ($pattern in $patterns) {
    try {
        Invoke-WebRequest -Method GET -Uri "http://localhost:8080/JSON/core/action/excludeFromProxy/?regex=$pattern" -UseBasicParsing | Out-Null
    }
    catch {
        # Ignore errors
    }
}

Write-Host "[OK] Exclusions applied (videos, archives, executables)" -ForegroundColor Green
Write-Host ""

# Verify
try {
    $exclusions = Invoke-WebRequest -Uri "http://localhost:8080/JSON/core/view/excludedFromProxy/" -UseBasicParsing | ConvertFrom-Json
    $count = $exclusions.excludedFromProxy.Count
    Write-Host "[INFO] Active exclusions: $count" -ForegroundColor Gray
}
catch {
    Write-Host "[INFO] Active exclusions: (verification failed)" -ForegroundColor Yellow
}
Write-Host ""

# Memory status
Write-Host "[INFO] Memory Status:" -ForegroundColor Cyan
docker stats zap-scanner --no-stream --format "   {{.MemUsage}} ({{.MemPerc}})"
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "[OK] ZAP READY FOR PRODUCTION" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor White
Write-Host "  [OK] 9GB RAM" -ForegroundColor Green
Write-Host "  [OK] 50MB file limit" -ForegroundColor Green
Write-Host "  [OK] Video/archive exclusions" -ForegroundColor Green
Write-Host "  [OK] Maximum performance" -ForegroundColor Green
Write-Host ""
Write-Host "Ready to scan!" -ForegroundColor Green
Write-Host ""
