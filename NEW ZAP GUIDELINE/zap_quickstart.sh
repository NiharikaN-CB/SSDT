#!/bin/bash
# ZAP Maximum Performance Quick Start
# Usage: ./zap_quickstart.sh <target_url>
# Example: ./zap_quickstart.sh https://example.com

set -e

TARGET="${1}"
if [ -z "$TARGET" ]; then
  echo "ERROR: No target URL provided"
  echo "Usage: $0 <target_url>"
  echo ""
  echo "Examples:"
  echo "  $0 https://example.com"
  echo "  $0 https://app.example.co.jp"
  echo "  $0 https://api.internal.local"
  exit 1
fi

echo "========================================"
echo "ZAP MAXIMUM PERFORMANCE SCANNER"
echo "========================================"
echo ""
echo "Target: ${TARGET}"
echo ""
echo "⚠️  WARNING: Only scan authorized targets"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker is not installed or not in PATH"
  exit 1
fi

# Stop any existing ZAP container
echo "Stopping any existing ZAP containers..."
docker stop zap-scanner 2>/dev/null || true
docker rm zap-scanner 2>/dev/null || true

# Launch ZAP with optimal configuration
echo "Launching ZAP with maximum performance settings..."
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

echo "✅ ZAP started with 8GB RAM (handles 15K+ URLs)"
echo "✓ ZAP container started"
echo ""
echo "Waiting for ZAP to initialize (this may take 30-60 seconds)..."

# Wait for ZAP API
timeout=120
counter=0
until curl -s http://localhost:8080/JSON/core/view/version/ >/dev/null 2>&1; do
  sleep 2
  ((counter+=2))
  if [ $counter -eq $timeout ]; then
    echo "ERROR: ZAP failed to start within 120 seconds"
    echo "Check logs: docker logs zap-scanner"
    exit 1
  fi
  echo -n "."
done

echo ""
echo "✓ ZAP is ready"
echo ""

# Download and run the full scan script
echo "Downloading full scan automation script..."
if [ -f "zap_max_scan.sh" ]; then
  echo "Using existing zap_max_scan.sh"
else
  echo "ERROR: zap_max_scan.sh not found in current directory"
  echo "Please ensure zap_max_scan.sh is in the same directory"
  exit 1
fi

chmod +x zap_max_scan.sh
echo "✓ Script ready"
echo ""
echo "========================================"
echo "STARTING COMPREHENSIVE SCAN"
echo "========================================"
echo ""

# Run the full scan
./zap_max_scan.sh "${TARGET}"

echo ""
echo "========================================"
echo "SCAN COMPLETE"
echo "========================================"
echo ""
echo "To view container logs: docker logs zap-scanner"
echo "To stop ZAP: docker stop zap-scanner"
echo "To restart: docker start zap-scanner"
echo ""
