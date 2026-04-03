'use strict';

require('dotenv').config();

const { runReconciliation } = require('../apps/api/src/jobs/reconciliation.job');

async function main() {
  const summary = await runReconciliation();

  // Keep output compact so this script is CI-friendly.
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
