create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.camporees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  theme text, location text,
  starts_on date not null, ends_on date not null,
  status text not null default 'planning' check (status in ('planning','active','finished','archived')),
  currency text not null default 'DOP',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.camporee_members (
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('admin','director','leader','collaborator')),
  created_at timestamptz not null default now(), primary key(camporee_id,user_id)
);
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  name text not null, icon text, sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null, title text not null, description text,
  phase text not null default 'before' check (phase in ('before','during','after')),
  status text not null default 'pending' check (status in ('pending','in_progress','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz, assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  label text not null, is_done boolean not null default false, sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null, title text not null, description text, location text,
  starts_at timestamptz not null, ends_at timestamptz, responsible_name text, created_at timestamptz not null default now()
);
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  title text not null, category text, created_at timestamptz not null default now()
);
create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(), list_id uuid not null references public.lists(id) on delete cascade,
  label text not null, quantity numeric, unit text, is_done boolean not null default false, notes text, sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  meal_date date not null, meal_type text not null check (meal_type in ('breakfast','snack_am','lunch','snack_pm','dinner','other')),
  menu text not null, responsible_name text, notes text, created_at timestamptz not null default now()
);
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  full_name text not null, participant_type text not null default 'member' check (participant_type in ('member','leader','staff','guest')),
  unit_name text, phone text, emergency_contact text, emergency_phone text,
  attendance_status text not null default 'confirmed' check (attendance_status in ('invited','confirmed','cancelled','checked_in')),
  notes text, created_at timestamptz not null default now()
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null, description text not null, amount numeric not null check (amount >= 0),
  spent_on date not null default current_date, category text, paid_by text, notes text,
  created_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null, title text, body text not null, note_date date not null default current_date,
  created_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(), camporee_id uuid not null references public.camporees(id) on delete cascade,
  name text not null, quantity numeric not null default 1, unit text, packed boolean not null default false, returned boolean not null default false,
  notes text, created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.camporees enable row level security;
alter table public.camporee_members enable row level security;
alter table public.areas enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.schedule_events enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.meals enable row level security;
alter table public.participants enable row level security;
alter table public.expenses enable row level security;
alter table public.notes enable row level security;
alter table public.inventory_items enable row level security;

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name) values(new.id,nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')),'')) on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user_profile();

insert into storage.buckets(id,name,public) values('camporee-files','camporee-files',false) on conflict(id) do nothing;
