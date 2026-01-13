# ZAP Configuration Quick Reference

## What Was Fixed

✅ **Memory**: 8GB → 9GB (handles 15K+ URLs)  
✅ **File Limit**: Default 16MB → 50MB (prevents video file loops)  
✅ **API Timeouts**: 30s → 60s with 3 retries  
✅ **Error Recovery**: Added cached counts, failure tracking  
✅ **File Exclusions**: Auto-skip videos, archives, executables (18 patterns)  
✅ **Monitoring**: Stuck scan detection, progress tracking  

## How to Use

### Start ZAP (Production)

```powershell
cd c:\Users\yashr\Desktop\SSDT
powershell -ExecutionPolicy Bypass .\scripts\start_zap_production.ps1
```

Wait for "[OK] ZAP READY FOR PRODUCTION" message (~90 seconds).

### Run a Scan

```powershell
cd backend\scripts
python zap_ai_scanner.py https://example.com
```

**Options**:
- `--quick` - Fast scan (reduced depth)
- `--output custom-name` - Custom report prefix

### Check Container Status

```powershell
docker ps  # Should show "Up X minutes (healthy)"
docker stats zap-scanner  # Monitor resource usage
```

### View Exclusions

```powershell
Invoke-WebRequest -Uri "http://localhost:8080/JSON/core/view/excludedFromProxy/" | ConvertFrom-Json
```

## Configuration Summary

| Setting | Value | Purpose |
|---------|-------|---------|
| **RAM** | 9GB | Prevents OOM on large scans |
| **CPUs** | 4 cores | Parallel processing |
| **File Limit** | 50MB | Handles large responses |
| **Spider Depth** | 20 levels | Deep crawling |
| **Spider Duration** | 120 min | Large site tolerance |
| **Active Scan** | 180 min max | Thorough testing |
| **Threads** | 10 per host | Maximum speed |

## File Exclusions (18 patterns)

**Videos**: .webm, .mp4, .mov, .avi, .mkv, .flv, .wmv  
**Archives**: .zip, .tar, .gz, .rar, .7z, .iso, .dmg  
**Executables**: .exe, .msi, .app, .deb, .rpm, .pkg  

## Expected Performance

**15,000 URL Scan**:
- Discovery: 30 min
- Passive: 20 min  
- Active: 5-6 hours
- Reports: 10 min
- **Total**: ~6-7 hours

**Memory Usage**:
- Peak: 6.5-7.5GB (72-83% of limit)
- Safe margin: ~1.5GB remaining

## Troubleshooting

**Container won't start**:
```powershell
docker-compose down
docker-compose up -d zap
```

**API not responding**:
```powershell
docker logs zap-scanner --tail 50
```

**Restore backup**:
```powershell
Copy-Item backend\scripts\zap_ai_scanner.py.backup-20260107-004156 backend\scripts\zap_ai_scanner.py -Force
docker-compose restart zap
```

## Files Modified

1. `docker-compose.yml` - Container config
2. `backend/scripts/zap_ai_scanner.py` - Scanner logic
3. `scripts/start_zap_production.ps1` - Startup automation (NEW)
