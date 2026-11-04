import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const urlNamespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');

// Stable UUID v5 per camporee and source row, including after an event is edited.
export function programEventId(camporeeId, sourceId) {
  if (!uuidPattern.test(camporeeId)) throw new Error('Provide a valid camporee UUID.');
  const bytes = createHash('sha1').update(urlNamespace)
    .update(`camporee:${camporeeId.toLowerCase()}:programa-legado-2026:${sourceId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildProgramImport(camporeeId, program) {
  if (!uuidPattern.test(camporeeId)) throw new Error('Provide a valid camporee UUID.');
  const rows = program.events.map(event => ({
    id: programEventId(camporeeId, event.source_id),
    title: event.title,
    description: event.description,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    location: event.location,
    responsible_name: event.responsible_name,
  }));
  if (rows.length !== 45 || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('The official program must have 45 distinct schedule blocks.');
  }
  for (const row of rows) {
    if (!row.title?.trim() || !Number.isFinite(Date.parse(row.starts_at))
      || (row.ends_at && Date.parse(row.ends_at) <= Date.parse(row.starts_at))) {
      throw new Error('Invalid program title or date.');
    }
  }
  const json = JSON.stringify(rows);
  if (json.includes('$program_data$')) throw new Error('Unexpected SQL delimiter in source.');
  return `-- Generated from data/programa-legado-2026.json; does not replace existing events.
begin;
select pg_advisory_xact_lock(hashtextextended('programa-legado-2026:${camporeeId}', 0));
do $validate_target$
begin
  if not exists (
    select 1 from public.camporees
    where id = '${camporeeId}'::uuid
      and starts_on = date '2026-11-06' and ends_on = date '2026-11-09'
      and time_zone = 'America/Santo_Domingo'
  ) then
    raise exception 'Target camporee does not match the official dates and time zone';
  end if;
end
$validate_target$;
with source as (
  select * from jsonb_to_recordset($program_data$${json}$program_data$::jsonb)
    as x(id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz,
      location text, responsible_name text)
)
insert into public.schedule_events
  (id, camporee_id, title, description, starts_at, ends_at, location, responsible_name)
select id, '${camporeeId}'::uuid, title, description, starts_at, ends_at, location, responsible_name
from source
where not exists (
  select 1 from public.schedule_events existing
  where existing.camporee_id = '${camporeeId}'::uuid
    and existing.title = source.title and existing.starts_at = source.starts_at
)
on conflict (id) do nothing;
update public.camporees
set navigation_panels = array_append(navigation_panels, 'program')
where id = '${camporeeId}'::uuid
  and not ('program' = any(navigation_panels)) and cardinality(navigation_panels) < 3;
commit;
select count(*) as imported_blocks from public.schedule_events
where camporee_id = '${camporeeId}'::uuid
  and id in (select (value->>'id')::uuid from jsonb_array_elements($program_data$${JSON.stringify(rows.map(row => ({id: row.id})))}$program_data$::jsonb));
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const program = JSON.parse(await readFile(new URL('../data/programa-legado-2026.json', import.meta.url), 'utf8'));
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--camporee-id') {
    throw new Error('Usage: node scripts/import-legado-program.mjs --camporee-id <UUID>');
  }
  process.stdout.write(buildProgramImport(args[1], program));
}
