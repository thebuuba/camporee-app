// Uses the existing reminder log's unique key to claim each user/event start.
export async function sendScheduleReminders(supabase: any, webpush: any, now = new Date()) {
  const {data: events, error: eventsError} = await supabase.from('schedule_events')
    .select('id,camporee_id,title,starts_at,ends_at')
    .gte('starts_at', new Date(now.getTime() - 5 * 60_000).toISOString())
    .lte('starts_at', now.toISOString()).order('starts_at');
  if (eventsError) throw eventsError;
  if (!events?.length) return {sent: 0, stale: 0};
  const {data: keys, error: keysError} = await supabase.from('push_vapid_keys').select('public_key,private_key').eq('singleton', true).maybeSingle();
  if (keysError || !keys?.public_key || !keys?.private_key) throw keysError ?? new Error('Push keys unavailable');
  webpush.setVapidDetails('mailto:notifications@example.com', keys.public_key, keys.private_key);
  let sent = 0;
  const stale: string[] = [];
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
      const {data: claim, error: claimError} = await supabase.from('system_push_reminder_log').insert({camporee_id: camporee.id, user_id: member.user_id, milestone}).select('id').single();
      if (claimError?.code === '23505') continue;
      if (claimError || !claim) throw claimError ?? new Error('Reminder claim unavailable');
      let delivered = 0;
      for (const subscription of devices) {
        try {
          await webpush.sendNotification({endpoint: subscription.endpoint, keys: {p256dh: subscription.p256dh, auth: subscription.auth}}, payload, {TTL: 300});
          delivered++;sent++;
        } catch (error: any) {
          if ([404,410].includes(error?.statusCode)) stale.push(subscription.id);
          else console.error('Activity reminder push failed', error?.statusCode ?? error?.message);
        }
      }
      if (!delivered) {
        const {error} = await supabase.from('system_push_reminder_log').delete().eq('id', claim.id);
        if (error) throw error;
      }
    }
  }
  if (stale.length) {
    const {error} = await supabase.from('push_subscriptions').delete().in('id', stale);
    if (error) throw error;
  }
  return {sent, stale: stale.length};
}
