#!/usr/bin/env bash
set -euo pipefail

INTERVAL="${1:-2}"
LOG_FILE="${2:-.tmp/memory.log}"

mkdir -p "$(dirname "$LOG_FILE")"

while true; do
  {
    echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
    free -h
    echo
    ps -eo pid,ppid,stat,comm,%mem,rss,args --sort=-rss | head -20

    if command -v nvidia-smi >/dev/null 2>&1; then
      echo
      nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits
      nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null || true
    fi

    echo
  } >> "$LOG_FILE"

  sleep "$INTERVAL"
done
