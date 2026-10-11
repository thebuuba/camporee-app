// Disposable local Docker database only. No DATABASE_URL or project credentials.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container = 'camporee-multitenant-db';
const inspect = spawnSync('docker', ['inspect', '--format', '{{.Config.Image}}', container], { encoding: 'utf8' });
if (inspect.status || inspect.stdout.trim() !== 'supabase/postgres:15.8.1.085') throw new Error('Start the documented isolated test container first.');
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
  update legacy_members set directive_role=null;
  update legacy_rows set data=data-'directive_role' where table_name='app_members';
  `] : []),
  ...(process.argv.includes('--legacy') ? [] : tenant.map(name => read(`supabase/migrations/${name}`))),
  read('supabase/tests/multi-tenant.sql'), 'rollback;',
].join('\n');
const result = spawnSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=camporee-local-test', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const output = result.stdout + result.stderr;
console.log(output.split('\n').filter(line => /(^ok |^not ok |^1\.\.|ERROR|DETAIL|CONTEXT|Looks like)/.test(line.trim())).join('\n'));
if (result.status || /not ok |Looks like you failed/.test(output)) process.exit(1);
