create table if not exists public.income_entries (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  received_on date not null default current_date,
  category text,
  received_from text,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.income_entries enable row level security;

create policy income_entries_select on public.income_entries for select to authenticated using (private.is_app_member());
create policy income_entries_insert on public.income_entries for insert to authenticated with check (private.can_edit_module('finances'));
create policy income_entries_update on public.income_entries for update to authenticated using (private.can_edit_module('finances')) with check (private.can_edit_module('finances'));
create policy income_entries_delete on public.income_entries for delete to authenticated using (private.can_edit_module('finances'));

create index if not exists idx_income_entries_camporee on public.income_entries(camporee_id, received_on desc);
create index if not exists idx_income_entries_created_by on public.income_entries(created_by);
