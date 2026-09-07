create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  notes text,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.camporee_documents (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  title text not null,
  document_type text,
  file_path text,
  external_url text,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.emergency_contacts enable row level security;
alter table public.camporee_documents enable row level security;

create policy emergency_shared_select on public.emergency_contacts for select using (is_app_member());
create policy emergency_shared_write on public.emergency_contacts for all using (can_edit_module('participants')) with check (can_edit_module('participants'));
create policy documents_shared_select on public.camporee_documents for select using (is_app_member());
create policy documents_shared_write on public.camporee_documents for all using (can_edit_module('settings')) with check (can_edit_module('settings'));

create index if not exists emergency_contacts_camporee_idx on public.emergency_contacts(camporee_id, priority, created_at);
create index if not exists camporee_documents_camporee_idx on public.camporee_documents(camporee_id, created_at desc);
