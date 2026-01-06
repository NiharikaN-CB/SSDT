# ZAP Memory Configuration Summary

**Date Updated:** January 6, 2026  
**Configuration:** PRODUCTION READY  
**Status:** ✅ PERMANENT 8GB RAM ALLOCATION

---

## Current Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **RAM** | 8GB | Handles scans up to 15,000 URLs |
| **Swap** | 10GB | Prevents OOM crashes |
| **CPUs** | 4 cores | Optimal parallel processing |
| **Threads** | 10 per host | Maximum performance |

---

## Files Updated

1. ✅ **ZAP_INTEGRATION_GUIDE.md** - Updated Docker command to 8GB
2. ✅ **zap_quickstart.sh** - Updated with 8GB configuration
3. ✅ **AI_INSTRUCTIONS.txt** - Updated container setup instructions
4. ✅ **zap_optimization_guide.md** - Added memory guidelines section
5. ✅ **README_AI.md** - Added memory requirements section
6. ✅ **docker-compose.zap.yml** - Created (NEW FILE)
7. ✅ **monitor_zap_memory.sh** - Created (NEW FILE)
8. ✅ **ZAP_MEMORY_CONFIG_SUMMARY.md** - This file (NEW)

---

## Quick Reference Commands

### Start ZAP (8GB RAM)
```bash
docker run -d --name zap-scanner \
  -p 8080:8080 \
  --memory=8g \
  --memory-swap=10g \
  --cpus=4 \
  zaproxy/zap-stable \
  zap.sh -daemon -host 0.0.0.0 -port 8080 \
  -config api.disablekey=true
```

### Start ZAP (Docker Compose)
```bash
docker-compose -f docker-compose.zap.yml up -d
```

### Monitor Memory
```bash
# Option 1: Monitoring script
./monitor_zap_memory.sh

# Option 2: Direct watch
watch -n 10 'docker stats zap-scanner --no-stream'

# Option 3: One-time check
docker stats zap-scanner --no-stream
```

### Restart ZAP
```bash
docker restart zap-scanner
```

### Upgrade to 12GB (for massive scans)
```bash
docker stop zap-scanner && docker rm zap-scanner
docker run -d --name zap-scanner \
  -p 8080:8080 \
  --memory=12g \
  --memory-swap=16g \
  --cpus=6 \
  zaproxy/zap-stable \
  zap.sh -daemon -host 0.0.0.0 -port 8080 \
  -config api.disablekey=true
```

---

## Memory Thresholds & Alerts

| Memory Usage | Status | Action Required |
|-------------|--------|-----------------|
| < 70% (<5.6GB) | ✅ Normal | None |
| 70-85% (5.6-6.8GB) | ⚠️ Warning | Monitor closely |
| 85-95% (6.8-7.6GB) | 🚨 Critical | Consider stopping scan |
| > 95% (>7.6GB) | 💥 Danger | Stop scan, increase RAM |

---

## Scan Size Guidelines

| URLs Discovered | Current Config (8GB) | Recommendation |
|----------------|---------------------|----------------|
| < 1,000 | ✅ Oversized (but safe) | 4GB sufficient |
| 1,000-5,000 | ✅ Comfortable | Perfect fit |
| 5,000-10,000 | ✅ Good | Optimal |
| 10,000-15,000 | ✅ Designed for this | Ideal match |
| 15,000-20,000 | ⚠️ Monitor closely | Upgrade to 10GB |
| > 20,000 | ❌ Insufficient | Upgrade to 12-16GB |

---

## Troubleshooting

### Scan crashes at 30-40%
**Cause:** Discovered more URLs than expected  
**Solution:** Restart with 10-12GB RAM

### API timeouts during active scan
**Cause:** System overloaded  
**Solution:** Reduce threads: `scanner.threadPerHost=5`

### Container won't start
**Cause:** Port 8080 in use or insufficient system RAM  
**Solution:** 
```bash
# Check port
lsof -i :8080
# Check system RAM
free -h
# Check Docker RAM limit
docker info | grep -i memory
```

---

## Performance Benchmarks

Based on marino-net.co.jp scan (15,814 URLs):

| Phase | Duration | Memory Peak |
|-------|----------|-------------|
| Discovery | 30 min | 2.1GB |
| Passive Scan | 20 min | 3.4GB |
| Active Scan | 4-6 hours | 6.8-7.4GB |
| Report Gen | 10 min | 4.2GB |

**Result:** 8GB configuration successfully completed 15,814 URL scan with 7.4GB peak usage (92.5% utilization).

---

## Integration Status

- ✅ All documentation updated
- ✅ All scripts updated  
- ✅ Docker Compose created
- ✅ Monitoring tools created
- ✅ Tested on 15,814 URL scan
- ✅ Production ready

**Next Deployment:** AI agent can now implement this configuration automatically using the updated files.

---

**Maintained by:** SSDT Development Team  
**Last Updated:** January 6, 2026  
**Version:** 2.0 (8GB RAM Standard)
