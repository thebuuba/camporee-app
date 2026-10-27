// Disposable local Docker database only. No DATABASE_URL or project credentials.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container = process.env.CAMPOREE_TEST_CONTAINER || 'camporee-multitenant-db';
const inspect = spawnSync('docker', ['inspect', '--format', '{{.Config.Image}}|{{.HostConfig.NetworkMode}}', container], { encoding: 'utf8' });
if (inspect.status || inspect.stdout.trim() !== 'supabase/postgres:15.8.1.085|none') throw new Error('Start the documented isolated test container with --network none first.');
const readyDeadline = Date.now() + 30_000;
for (;;) {
  // The image's initialization server accepts Unix sockets before init scripts
  // finish. TCP is enabled only by the final server, avoiding catalog races.
  const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres'], { encoding: 'utf8', timeout: 2000 });
  if (ready.status === 0) break;
  if (Date.now() >= readyDeadline) throw new Error('The isolated test database did not become ready within 30 seconds.');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
}
const read = path => readFileSync(path, 'utf8');
const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
const legacy = migrations.filter(name => name < '20261011000000');
const tenant = migrations.filter(name => name >= '20261011000000');
const sql = [
  'begin;', read('supabase/tests/bootstrap.sql'),
  ...legacy.map(name => read(`supabase/migrations/${name}`)),
  read('supabase/tests/legacy-fixture.sql'),
  ...(process.argv.includes('--production-legacy') ? [`
  -- Simulate the real 2026-10 production schema, which has no
  -- app_members.directive_role despite the test fixture and source SQL.
  alter table public.app_members drop column directive_role;
  drop function if exists public.active_task_assignees();
  update legacy_members set directive_role=null;
  update legacy_rows set data=data-'directive_role' where table_name='app_members';
  -- Actual production also has the earlier participant assignment migration.
  alter table public.tasks add column assigned_participant_id uuid references public.participants(id) on delete set null;
  create index tasks_assigned_participant_idx on public.tasks(assigned_participant_id);
  `] : []),
  ...(process.argv.includes('--legacy') ? [] : tenant.map(name => read(`supabase/migrations/${name}`))),
  read('supabase/tests/multi-tenant.sql').replace(/select finish\(\);\s*$/, ''),
  read('supabase/tests/data-contracts.sql'), read('supabase/tests/durable-delivery.sql'), read('supabase/tests/navigation.sql'), 'select finish();', 'rollback;',
].join('\n');
const result = spawnSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=camporee-local-test', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const output = result.stdout + result.stderr;
console.log(output.split('\n').filter(line => /(^ok |^not ok |^1\.\.|ERROR|DETAIL|CONTEXT|Looks like)/.test(line.trim())).join('\n'));
if (result.status || /not ok |Looks like you failed/.test(output)) process.exit(1);
