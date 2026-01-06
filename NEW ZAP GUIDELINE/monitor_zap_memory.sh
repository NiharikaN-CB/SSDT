#!/bin/bash

# ZAP Memory Monitoring Script
# Monitors ZAP container memory usage and alerts on high usage
# Usage: ./monitor_zap_memory.sh

echo "========================================="
echo "ZAP Memory Monitor"
echo "========================================="
echo "Monitoring ZAP container memory usage..."
echo "Press Ctrl+C to stop"
echo ""

# Check if bc is available
if ! command -v bc &> /dev/null; then
    echo "⚠️  'bc' not found, percentage comparisons may not work"
fi

while true; do
  # Check if container is running
  if ! docker ps --format '{{.Names}}' | grep -q "^zap-scanner$"; then
    echo "❌ [$(date '+%Y-%m-%d %H:%M:%S')] ZAP container not running!"
    sleep 10
    continue
  fi

  # Get memory stats
  MEM_USAGE=$(docker stats zap-scanner --no-stream --format "{{.MemUsage}}")
  MEM_PERCENT=$(docker stats zap-scanner --no-stream --format "{{.MemPerc}}" | sed 's/%//')
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

  # Determine status based on memory percentage
  if command -v bc &> /dev/null; then
    if (( $(echo "$MEM_PERCENT < 70" | bc -l) )); then
      STATUS="✅ NORMAL"
      COLOR="\033[0;32m" # Green
    elif (( $(echo "$MEM_PERCENT < 85" | bc -l) )); then
      STATUS="⚠️  WARNING"
      COLOR="\033[0;33m" # Yellow
    elif (( $(echo "$MEM_PERCENT < 95" | bc -l) )); then
      STATUS="🚨 CRITICAL"
      COLOR="\033[0;31m" # Red
    else
      STATUS="💥 DANGER"
      COLOR="\033[1;31m" # Bold Red
    fi
  else
    STATUS="📊 MONITORING"
    COLOR="\033[0;36m" # Cyan
  fi

  # Print status with color
  echo -e "${COLOR}[$TIMESTAMP] $STATUS - Memory: $MEM_USAGE (${MEM_PERCENT}%)\033[0m"

  # Alert on critical memory
  if command -v bc &> /dev/null; then
    if (( $(echo "$MEM_PERCENT > 90" | bc -l) )); then
      echo ""
      echo "🚨🚨🚨 ALERT: Memory usage above 90%! 🚨🚨🚨"
      echo "Action required: Scan may crash soon!"
      echo "Consider: 1) Stopping scan, 2) Increasing RAM to 10-12GB"
      echo ""
    fi
  fi

  sleep 30
done
