-- One shared rule list per camporee. Existing events keep the published rules;
-- newly created events receive the same list automatically.
create table public.camporee_rule_sets (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null unique references public.camporees(id) on delete cascade,
  rules text[] not null default array[
    'Respetar a los directores, consejeros, dirigentes y compañeros.',
    'No decir palabras obscenas.',
    'No pelear ni discutir.',
    'Respetar las pertenencias ajenas.',
    'Cumplir los horarios establecidos.',
    'Mantener su carpa organizada.',
    'No abandonar el área de campamento.',
    'Mantener una actitud reverente durante los cultos.',
    'Evitar las burlas durante las actividades.',
    'No alejarse del grupo.',
    'Bañarse y mantener una buena higiene.',
    'No salir a comer mientras estemos en la capilla.',
    'Respetar las opiniones de los demás.',
    'Respetar el toque de queda.'
  ]::text[],
  constraint camporee_rule_count check (cardinality(rules) between 1 and 60 and array_position(rules, null) is null)
);

alter table public.camporee_rule_sets enable row level security;
revoke all on public.camporee_rule_sets from anon, authenticated;
grant select, update (rules) on public.camporee_rule_sets to authenticated;
create policy camporee_rules_read on public.camporee_rule_sets for select to authenticated
  using (private.is_camporee_member(camporee_id));
create policy camporee_rules_edit on public.camporee_rule_sets for update to authenticated
  using (private.can_edit_camporee(camporee_id, 'notes'))
  with check (private.can_edit_camporee(camporee_id, 'notes'));

insert into public.camporee_rule_sets(camporee_id)
select id from public.camporees on conflict (camporee_id) do nothing;

create function private.seed_camporee_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.camporee_rule_sets(camporee_id) values(new.id);
  return new;
end $$;
revoke all on function private.seed_camporee_rules() from public, anon, authenticated;
create trigger seed_camporee_rules after insert on public.camporees
  for each row execute function private.seed_camporee_rules();
