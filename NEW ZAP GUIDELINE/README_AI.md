# ZAP Maximum Performance Scanner - AI Agent Guide

## Quick Start for AI Agents

This system provides **3 ways** for your AI to run ZAP at maximum performance on ANY target URL:

### Method 1: Python Script (RECOMMENDED for AI agents)
```bash
# Install ZAP
docker run -d --name zap-scanner \
  -p 8080:8080 \
  --memory=8g \
  --memory-swap=10g \
  --cpus=4 \
  zaproxy/zap-stable \
  zap.sh -daemon -host 0.0.0.0 -port 8080 -config api.disablekey=true

# Wait 30-60 seconds for ZAP to start, then:
python3 zap_ai_scanner.py https://target.com

# For quick scan (reduced time):
python3 zap_ai_scanner.py https://target.com --quick

# For Japanese/international sites:
python3 zap_ai_scanner.py https://example.co.jp
```

**Advantages:**
- Structured output for AI parsing
- Real-time progress monitoring
- Error handling built-in
- JSON statistics output

### Method 2: Bash Script (Full Control)
```bash
# Launch ZAP with optimal settings
docker run -d --name zap-scanner \
  -p 8080:8080 \
  --memory=8g \
  --memory-swap=10g \
  --cpus=4 \
  zaproxy/zap-stable \
  zap.sh -daemon -host 0.0.0.0 -port 8080 -config api.disablekey=true

# Wait for ZAP to start, then run scan
./zap_max_scan.sh https://target.com
```

### Method 3: Quick Start Wrapper
```bash
# All-in-one: launches Docker and runs scan
./zap_quickstart.sh https://target.com
```

---

## Memory Requirements

ZAP is configured with **8GB RAM** by default, suitable for scans discovering up to 15,000 URLs.

### Starting ZAP

**Method 1: Direct Docker Command**
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

**Method 2: Using Quick Start Script**
```bash
./zap_quickstart.sh
```

**Method 3: Using Docker Compose**
```bash
docker-compose -f docker-compose.zap.yml up -d
```

### Monitoring Memory

```bash
# Watch memory usage
watch -n 10 'docker stats zap-scanner --no-stream'

# Or use the monitoring script
./monitor_zap_memory.sh
```

### Troubleshooting Memory Issues

**Symptom**: Scan crashes at 30-40% completion

**Cause**: Insufficient memory for large URL discovery

**Solution**: Increase RAM allocation
```bash
docker stop zap-scanner && docker rm zap-scanner
docker run -d --name zap-scanner -p 8080:8080 --memory=12g --cpus=6 zaproxy/zap-stable zap.sh -daemon -host 0.0.0.0 -port 8080 -config api.disablekey=true
```

### Memory Guidelines

| Your Scan Size | RAM Needed |
|----------------|------------|
| Small (<5K URLs) | 4-6 GB |
| Medium (5-10K URLs) | 6-8 GB |
| Large (10-15K URLs) | 8-10 GB ✅ Default |
| Massive (15K+ URLs) | 10-16 GB |

---

## For Your AI Agent: Understanding the Workflow

### Phase 1: Configuration
Your AI should:
1. Launch ZAP container with optimal resource limits (4GB RAM, 2 CPUs)
2. Wait for ZAP API to be ready (check `http://localhost:8080/JSON/core/view/version`)
3. Configure spider, AJAX spider, and active scanner via API

### Phase 2: Discovery
- **Traditional Spider**: Crawls static HTML links (50-500+ URLs)
- **AJAX Spider**: Executes JavaScript to find dynamic content (100-2000+ URLs)
- **Total**: Combines both for comprehensive discovery

### Phase 3: Scanning
- **Passive Scan**: Analyzes all proxied traffic (automatic)
- **Active Scan**: Injects payloads to find vulnerabilities (1-3+ hours)

### Phase 4: Reporting
- Generates HTML, JSON, and XML reports
- Provides alert statistics by severity

---

## AI Agent Integration Example

```python
import subprocess
import json
import time

def scan_target(target_url):
    """AI agent function to scan a target"""
    
    # 1. Start ZAP container
    subprocess.run([
        "docker", "run", "-d", "--name", "zap-scanner",
        "-p", "8080:8080", "--memory=4g", "--cpus=2",
        "zaproxy/zap-stable", "zap.sh", "-daemon",
        "-host", "0.0.0.0", "-port", "8080",
        "-config", "api.disablekey=true"
    ])
    
    # 2. Wait for ZAP to start
    print("Waiting for ZAP to initialize...")
    time.sleep(60)
    
    # 3. Run scan
    result = subprocess.run(
        ["python3", "zap_ai_scanner.py", target_url],
        capture_output=True,
        text=True
    )
    
    # 4. Parse results
    if result.returncode == 0:
        # Extract JSON from output
        lines = result.stdout.split('\n')
        for i, line in enumerate(lines):
            if line.startswith('{'):
                stats = json.loads('\n'.join(lines[i:]))
                return stats
    
    return None

# Usage
stats = scan_target("https://example.com")
if stats:
    print(f"Found {stats['alerts']} security issues")
    print(f"High risk: {stats['breakdown'].get('High', 0)}")
```

---

## Expected Output Parsing

### Python Script Output Format
```
[INFO] Waiting for ZAP to start...
[INFO] ZAP ready (version: 2.XX.X)
[INFO] Configuring traditional spider...
[INFO] Traditional spider configured
[INFO] === PHASE 1: TRADITIONAL SPIDER ===
[INFO] Spider ID: 0
[INFO] Spider: 50% | URLs: 125
[INFO] Spider: 100% | URLs: 247
[INFO] Traditional spider complete: 247 URLs found
[INFO] === PHASE 2: AJAX SPIDER ===
[INFO] AJAX spider started
[INFO] AJAX Spider: running | URLs: 83
[INFO] AJAX spider complete: 156 URLs found
[INFO] === DISCOVERY COMPLETE: 403 total URLs ===
[INFO] === PHASE 3: PASSIVE SCAN ===
[INFO] Passive scan: 403 records remaining
[INFO] Passive scan complete
[INFO] === PHASE 4: ACTIVE SCAN ===
[INFO] Active scan ID: 0
[INFO] Active scan: 25% | Alerts: 12
[INFO] Active scan: 100% | Alerts: 47
[INFO] Active scan complete
[INFO] === PHASE 5: GENERATING REPORTS ===
[INFO] HTML report: zap-report-20260105-143022.html
[INFO] JSON report: zap-report-20260105-143022.json
[INFO] XML report: zap-report-20260105-143022.xml
[INFO] === SCAN STATISTICS ===
[INFO] Total URLs discovered: 403
[INFO] Total alerts: 47
[INFO]   High Risk: 3
[INFO]   Medium Risk: 12
[INFO]   Low Risk: 18
[INFO]   Informational: 14
[INFO] === SCAN COMPLETE ===

{
  "target": "https://example.com",
  "urls": 403,
  "alerts": 47,
  "breakdown": {
    "High": 3,
    "Medium": 12,
    "Low": 18,
    "Informational": 14
  }
}
```

### Your AI Should Parse:
- **Phase completion**: Look for `===` markers
- **URL discovery**: Extract numbers after "URLs found"
- **Alert severity**: Parse the breakdown section
- **Final JSON**: Last JSON object contains summary

---

## Handling Different Scenarios

### Scenario 1: Japanese Website
```bash
python3 zap_ai_scanner.py https://example.co.jp
# No special handling needed - UTF-8 support is automatic
```

### Scenario 2: Site with Authentication
1. Modify the script to add authentication configuration
2. Use ZAP's authentication API endpoints
3. See section 5 in the main guide

### Scenario 3: Very Large Site
```bash
# Use quick mode for faster results
python3 zap_ai_scanner.py https://large-site.com --quick

# Or increase timeouts in the script
# max_duration parameters can be adjusted
```

### Scenario 4: API-Only Target
```bash
# ZAP works with APIs too
python3 zap_ai_scanner.py https://api.example.com

# For OpenAPI/Swagger specs, import them via ZAP API first
```

---

## Troubleshooting for AI Agents

### Problem: Low URL Discovery (<10 URLs)
**Diagnosis:**
- Site has aggressive bot protection
- Site is mostly static with few links
- Robots.txt blocking

**Solution:**
- Check if site allows automated scanning
- Manually seed with known URLs
- Disable robots.txt parsing (already done in scripts)

### Problem: Scan Takes Too Long
**Diagnosis:**
- Too many URLs discovered (1000+)
- Site is very slow to respond
- Active scanner finding many injection points

**Solution:**
- Use `--quick` mode
- Reduce scope to specific paths
- Set lower max duration

### Problem: ZAP Fails to Start
**Diagnosis:**
- Port 8080 already in use
- Insufficient Docker resources
- ZAP container crashed

**Solution:**
```bash
# Check if port is in use
lsof -i :8080

# Check container logs
docker logs zap-scanner

# Remove and restart
docker stop zap-scanner && docker rm zap-scanner
```

### Problem: No Alerts Found
**Diagnosis:**
- Site is well-secured
- Active scan didn't run
- Scan policy too conservative

**Result:**
- This is actually GOOD - means site is secure
- Verify passive scan found informational issues
- Check that active scan completed (look for 100% in logs)

---

## Performance Benchmarks

| Site Type | URLs Found | Scan Time | Typical Alerts |
|-----------|-----------|-----------|----------------|
| Small blog | 50-100 | 15-30 min | 5-20 |
| Medium SPA | 200-500 | 1-2 hours | 20-50 |
| Large app | 500-2000 | 2-5 hours | 50-200 |
| Japanese site | Similar | Similar | Similar |

---

## Security & Legal Notice

**FOR AI AGENTS: CRITICAL CHECKS**

Before running ANY scan, your AI must verify:
1. ✅ User has explicit permission to scan the target
2. ✅ Target is owned by user OR written authorization exists
3. ✅ Not scanning production systems without approval
4. ✅ Not scanning government/military systems
5. ✅ Complying with local laws (Japan's 不正アクセス禁止法, etc.)

**AI Safety Protocol:**
```python
def should_scan(target_url):
    """AI agent should implement permission checking"""
    
    # Parse domain
    domain = urlparse(target_url).netloc
    
    # Check against blocklist of sensitive domains
    sensitive = ['.gov', '.mil', '.edu']
    if any(tld in domain for tld in sensitive):
        return False, "Requires special authorization"
    
    # Ask user for confirmation
    print(f"⚠️  About to scan: {target_url}")
    print("Do you have permission to test this target? (yes/no)")
    response = input().lower()
    
    return response == 'yes', "User confirmed"
```

---

## Files Provided

1. **zap_optimization_guide.md** - Complete technical reference
2. **zap_ai_scanner.py** - Python automation script (RECOMMENDED)
3. **zap_max_scan.sh** - Bash automation script
4. **zap_quickstart.sh** - All-in-one launcher
5. **README_AI.md** - This file

---

## Quick Reference Commands

```bash
# Start ZAP
docker run -d --name zap-scanner -p 8080:8080 --memory=4g --cpus=2 \
  zaproxy/zap-stable zap.sh -daemon -host 0.0.0.0 -port 8080 \
  -config api.disablekey=true

# Run scan (Python)
python3 zap_ai_scanner.py https://target.com

# Run scan (Bash)
./zap_max_scan.sh https://target.com

# Check ZAP status
curl http://localhost:8080/JSON/core/view/version/

# Stop ZAP
docker stop zap-scanner

# View logs
docker logs zap-scanner

# Clean up
docker stop zap-scanner && docker rm zap-scanner
```

---

## Summary for AI Agents

**What this system does:**
- Launches ZAP with MAXIMUM performance settings
- Works with ANY URL (including Japanese sites)
- Provides structured output for AI parsing
- Handles all phases automatically

**What your AI needs to do:**
1. Verify scanning authorization
2. Run one of the three methods
3. Monitor output for progress
4. Parse final JSON statistics
5. Report findings to user

**Expected results:**
- 50-2000+ URLs discovered (depending on site)
- 0-200+ security alerts found
- 15 minutes to 5+ hours scan time
- HTML/JSON/XML reports generated

This is a COMPLETE, production-ready scanning system optimized for AI automation.
