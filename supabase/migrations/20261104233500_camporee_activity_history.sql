-- A compact, append-only record of successful camporee changes. The triggers
-- run in the same transaction as the change, including delayed offline writes.
create table public.activity_history (
  id bigint generated always as identity primary key,
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  action text not null check (action in ('created','updated','deleted')),
  entity_type text not null,
  entity_id uuid not null,
  entity_title text not null,
  created_at timestamptz not null default now()
);
create index activity_history_recent_idx on public.activity_history(camporee_id,created_at desc,id desc);
alter table public.activity_history enable row level security;
revoke all on public.activity_history from anon,authenticated;
grant select on public.activity_history to authenticated;
create policy activity_history_member_read on public.activity_history for select to authenticated
  using (private.is_camporee_member(camporee_id));

create function private.record_camporee_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  previous_row jsonb;
  current_row jsonb;
  item jsonb;
  author uuid;
  author_name text;
  scope uuid;
  label text;
begin
  if tg_op = 'UPDATE' then
    previous_row := to_jsonb(old);
    current_row := to_jsonb(new);
    -- Timestamp-only touches are not actions worth showing in the feed.
    if previous_row - 'updated_at' - 'created_at' = current_row - 'updated_at' - 'created_at' then return new; end if;
  end if;

  item := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  scope := case when tg_table_name = 'camporees' then (item->>'id')::uuid else (item->>'camporee_id')::uuid end;
  if scope is null then return case when tg_op = 'DELETE' then old else new end; end if;
  author := auth.uid();
  select p.full_name into author_name from public.profiles p where p.id=author;
  label := coalesce(
    nullif(trim(item->>'title'),''),nullif(trim(item->>'label'),''),
    nullif(trim(item->>'full_name'),''),nullif(trim(item->>'name'),''),
    nullif(trim(item->>'menu'),''),nullif(trim(item->>'description'),''),
    case when tg_table_name='attendance_marks' then 'Registro de asistencia' end,
    case when tg_table_name='camporee_activity_participants' then 'Participante de competencia' end,
    'Elemento'
  );
  insert into public.activity_history(camporee_id,actor_id,actor_name,action,entity_type,entity_id,entity_title)
  values(scope,author,coalesce(nullif(trim(author_name),''),case when author is null then 'Sistema' else 'Miembro del equipo' end),
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    tg_table_name,coalesce(item->>'id',item->>'activity_id')::uuid,left(label,120));
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function private.record_camporee_activity() from public,anon,authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'camporees','areas','tasks','task_checklist_items','schedule_events',
    'lists','list_items','meals','meal_ingredients','participants',
    'expenses','income_entries','notes','inventory_items','emergency_contacts',
    'camporee_documents','announcements','attendance_sessions','attendance_marks',
    'camporee_activities','camporee_activity_participants'
  ] loop
    execute format('create trigger record_activity_history after insert or update or delete on public.%I for each row execute function private.record_camporee_activity()',table_name);
  end loop;
end $$;
