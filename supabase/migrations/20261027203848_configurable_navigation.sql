-- Existing camporees_admin_update RLS limits these settings to active
-- organization admins; members keep read access to their own camporee.
alter table public.camporees add column navigation_panels text[] not null default array['inventory','tasks'];
alter table public.camporees add constraint camporees_navigation_panels_valid check (
  cardinality(navigation_panels) between 0 and 3
  and coalesce(array_ndims(navigation_panels),1)=1
  and coalesce(array_lower(navigation_panels,1),1)=1
  and array_position(navigation_panels,null) is null
  and navigation_panels <@ array['inventory','tasks','program','activities','announcements','attendance','meals','participants','lists','budget','documents','emergency','notes','songs']::text[]
  and (cardinality(navigation_panels)<2 or navigation_panels[1]<>navigation_panels[2])
  and (cardinality(navigation_panels)<3 or (navigation_panels[1]<>navigation_panels[3] and navigation_panels[2]<>navigation_panels[3]))
);
