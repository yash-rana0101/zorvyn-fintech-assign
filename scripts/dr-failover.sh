#!/bin/bash
# -----------------------------------------------------------------------------
# dr-failover.sh — Region failover helper (Phase 10)
# Usage: bash scripts/dr-failover.sh <failed_region> <target_region>
# -----------------------------------------------------------------------------
set -euo pipefail

FAILED_REGION=${1:-}
TARGET_REGION=${2:-}

if [ -z "$FAILED_REGION" ] || [ -z "$TARGET_REGION" ]; then
  echo "Usage: bash scripts/dr-failover.sh <failed_region> <target_region>"
  exit 1
fi

echo "🚨 Starting DR failover"
echo "   Failed region : $FAILED_REGION"
echo "   Target region : $TARGET_REGION"

echo "1) Promote database replica"
if [ -n "${DB_PROMOTE_CMD:-}" ]; then
  eval "$DB_PROMOTE_CMD"
else
  echo "   DB_PROMOTE_CMD is not set (manual DB promotion required)"
fi

echo "2) Promote Redis Pub/Sub region"
if [ -n "${REDIS_PUBSUB_FAILOVER_CMD:-}" ]; then
  eval "$REDIS_PUBSUB_FAILOVER_CMD"
else
  echo "   REDIS_PUBSUB_FAILOVER_CMD is not set (manual Redis Pub/Sub failover required)"
fi

echo "3) Rebuild Redis cache tier"
if [ -n "${REDIS_FAILOVER_CMD:-}" ]; then
  eval "$REDIS_FAILOVER_CMD"
else
  echo "   REDIS_FAILOVER_CMD is not set (manual Redis rebuild required)"
fi

echo "4) Update DNS / traffic policy"
if [ -n "${DNS_FAILOVER_CMD:-}" ]; then
  eval "$DNS_FAILOVER_CMD"
else
  echo "   DNS_FAILOVER_CMD is not set (manual DNS failover required)"
fi

echo "✅ Failover sequence finished."
