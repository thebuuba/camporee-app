create table if not exists public.push_vapid_keys (
  singleton boolean primary key default true check (singleton),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_vapid_keys enable row level security;
revoke all on table public.push_vapid_keys from anon, authenticated;
