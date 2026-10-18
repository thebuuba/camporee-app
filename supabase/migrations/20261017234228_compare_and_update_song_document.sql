-- Body-based compare-and-swap avoids putting full lyrics in PostgREST URLs.
-- SECURITY INVOKER preserves the caller's existing camporee_documents RLS.
create or replace function public.compare_and_update_song_document(
  p_camporee_id uuid, p_song_id uuid, p_expected jsonb, p_changes jsonb
)
returns setof public.camporee_documents
language sql volatile security invoker
set search_path = ''
as $$
  update public.camporee_documents as d
  set title = case when p_changes ? 'title' then p_changes->>'title' else d.title end,
      document_type = case when p_changes ? 'document_type' then p_changes->>'document_type' else d.document_type end,
      notes = case when p_changes ? 'notes' then p_changes->>'notes' else d.notes end,
      file_path = case when p_changes ? 'file_path' then p_changes->>'file_path' else d.file_path end,
      external_url = case when p_changes ? 'external_url' then p_changes->>'external_url' else d.external_url end
  where d.id = p_song_id and d.camporee_id = p_camporee_id
    and d.document_type like 'song:%'
    and jsonb_typeof(p_expected) = 'object' and p_expected ? 'notes'
    and d.notes is not distinct from (p_expected->>'notes')
    and (not (p_expected ? 'file_path') or d.file_path is not distinct from (p_expected->>'file_path'))
    and (not (p_expected ? 'external_url') or d.external_url is not distinct from (p_expected->>'external_url'))
    and (not (p_changes ? 'document_type') or p_changes->>'document_type' in ('song:club','song:camporee','song:hymns'))
    and (not (p_changes ? 'title') or length(p_changes->>'title') <= 200)
    and length(coalesce(p_changes->>'notes', '')) <= 500000
  returning d.*;
$$;
revoke all on function public.compare_and_update_song_document(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.compare_and_update_song_document(uuid, uuid, jsonb, jsonb) to authenticated, service_role;
