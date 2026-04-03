# Phase 10 Disaster Recovery Runbook

## Objectives

- RPO: <= 5 minutes
- RTO: <= 10 minutes
- No global synchronous write dependency
- Regional blast-radius containment

## Preconditions

- Daily full backups via `scripts/backup.sh`
- Cross-region backup copy enabled with `CROSS_REGION_BACKUP_DIR`
- Regional health checks in place
- DNS failover automation credentials configured

## Failure Detection

1. Confirm region outage from health checks and synthetic probes.
2. Verify blast radius with API error rates and latency dashboards.
3. Freeze write traffic to failed region.

## Regional DB Failover

1. Promote target region replica to primary.
2. Validate write access in promoted region.
3. Confirm replication status and WAL consistency.
4. Record failover start time for RTO tracking.

Use helper script:

```bash
bash scripts/dr-failover.sh <failed_region> <target_region>
```

## Redis Pub/Sub Recovery

1. Ensure publisher clients point to healthy regional Redis nodes.
2. Resume subscribers in target region.
3. Reprocess dead-letter records if needed.
4. Verify `redis_consume_total` stabilizes.

## Redis Rebuild

1. Flush stale regional cache if consistency is uncertain.
2. Warm critical keys from DB snapshots.
3. Re-enable traffic once cache hit ratio recovers.

## Traffic Failover

1. Update latency-based routing to drain failed region.
2. Confirm canary probes from each geography.
3. Monitor p95/p99 latency and error budget burn.

## Reconciliation (Post-Failover)

1. Run reconciliation to repair analytics drift:

```bash
npm run reconcile
```

2. Confirm mismatch counters are back to baseline.
3. Keep elevated alerting for at least 30 minutes.

## Restore Procedure

Use the latest known-good backup:

```bash
bash scripts/restore.sh backups/<file>.sql.gz
```

Validate checksum from companion `.meta` file before restore.

## DR Drill Checklist

- Simulate region outage monthly.
- Capture achieved RPO/RTO for each drill.
- Update this runbook with bottlenecks and action items.
