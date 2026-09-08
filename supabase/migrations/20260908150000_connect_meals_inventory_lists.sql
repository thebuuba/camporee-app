create table if not exists public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  name text not null,
  required_quantity numeric not null default 1 check (required_quantity >= 0),
  unit text,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.list_items add column if not exists source_meal_ingredient_id uuid references public.meal_ingredients(id) on delete set null;

alter table public.meal_ingredients enable row level security;

drop policy if exists meal_ingredients_shared_select on public.meal_ingredients;
create policy meal_ingredients_shared_select on public.meal_ingredients
for select using (is_app_member());

drop policy if exists meal_ingredients_shared_write on public.meal_ingredients;
create policy meal_ingredients_shared_write on public.meal_ingredients
for all using (can_edit_module('meals')) with check (can_edit_module('meals'));

create index if not exists meal_ingredients_meal_idx on public.meal_ingredients(meal_id, created_at);
create index if not exists meal_ingredients_inventory_idx on public.meal_ingredients(inventory_item_id);
create unique index if not exists list_items_source_meal_ingredient_uidx on public.list_items(source_meal_ingredient_id) where source_meal_ingredient_id is not null;
