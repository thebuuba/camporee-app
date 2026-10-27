-- Participant assignments are optional, but always belong to the task's camporee.
alter table public.tasks add column if not exists assigned_participant_id uuid;
alter table public.tasks add constraint tasks_assigned_participant_camporee_fk
  foreign key (camporee_id, assigned_participant_id)
  references public.participants(camporee_id, id)
  on delete set null (assigned_participant_id);
create index tasks_assigned_participant_camporee_idx on public.tasks(camporee_id, assigned_participant_id)
  where assigned_participant_id is not null;

-- One invocation is one transaction. Invoker rights retain every table's RLS.
create function public.save_camporee_activity(
  target_camporee uuid, activity_id uuid, activity_data jsonb,
  participant_ids uuid[], sync_program boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.camporee_activities%rowtype;
  input record;
  event_id uuid;
begin
  if auth.uid() is null or not private.can_edit_camporee(target_camporee, 'schedule') then
    raise exception 'Activity edit permission required' using errcode = '42501';
  end if;
  if activity_data is null or jsonb_typeof(activity_data) <> 'object'
    or nullif(trim(activity_data->>'title'), '') is null then
    raise exception 'Activity title required' using errcode = '23514';
  end if;
  if activity_id is not null then
    select * into saved from public.camporee_activities a
      where a.id = activity_id and a.camporee_id = target_camporee for update;
    if not found then raise exception 'Activity unavailable' using errcode = '42501'; end if;
  end if;
  select * into input from jsonb_to_record(activity_data) as value(
    title text, activity_type text, starts_at timestamptz, location text,
    responsible_name text, materials text, result text, score numeric, notes text
  );
  if sync_program and input.starts_at is null then
    raise exception 'Program synchronization requires a start time' using errcode = '23514';
  end if;
  -- Omission of the optional location preserves it on edit.
  if not activity_data ? 'location' then input.location := saved.location; end if;
  if activity_id is null then
    insert into public.camporee_activities(camporee_id,title,activity_type,starts_at,location,responsible_name,materials,result,score,notes)
      values(target_camporee,trim(input.title),coalesce(input.activity_type,'competition'),input.starts_at,input.location,input.responsible_name,input.materials,input.result,input.score,input.notes)
      returning * into saved;
  else
    update public.camporee_activities a set title=trim(input.title),activity_type=coalesce(input.activity_type,'competition'),
      starts_at=input.starts_at,location=input.location,responsible_name=input.responsible_name,
      materials=input.materials,result=input.result,score=input.score,notes=input.notes
      where a.id=activity_id and a.camporee_id=target_camporee returning * into saved;
    if not found then raise exception 'Activity unavailable' using errcode = '42501'; end if;
  end if;
  event_id := saved.schedule_event_id;
  if sync_program then
    if event_id is null then
      insert into public.schedule_events(camporee_id,title,description,location,responsible_name,starts_at,ends_at)
        values(target_camporee,saved.title,saved.notes,saved.location,saved.responsible_name,saved.starts_at,null)
        returning id into event_id;
    else
      update public.schedule_events e set title=saved.title,description=saved.notes,location=saved.location,
        responsible_name=saved.responsible_name,starts_at=saved.starts_at,ends_at=null
        where e.id=event_id and e.camporee_id=target_camporee returning id into event_id;
      if not found then raise exception 'Program event unavailable' using errcode = '42501'; end if;
    end if;
    update public.camporee_activities a set schedule_event_id=event_id
      where a.id=saved.id and a.camporee_id=target_camporee returning * into saved;
    if not found then raise exception 'Activity unavailable' using errcode = '42501'; end if;
  elsif event_id is not null then
    update public.camporee_activities a set schedule_event_id=null
      where a.id=saved.id and a.camporee_id=target_camporee returning * into saved;
    if not found then raise exception 'Activity unavailable' using errcode = '42501'; end if;
    delete from public.schedule_events e where e.id=event_id and e.camporee_id=target_camporee;
    if not found then raise exception 'Program event unavailable' using errcode = '42501'; end if;
  end if;
  delete from public.camporee_activity_participants p where p.activity_id=saved.id and p.camporee_id=target_camporee;
  -- Scoped FKs reject foreign or missing participants; any failure rolls back ALL writes above.
  insert into public.camporee_activity_participants(camporee_id,activity_id,participant_id)
    select target_camporee,saved.id,id from (select distinct unnest(coalesce(participant_ids,'{}'::uuid[])) id) selected;
  return to_jsonb(saved) || jsonb_build_object('camporee_activity_participants',coalesce((
    select jsonb_agg(jsonb_build_object('participant_id',p.participant_id) order by p.participant_id)
    from public.camporee_activity_participants p where p.activity_id=saved.id and p.camporee_id=target_camporee
  ),'[]'::jsonb));
end $$;
revoke all on function public.save_camporee_activity(uuid,uuid,jsonb,uuid[],boolean) from public,anon;
grant execute on function public.save_camporee_activity(uuid,uuid,jsonb,uuid[],boolean) to authenticated;

-- Scalar JSON is not truncated by PostgREST's row cap. Every aggregate is scoped
-- explicitly and still runs under the caller's RLS. Only preview rows are limited.
create function public.get_camporee_home_summary(target_camporee uuid, as_of timestamptz default now())
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  zone text;
  today date;
  summary jsonb;
begin
  if auth.uid() is null or not private.is_camporee_member(target_camporee) then
    raise exception 'Camporee membership required' using errcode = '42501';
  end if;
  select c.time_zone into zone from public.camporees c where c.id=target_camporee;
  today := (as_of at time zone zone)::date;
  with task_totals as (
    select count(*) filter(where status<>'cancelled') total,
      count(*) filter(where status='done') completed,
      count(*) filter(where status not in ('done','cancelled')) pending,
      count(*) filter(where phase='before' and status<>'cancelled') preparation_total,
      count(*) filter(where phase='before' and status='done') preparation_completed,
      count(*) filter(where status not in ('done','cancelled') and (due_at at time zone zone)::date=today) today_pending
    from public.tasks where camporee_id=target_camporee
  ) select jsonb_build_object(
    'totalTasks',t.total,'completedTasks',t.completed,'pendingTasks',t.pending,
    'progress',case when t.total=0 then 0 else round(t.completed*100.0/t.total) end,
    'preparation',jsonb_build_object('total',t.preparation_total,'completed',t.preparation_completed,
      'percent',case when t.preparation_total=0 then 0 else round(t.preparation_completed*100.0/t.preparation_total) end),
    'todayPendingTasks',t.today_pending,
    'totalExpenses',(select coalesce(sum(amount),0) from public.expenses where camporee_id=target_camporee),
    'totalIncome',(select coalesce(sum(amount),0) from public.income_entries where camporee_id=target_camporee),
    'participants',(select count(*) from public.participants where camporee_id=target_camporee),
    'presentParticipants',(select count(*) from public.participants where camporee_id=target_camporee and attendance_status='checked_in'),
    'programCount',(select count(*) from public.schedule_events where camporee_id=target_camporee),
    'todayProgramCount',(select count(*) from public.schedule_events where camporee_id=target_camporee and (starts_at at time zone zone)::date=today),
    'todayTasks',coalesce((select jsonb_agg(to_jsonb(preview) order by (priority='urgent') desc,due_at,id) from (
      select id,title,status,priority,due_at,phase from public.tasks where camporee_id=target_camporee
        and status not in ('done','cancelled') and (due_at at time zone zone)::date=today
      order by (priority='urgent') desc,due_at,id limit 3
    ) preview),'[]'::jsonb),
    'currentEvent',(select to_jsonb(preview) from (
      select id,title,starts_at,ends_at,location from public.schedule_events where camporee_id=target_camporee
        and starts_at<=as_of and coalesce(ends_at,starts_at+interval '1 hour')>as_of
      order by starts_at,id limit 1
    ) preview),
    'nextEvent',(select to_jsonb(preview) from (
      select id,title,starts_at,ends_at,location from public.schedule_events where camporee_id=target_camporee and starts_at>as_of
      order by starts_at,id limit 1
    ) preview)
  ) into summary from task_totals t;
  return summary;
end $$;
revoke all on function public.get_camporee_home_summary(uuid,timestamptz) from public,anon;
grant execute on function public.get_camporee_home_summary(uuid,timestamptz) to authenticated;

-- A scalar aggregate reads the complete list in one statement snapshot.
-- Offset/cursor requests cannot provide this guarantee while rows are changing.
-- Payload memory grows with history, matching the current full-list UI; very
-- large histories will need persisted snapshots or exports rather than offsets.
create function public.get_camporee_finance_rows(target_camporee uuid, entry_kind text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare rows jsonb;
begin
  if auth.uid() is null or not private.is_camporee_member(target_camporee) then
    raise exception 'Camporee membership required' using errcode = '42501';
  end if;
  if entry_kind = 'expenses' then
    select coalesce(jsonb_agg(to_jsonb(entry) order by entry.spent_on desc,entry.id),'[]'::jsonb) into rows from (
      select id,description,amount,spent_on,category,paid_by,notes,area_id,created_at
      from public.expenses where camporee_id=target_camporee
    ) entry;
  elsif entry_kind = 'income_entries' then
    select coalesce(jsonb_agg(to_jsonb(entry) order by entry.received_on desc,entry.id),'[]'::jsonb) into rows from (
      select id,description,amount,received_on,category,received_from,notes,created_at
      from public.income_entries where camporee_id=target_camporee
    ) entry;
  else
    raise exception 'Unknown finance entry kind' using errcode = '23514';
  end if;
  return rows;
end $$;
revoke all on function public.get_camporee_finance_rows(uuid,text) from public,anon;
grant execute on function public.get_camporee_finance_rows(uuid,text) to authenticated;

create function public.delete_camporee_activity(target_camporee uuid, activity_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare saved public.camporee_activities%rowtype; deleted_id uuid;
begin
  if auth.uid() is null or not private.can_edit_camporee(target_camporee,'schedule') then
    raise exception 'Activity edit permission required' using errcode='42501';
  end if;
  select * into saved from public.camporee_activities a
    where a.id=activity_id and a.camporee_id=target_camporee for update;
  if not found then raise exception 'Activity unavailable' using errcode='42501'; end if;
  delete from public.camporee_activities a where a.id=saved.id and a.camporee_id=target_camporee
    returning a.id into deleted_id;
  if not found then raise exception 'Activity unavailable' using errcode='42501'; end if;
  -- An event error also restores the activity and its cascaded participant rows.
  if saved.schedule_event_id is not null then
    delete from public.schedule_events e where e.id=saved.schedule_event_id and e.camporee_id=target_camporee;
    if not found then raise exception 'Program event unavailable' using errcode='42501'; end if;
  end if;
  return deleted_id;
end $$;
revoke all on function public.delete_camporee_activity(uuid,uuid) from public,anon;
grant execute on function public.delete_camporee_activity(uuid,uuid) to authenticated;
