import { enqueueDelivery } from './delivery.ts';
// Queue each user/event start once; the common worker owns delivery leases.
export async function sendScheduleReminders(supabase: any, webpush: any, now = new Date()) {
  const {data: events, error: eventsError} = await supabase.from('schedule_events')
    .select('id,camporee_id,title,starts_at,ends_at')
    .gte('starts_at', new Date(now.getTime() - 5 * 60_000).toISOString())
    .lte('starts_at', now.toISOString()).order('starts_at');
  if (eventsError) throw eventsError;
  if (!events?.length) return {sent: 0, stale: 0};
  for (const event of events) {
    if (event.ends_at && new Date(event.ends_at) <= now) continue;
    const {data: camporee, error: camporeeError} = await supabase.from('camporees').select('id,organization_id,status').eq('id', event.camporee_id).maybeSingle();
    if (camporeeError) throw camporeeError;
    if (!camporee || ['finished','archived'].includes(camporee.status)) continue;
    const {data: members, error: membersError} = await supabase.from('organization_members').select('user_id').eq('organization_id', camporee.organization_id).eq('is_active', true);
    if (membersError) throw membersError;
    if (!members?.length) continue;
    const {data: subscriptions, error: subscriptionsError} = await supabase.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').contains('camporee_ids', [camporee.id]).in('user_id', members.map((member: any) => member.user_id));
    if (subscriptionsError) throw subscriptionsError;
    const milestone = `schedule:${event.id}:${event.starts_at}`;
    const payload = JSON.stringify({title: 'La actividad está comenzando', body: event.title, url: `/o/${camporee.organization_id}/c/${camporee.id}/program`, tag: milestone});
    for (const member of members) {
      const devices = (subscriptions ?? []).filter((subscription: any) => subscription.user_id === member.user_id);
      if (!devices.length) continue;
      await enqueueDelivery(supabase, camporee.id, member.user_id, milestone, JSON.parse(payload), 300,
        new Date(Math.min(new Date(event.starts_at).getTime() + 30 * 60_000, event.ends_at ? new Date(event.ends_at).getTime() : Infinity)));
    }
  }
  return {sent: 0, stale: 0};
}
