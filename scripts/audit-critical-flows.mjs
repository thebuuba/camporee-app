// Expected-behavior regressions replacing the original defect-observation probes.
// No production accounts, push providers or database are modified.
import { spawnSync } from 'node:child_process';
const files = ['data-integrity', 'interaction-integrity', 'offline-writes',
  'announcement-delivery', 'durable-delivery', 'schedule-start-alert'];
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test',
  ...files.map(name => `tests/${name}.test.mjs`)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
