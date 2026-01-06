# ZAP Active Scanner Optimization Guide - UNIVERSAL MAXIMUM PERFORMANCE

## ⚠️ CRITICAL: AUTHORIZATION REQUIRED
**YOU MUST HAVE EXPLICIT PERMISSION TO SCAN ANY TARGET**
- Only scan systems you own or have written authorization to test
- Unauthorized scanning is ILLEGAL in most jurisdictions
- For third-party systems: obtain written penetration testing authorization
- For Japanese sites: comply with Japan's Unauthorized Computer Access Law (不正アクセス禁止法)

## CRITICAL: This configuration works for ANY URL you provide
- Optimized for modern web applications (JavaScript-heavy, SPA, traditional)
- Works with international sites (Japanese, Chinese, Korean, etc.)
- Maximum discovery, maximum coverage, maximum performance
- Handles UTF-8, multibyte characters, and international domains

---

## MAXIMUM PERFORMANCE CONFIGURATION - UNIVERSAL

### 1. Docker Container Setup (Launch with Optimal Settings)

```bash
docker run -d --name zap-scanner \
  -p 8080:8080 \
  --memory=8g \
  --memory-swap=10g \
  --cpus=4 \
  zaproxy/zap-stable \
  zap.sh -daemon -host 0.0.0.0 -port 8080 \
  -config api.disablekey=true \
  -config spider.maxDepth=20 \
  -config spider.maxDuration=120 \
  -config spider.threadCount=10 \
  -config scanner.threadPerHost=10 \
  -config scanner.hostPerScan=10
```

### 2. API-Based Configuration (Apply After Container Start)

**Wait for ZAP to fully start:**
```bash
# Wait for ZAP API to be ready
timeout=60
counter=0
until curl -s http://localhost:8080/JSON/core/view/version/ >/dev/null; do
  sleep 1
  ((counter++))
  if [ $counter -eq $timeout ]; then
    echo "ZAP failed to start"
    exit 1
  fi
done
echo "ZAP is ready"
```

**Spider Configuration (Maximum Discovery):**
```bash
ZAP_API="http://localhost:8080"

# Spider settings - MAXIMUM DISCOVERY
curl "${ZAP_API}/JSON/spider/action/setOptionMaxDepth/?Integer=20"
curl "${ZAP_API}/JSON/spider/action/setOptionMaxDuration/?Integer=120"
curl "${ZAP_API}/JSON/spider/action/setOptionMaxChildren/?Integer=0"
curl "${ZAP_API}/JSON/spider/action/setOptionThreadCount/?Integer=10"
curl "${ZAP_API}/JSON/spider/action/setOptionMaxParseSizeBytes/?Integer=5242880"
curl "${ZAP_API}/JSON/spider/action/setOptionParseComments/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionParseGit/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionParseRobotsTxt/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionParseSVNEntries/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionParseSitemapXml/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionPostForm/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionProcessForm/?Boolean=true"

# Handle errors and redirects
curl "${ZAP_API}/JSON/spider/action/setOptionHandleODataParametersVisited/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionHandleParameters/?String=USE_ALL"
curl "${ZAP_API}/JSON/spider/action/setOptionRequestWaitTime/?Integer=200"

# Send referer header (bypass some protections)
curl "${ZAP_API}/JSON/spider/action/setOptionSendRefererHeader/?Boolean=true"
```

**Active Scanner Configuration (Maximum Coverage):**
```bash
# Active scanner settings - AGGRESSIVE
curl "${ZAP_API}/JSON/ascan/action/setOptionThreadPerHost/?Integer=10"
curl "${ZAP_API}/JSON/ascan/action/setOptionHostPerScan/?Integer=10"
curl "${ZAP_API}/JSON/ascan/action/setOptionMaxResultsToList/?Integer=1000"
curl "${ZAP_API}/JSON/ascan/action/setOptionMaxRuleDurationInMins/?Integer=30"
curl "${ZAP_API}/JSON/ascan/action/setOptionMaxScanDurationInMins/?Integer=180"
curl "${ZAP_API}/JSON/ascan/action/setOptionDelayInMs/?Integer=0"
curl "${ZAP_API}/JSON/ascan/action/setOptionInjectPluginIdInHeader/?Boolean=true"
curl "${ZAP_API}/JSON/ascan/action/setOptionHandleAntiCSRFTokens/?Boolean=true"

# Attack strength - INSANE for maximum testing
curl "${ZAP_API}/JSON/ascan/action/setOptionDefaultPolicy/?String=Default%20Policy"
curl "${ZAP_API}/JSON/ascan/action/setOptionAttackPolicy/?String=Default%20Policy"

# Set all scanners to INSANE strength
curl "${ZAP_API}/JSON/ascan/action/setScannerAttackStrength/?id=0&attackStrength=INSANE&scanPolicyName=Default%20Policy"
curl "${ZAP_API}/JSON/ascan/action/setScannerAlertThreshold/?id=0&alertThreshold=LOW&scanPolicyName=Default%20Policy"
```

**AJAX Spider (For JavaScript-Heavy Sites like YouTube):**
```bash
# AJAX Spider - ESSENTIAL for modern web apps
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionMaxDuration/?Integer=120"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionMaxCrawlDepth/?Integer=10"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionNumberOfBrowsers/?Integer=4"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionBrowserId/?String=firefox-headless"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionClickDefaultElems/?Boolean=true"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionClickElemsOnce/?Boolean=false"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionEventWait/?Integer=1000"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionRandomInputs/?Boolean=true"
curl "${ZAP_API}/JSON/ajaxSpider/action/setOptionReloadWait/?Integer=2000"
```

### 3. Context Setup (Define Scope Properly) - UNIVERSAL

```bash
TARGET="$1"  # Pass any URL as argument
CONTEXT_NAME="UniversalScan"

# Extract domain from URL for regex
DOMAIN=$(echo $TARGET | awk -F/ '{print $3}')
DOMAIN_REGEX=$(echo $DOMAIN | sed 's/\./\\./g')

# Create context
curl "${ZAP_API}/JSON/context/action/newContext/?contextName=${CONTEXT_NAME}"

# Include target domain and all subdomains (UNIVERSAL)
curl "${ZAP_API}/JSON/context/action/includeInContext/?contextName=${CONTEXT_NAME}&regex=https?://${DOMAIN_REGEX}.*"
curl "${ZAP_API}/JSON/context/action/includeInContext/?contextName=${CONTEXT_NAME}&regex=https?://.*\\.${DOMAIN_REGEX}.*"

# Exclude common logout/signout patterns (UNIVERSAL)
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*logout.*"
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*signout.*"
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*sign-out.*"
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*sign_out.*"
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*/auth/logout.*"

# Set context in scope
curl "${ZAP_API}/JSON/context/action/setContextInScope/?contextName=${CONTEXT_NAME}&booleanInScope=true"
```

### 4. Scanning Workflow (Complete Process) - WORKS FOR ANY TARGET

```bash
TARGET="$1"  # Pass ANY URL as argument
CONTEXT_NAME="UniversalScan"

# Step 1: Access target (establish session)
SCAN_ID=$(curl -s "${ZAP_API}/JSON/core/action/accessUrl/?url=${TARGET}" | jq -r '.Result')
echo "Target accessed: ${TARGET}"

# Step 2: Traditional Spider
echo "Starting traditional spider..."
SPIDER_ID=$(curl -s "${ZAP_API}/JSON/spider/action/scan/?url=${TARGET}&contextName=${CONTEXT_NAME}&recurse=true" | jq -r '.scan')

# Wait for spider to complete
while [ $(curl -s "${ZAP_API}/JSON/spider/view/status/?scanId=${SPIDER_ID}" | jq -r '.status') != "100" ]; do
  STATUS=$(curl -s "${ZAP_API}/JSON/spider/view/status/?scanId=${SPIDER_ID}" | jq -r '.status')
  echo "Spider progress: ${STATUS}%"
  sleep 5
done
echo "Traditional spider complete"

# Step 3: AJAX Spider (CRITICAL for JavaScript apps)
echo "Starting AJAX spider..."
AJAX_SPIDER_ID=$(curl -s "${ZAP_API}/JSON/ajaxSpider/action/scan/?url=${TARGET}&inScope=true&contextName=${CONTEXT_NAME}" | jq -r '.Result')

# Wait for AJAX spider
while [ $(curl -s "${ZAP_API}/JSON/ajaxSpider/view/status/" | jq -r '.status') != "stopped" ]; do
  RESULTS=$(curl -s "${ZAP_API}/JSON/ajaxSpider/view/numberOfResults/" | jq -r '.numberOfResults')
  echo "AJAX Spider URLs found: ${RESULTS}"
  sleep 10
done
echo "AJAX spider complete"

# Check total URLs discovered
URLS_FOUND=$(curl -s "${ZAP_API}/JSON/core/view/numberOfUrls/" | jq -r '.numberOfUrls')
echo "Total URLs discovered: ${URLS_FOUND}"

# Step 4: Passive Scan (automatic, just wait)
echo "Waiting for passive scan to process..."
while [ $(curl -s "${ZAP_API}/JSON/pscan/view/recordsToScan/" | jq -r '.recordsToScan') != "0" ]; do
  RECORDS=$(curl -s "${ZAP_API}/JSON/pscan/view/recordsToScan/" | jq -r '.recordsToScan')
  echo "Passive scan records remaining: ${RECORDS}"
  sleep 5
done
echo "Passive scan complete"

# Step 5: Active Scan (AGGRESSIVE)
echo "Starting active scan..."
ASCAN_ID=$(curl -s "${ZAP_API}/JSON/ascan/action/scan/?url=${TARGET}&recurse=true&inScopeOnly=true&scanPolicyName=Default%20Policy&contextName=${CONTEXT_NAME}" | jq -r '.scan')

# Monitor active scan
while [ $(curl -s "${ZAP_API}/JSON/ascan/view/status/?scanId=${ASCAN_ID}" | jq -r '.status') != "100" ]; do
  STATUS=$(curl -s "${ZAP_API}/JSON/ascan/view/status/?scanId=${ASCAN_ID}" | jq -r '.status')
  echo "Active scan progress: ${STATUS}%"
  sleep 10
done
echo "Active scan complete"

# Step 6: Generate reports
echo "Generating reports..."
curl -s "${ZAP_API}/OTHER/core/other/htmlreport/" > zap-report.html
curl -s "${ZAP_API}/OTHER/core/other/jsonreport/" > zap-report.json
curl -s "${ZAP_API}/OTHER/core/other/xmlreport/" > zap-report.xml

# Get alert counts
ALERTS=$(curl -s "${ZAP_API}/JSON/core/view/numberOfAlerts/" | jq -r '.numberOfAlerts')
echo "Total alerts found: ${ALERTS}"

# Get alert summary
curl -s "${ZAP_API}/JSON/core/view/alertsSummary/" | jq '.'
```

### 5. Authentication (If Target Requires Login) - UNIVERSAL

```bash
# For ANY site requiring authentication
CONTEXT_NAME="UniversalScan"
USER_NAME="testuser"
LOGIN_URL="${TARGET}/login"  # Adjust as needed
USERNAME="${AUTH_USERNAME:-your-username}"
PASSWORD="${AUTH_PASSWORD:-your-password}"

# Create user
curl "${ZAP_API}/JSON/users/action/newUser/?contextId=1&name=${USER_NAME}"

# Set authentication credentials
curl "${ZAP_API}/JSON/users/action/setAuthenticationCredentials/?contextId=1&userId=0&authCredentialsConfigParams=username%3D${USERNAME}%26password%3D${PASSWORD}"

# Enable user
curl "${ZAP_API}/JSON/users/action/setUserEnabled/?contextId=1&userId=0&enabled=true"

# Set forced user mode
curl "${ZAP_API}/JSON/forcedUser/action/setForcedUser/?contextId=1&userId=0"
curl "${ZAP_API}/JSON/forcedUser/action/setForcedUserModeEnabled/?boolean=true"
```

### 6. Advanced: Import URL List (Manual Seed) - FOR ANY SITE

If you have specific paths you want to scan on your target:

```bash
# Create urls.txt with YOUR target paths
# This example shows common patterns - adjust for your actual target
cat > urls.txt << EOF
${TARGET}/
${TARGET}/admin
${TARGET}/api
${TARGET}/dashboard
${TARGET}/profile
${TARGET}/settings
${TARGET}/search
${TARGET}/upload
EOF

# Import URLs
while IFS= read -r url; do
  curl "${ZAP_API}/JSON/core/action/accessUrl/?url=${url}"
  echo "Added: ${url}"
done < urls.txt
```

### 7. Docker Compose Configuration (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  zap:
    image: zaproxy/zap-stable
    container_name: zap-scanner
    ports:
      - "8080:8080"
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 2G
    command: >
      zap.sh -daemon
      -host 0.0.0.0
      -port 8080
      -config api.disablekey=true
      -config spider.maxDepth=20
      -config spider.threadCount=10
      -config scanner.threadPerHost=10
```

Launch with:
```bash
docker-compose up -d
```

---

## Memory Configuration Guidelines

ZAP memory requirements scale with URL discovery:

| URLs Discovered | Minimum RAM | Recommended RAM | Optimal RAM |
|----------------|-------------|-----------------|-------------|
| < 1,000        | 2 GB        | 3 GB           | 4 GB        |
| 1,000-5,000    | 4 GB        | 6 GB           | 8 GB        |
| 5,000-10,000   | 6 GB        | 8 GB           | 10 GB       |
| 10,000-15,000  | 8 GB ✅     | 10 GB          | 12 GB       |
| 15,000-20,000  | 10 GB       | 12 GB          | 16 GB       |
| > 20,000       | 12 GB+      | 16 GB+         | 24 GB+      |

### Default Configuration (8GB)

Our default configuration uses 8GB RAM, which handles most enterprise scans:

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

### Memory Monitoring

Monitor memory usage during scans:

```bash
# Real-time monitoring
watch -n 10 'docker stats zap-scanner --no-stream'

# Check memory percentage
docker stats zap-scanner --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

### Warning Thresholds

- ✅ **< 70% (<5.6GB)**: Normal operation
- ⚠️ **70-85% (5.6-6.8GB)**: Monitor closely
- 🚨 **85-95% (6.8-7.6GB)**: Risk of crash
- 💥 **> 95% (>7.6GB)**: Crash imminent

If memory exceeds 85%, consider:
1. Increasing RAM allocation to 10GB or 12GB
2. Reducing scan intensity (lower threadCount)
3. Splitting the scan into smaller chunks

---

## Complete Automation Script - UNIVERSAL FOR ANY TARGET

Save as `zap_max_scan.sh`:

```bash
#!/bin/bash

set -e

ZAP_API="http://localhost:8080"
TARGET="${1}"
CONTEXT_NAME="UniversalScan"

if [ -z "$TARGET" ]; then
  echo "Usage: $0 <target_url>"
  echo "Example: $0 https://example.com"
  exit 1
fi

echo "=== ZAP MAXIMUM PERFORMANCE SCAN ==="
echo "Target: ${TARGET}"
echo "This works for ANY URL - Japanese sites, SPAs, traditional apps, etc."

# Extract domain for context
DOMAIN=$(echo $TARGET | awk -F/ '{print $3}')
DOMAIN_REGEX=$(echo $DOMAIN | sed 's/\./\\./g')

# Wait for ZAP
echo "Waiting for ZAP to start..."
timeout=60
counter=0
until curl -s ${ZAP_API}/JSON/core/view/version/ >/dev/null 2>&1; do
  sleep 1
  ((counter++))
  if [ $counter -eq $timeout ]; then
    echo "ERROR: ZAP failed to start within 60 seconds"
    exit 1
  fi
done
ZAP_VERSION=$(curl -s ${ZAP_API}/JSON/core/view/version/ | jq -r '.version')
echo "✓ ZAP is ready (version: ${ZAP_VERSION})"

# Configure Spider for MAXIMUM DISCOVERY
echo "Configuring traditional spider for maximum discovery..."
curl -s "${ZAP_API}/JSON/spider/action/setOptionMaxDepth/?Integer=20" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionMaxDuration/?Integer=120" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionMaxChildren/?Integer=0" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionThreadCount/?Integer=10" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionPostForm/?Boolean=true" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionProcessForm/?Boolean=true" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionParseComments/?Boolean=true" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionParseSitemapXml/?Boolean=true" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionParseRobotsTxt/?Boolean=false" >/dev/null
curl -s "${ZAP_API}/JSON/spider/action/setOptionSendRefererHeader/?Boolean=true" >/dev/null
echo "✓ Spider configured"

# Configure AJAX Spider for JavaScript-heavy sites
echo "Configuring AJAX spider for modern web apps..."
curl -s "${ZAP_API}/JSON/ajaxSpider/action/setOptionMaxDuration/?Integer=120" >/dev/null
curl -s "${ZAP_API}/JSON/ajaxSpider/action/setOptionMaxCrawlDepth/?Integer=10" >/dev/null
curl -s "${ZAP_API}/JSON/ajaxSpider/action/setOptionNumberOfBrowsers/?Integer=4" >/dev/null
curl -s "${ZAP_API}/JSON/ajaxSpider/action/setOptionBrowserId/?String=firefox-headless" >/dev/null
curl -s "${ZAP_API}/JSON/ajaxSpider/action/setOptionClickDefaultElems/?Boolean=true" >/dev/null
curl -s "${ZAP_API}/JSON/ajaxSpider/action/setOptionClickElemsOnce/?Boolean=false" >/dev/null
curl -s "${ZAP_API}/JSON/ajaxSpider/action/setOptionRandomInputs/?Boolean=true" >/dev/null
echo "✓ AJAX spider configured"

# Configure Active Scanner for AGGRESSIVE SCANNING
echo "Configuring active scanner for maximum coverage..."
curl -s "${ZAP_API}/JSON/ascan/action/setOptionThreadPerHost/?Integer=10" >/dev/null
curl -s "${ZAP_API}/JSON/ascan/action/setOptionHostPerScan/?Integer=10" >/dev/null
curl -s "${ZAP_API}/JSON/ascan/action/setOptionMaxScanDurationInMins/?Integer=180" >/dev/null
curl -s "${ZAP_API}/JSON/ascan/action/setOptionMaxRuleDurationInMins/?Integer=30" >/dev/null
curl -s "${ZAP_API}/JSON/ascan/action/setOptionDelayInMs/?Integer=0" >/dev/null
curl -s "${ZAP_API}/JSON/ascan/action/setOptionHandleAntiCSRFTokens/?Boolean=true" >/dev/null
curl -s "${ZAP_API}/JSON/ascan/action/setOptionInjectPluginIdInHeader/?Boolean=true" >/dev/null
echo "✓ Active scanner configured"

# Create context with UNIVERSAL scope
echo "Creating scan context..."
curl -s "${ZAP_API}/JSON/context/action/newContext/?contextName=${CONTEXT_NAME}" >/dev/null 2>&1 || true
curl -s "${ZAP_API}/JSON/context/action/includeInContext/?contextName=${CONTEXT_NAME}&regex=https?://${DOMAIN_REGEX}.*" >/dev/null
curl -s "${ZAP_API}/JSON/context/action/includeInContext/?contextName=${CONTEXT_NAME}&regex=https?://.*\\.${DOMAIN_REGEX}.*" >/dev/null
curl -s "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*logout.*" >/dev/null
curl -s "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*signout.*" >/dev/null
curl -s "${ZAP_API}/JSON/context/action/setContextInScope/?contextName=${CONTEXT_NAME}&booleanInScope=true" >/dev/null
echo "✓ Context created for ${DOMAIN}"

# Access target
echo "Accessing target URL..."
curl -s "${ZAP_API}/JSON/core/action/accessUrl/?url=${TARGET}" >/dev/null
sleep 2
echo "✓ Target accessed"

# PHASE 1: Traditional Spider
echo ""
echo "=== PHASE 1: TRADITIONAL SPIDER ==="
SPIDER_ID=$(curl -s "${ZAP_API}/JSON/spider/action/scan/?url=${TARGET}&contextName=${CONTEXT_NAME}&recurse=true&subtreeOnly=false" | jq -r '.scan')
echo "Spider scan ID: ${SPIDER_ID}"

while true; do
  STATUS=$(curl -s "${ZAP_API}/JSON/spider/view/status/?scanId=${SPIDER_ID}" | jq -r '.status')
  if [ "$STATUS" == "100" ]; then
    break
  fi
  URLS=$(curl -s "${ZAP_API}/JSON/spider/view/results/?scanId=${SPIDER_ID}" | jq -r '.results | length')
  echo "  Spider progress: ${STATUS}% | URLs found: ${URLS}"
  sleep 5
done
SPIDER_URLS=$(curl -s "${ZAP_API}/JSON/spider/view/results/?scanId=${SPIDER_ID}" | jq -r '.results | length')
echo "✓ Traditional spider complete: ${SPIDER_URLS} URLs found"

# PHASE 2: AJAX Spider (critical for modern sites)
echo ""
echo "=== PHASE 2: AJAX SPIDER (JavaScript crawling) ==="
curl -s "${ZAP_API}/JSON/ajaxSpider/action/scan/?url=${TARGET}&inScope=true&contextName=${CONTEXT_NAME}" >/dev/null
echo "AJAX spider started..."

while true; do
  STATUS=$(curl -s "${ZAP_API}/JSON/ajaxSpider/view/status/" | jq -r '.status')
  if [ "$STATUS" == "stopped" ]; then
    break
  fi
  RESULTS=$(curl -s "${ZAP_API}/JSON/ajaxSpider/view/numberOfResults/" | jq -r '.numberOfResults')
  MESSAGES=$(curl -s "${ZAP_API}/JSON/ajaxSpider/view/messagesInQueue/" | jq -r '.messagesInQueue')
  echo "  AJAX spider: ${STATUS} | URLs found: ${RESULTS} | Queue: ${MESSAGES}"
  sleep 10
done
AJAX_URLS=$(curl -s "${ZAP_API}/JSON/ajaxSpider/view/numberOfResults/" | jq -r '.numberOfResults')
echo "✓ AJAX spider complete: ${AJAX_URLS} additional URLs found"

# Check total discovery
TOTAL_URLS=$(curl -s "${ZAP_API}/JSON/core/view/numberOfUrls/" | jq -r '.numberOfUrls')
echo ""
echo "=== DISCOVERY COMPLETE ==="
echo "Total URLs discovered: ${TOTAL_URLS}"

if [ "$TOTAL_URLS" -lt "10" ]; then
  echo "WARNING: Low URL count - target may have bot protection or limited content"
fi

# PHASE 3: Passive Scan (automatic processing)
echo ""
echo "=== PHASE 3: PASSIVE SCAN ==="
echo "Waiting for passive scan to process all requests..."
while true; do
  RECORDS=$(curl -s "${ZAP_API}/JSON/pscan/view/recordsToScan/" | jq -r '.recordsToScan')
  if [ "$RECORDS" == "0" ]; then
    break
  fi
  echo "  Passive scan processing: ${RECORDS} records remaining"
  sleep 5
done
echo "✓ Passive scan complete"

# PHASE 4: Active Scan (AGGRESSIVE)
echo ""
echo "=== PHASE 4: ACTIVE SCAN (AGGRESSIVE) ==="
ASCAN_ID=$(curl -s "${ZAP_API}/JSON/ascan/action/scan/?url=${TARGET}&recurse=true&inScopeOnly=true&scanPolicyName=Default%20Policy&contextName=${CONTEXT_NAME}" | jq -r '.scan')
echo "Active scan ID: ${ASCAN_ID}"

while true; do
  STATUS=$(curl -s "${ZAP_API}/JSON/ascan/view/status/?scanId=${ASCAN_ID}" | jq -r '.status')
  if [ "$STATUS" == "100" ]; then
    break
  fi
  ALERTS=$(curl -s "${ZAP_API}/JSON/core/view/numberOfAlerts/" | jq -r '.numberOfAlerts')
  echo "  Active scan progress: ${STATUS}% | Alerts so far: ${ALERTS}"
  sleep 15
done
echo "✓ Active scan complete"

# PHASE 5: Report Generation
echo ""
echo "=== PHASE 5: GENERATING REPORTS ==="
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_PREFIX="zap-report-${TIMESTAMP}"

curl -s "${ZAP_API}/OTHER/core/other/htmlreport/" > "${REPORT_PREFIX}.html"
curl -s "${ZAP_API}/OTHER/core/other/jsonreport/" > "${REPORT_PREFIX}.json"
curl -s "${ZAP_API}/OTHER/core/other/xmlreport/" > "${REPORT_PREFIX}.xml"

echo "✓ Reports generated:"
echo "  - ${REPORT_PREFIX}.html"
echo "  - ${REPORT_PREFIX}.json"
echo "  - ${REPORT_PREFIX}.xml"

# Final Statistics
echo ""
echo "=== SCAN COMPLETE ==="
TOTAL_ALERTS=$(curl -s "${ZAP_API}/JSON/core/view/numberOfAlerts/" | jq -r '.numberOfAlerts')
echo "Target: ${TARGET}"
echo "URLs discovered: ${TOTAL_URLS}"
echo "Total alerts: ${TOTAL_ALERTS}"

# Alert breakdown
echo ""
echo "Alert Severity Breakdown:"
curl -s "${ZAP_API}/JSON/core/view/alertsSummary/" | jq -r '
  .alertsSummary |
  "  High Risk: " + (.["High"] // "0") + " alerts" + "\n" +
  "  Medium Risk: " + (.["Medium"] // "0") + " alerts" + "\n" +
  "  Low Risk: " + (.["Low"] // "0") + " alerts" + "\n" +
  "  Informational: " + (.["Informational"] // "0") + " alerts"
'

echo ""
echo "=== ALL PHASES COMPLETE ==="
echo "Review the HTML report for detailed findings"
```

Make executable and run with ANY target:
```bash
chmod +x zap_max_scan.sh

# Japanese website example
./zap_max_scan.sh https://example.co.jp

# Any other target
./zap_max_scan.sh https://your-target.com
./zap_max_scan.sh https://api.example.com
./zap_max_scan.sh https://app.internal-system.local
```

---

## SPECIAL: Japanese & International Site Configuration

For Japanese websites and non-English sites, add these configurations:

### Character Encoding Support
```bash
# Ensure UTF-8 encoding for Japanese/international characters
curl "${ZAP_API}/JSON/core/action/setOptionDefaultUserAgent/?String=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Enable international domain names (IDN)
# ZAP handles this automatically, but verify your target URL is properly encoded
```

### Common Japanese Site Patterns
```bash
# Japanese sites often use these patterns - add to exclusions if needed
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*ログアウト.*"  # Logout
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*サインアウト.*"  # Sign out
curl "${ZAP_API}/JSON/context/action/excludeFromContext/?contextName=${CONTEXT_NAME}&regex=.*/auth/.*"
```

### Form Handling for Japanese Input
```bash
# Enable aggressive form processing (critical for Japanese forms)
curl "${ZAP_API}/JSON/spider/action/setOptionPostForm/?Boolean=true"
curl "${ZAP_API}/JSON/spider/action/setOptionProcessForm/?Boolean=true"

# Handle all parameter variations
curl "${ZAP_API}/JSON/spider/action/setOptionHandleParameters/?String=USE_ALL"
```

---

## Troubleshooting

### Low URL Discovery
- **Enable AJAX Spider** (essential for JavaScript-heavy sites)
- **Increase max depth** to 20+
- **Increase duration** to 120+ seconds
- **Seed with known URLs** manually
- **Disable robots.txt** parsing if it's blocking

### Scan Too Slow
- **Reduce delay** to 0ms (be careful with rate limiting)
- **Increase threads** (10 per host recommended)
- **Disable unnecessary scanners**
- **Use faster scan policy** (but less thorough)

### Authentication Issues
- **Set up authentication** properly in context
- **Use session management**
- **Configure forced user mode**
- **Check cookies/tokens** are being maintained

### Container Resource Issues
- **Increase memory** to 4GB+
- **Increase CPUs** to 2+
- **Monitor container** with `docker stats`

---

## Expected Results - UNIVERSAL

With proper configuration for ANY target:
- **Traditional Spider**: 50-500+ URLs (static sites) to 1000+ URLs (large sites)
- **AJAX Spider**: 100-2000+ URLs on JavaScript-heavy sites (SPAs, React, Vue, Angular)
- **Japanese Sites**: Similar performance, may find unique character-encoded paths
- **Active Scan**: Tests ALL discovered URLs with ALL enabled scanners
- **Scan Duration**: 
  - Small sites (< 100 URLs): 10-30 minutes
  - Medium sites (100-500 URLs): 30-90 minutes
  - Large sites (500+ URLs): 2-5+ hours
- **Alerts**: Varies by target security - 0 (well-secured) to 500+ (vulnerable)

---

## For Your AI Agent

Your AI should:
1. **Launch container** with optimized settings
2. **Wait for ZAP** to fully start (API health check)
3. **Apply all configurations** via API calls
4. **Run complete workflow**: Spider → AJAX Spider → Passive → Active
5. **Monitor progress** with status checks
6. **Generate reports** in multiple formats
7. **Parse results** and surface critical findings

This configuration will push ZAP to maximum performance regardless of the target.
