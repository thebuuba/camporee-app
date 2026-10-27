export async function enqueueDelivery(supabase: any, camporeeId: string, userId: string,
  key: string, payload: object, ttl: number, expires: Date) {
  const {error} = await supabase.rpc('enqueue_push_delivery', {
    target_camporee: camporeeId, target_user: userId, delivery_key: key,
    delivery_payload: payload, delivery_ttl: ttl, delivery_expires: expires.toISOString(),
  });
  if (error) throw error;
}

export async function drainDeliveries(supabase: any, webpush: any) {
  let sent = 0, stale = 0;
  // Bound each cron invocation; subsequent minute runs continue the same queue.
  const deadline = Date.now() + 40_000;
  let keys: any;
  for (let i = 0; i < 100 && Date.now() < deadline; i++) {
    const {data: jobs, error} = await supabase.rpc('claim_push_delivery');
    if (error) throw error;
    const job = jobs?.[0];
    if (!job) break;
    const ownership = {delivery_id: job.id, owner_token: job.lease_token};
    if (!keys) {
      const {data, error} = await supabase.from('push_vapid_keys').select('public_key,private_key').eq('singleton', true).maybeSingle();
      if (error || !data?.public_key || !data?.private_key) throw error ?? new Error('Push keys unavailable');
      keys = data;
      webpush.setVapidDetails('mailto:notifications@example.com', keys.public_key, keys.private_key);
    }
    const {data: devices, error: deviceError} = await supabase.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth').contains('camporee_ids', [job.camporee_id]).eq('user_id', job.user_id);
    if (deviceError) throw deviceError;
    const accepted: string[] = [];
    let retry = !devices?.length, owns = true;
    for (const device of devices ?? []) {
      if (job.accepted_subscription_ids.includes(device.id)) continue;
      if (Date.now() >= deadline) {retry = true; break;}
      const {data: renewed, error} = await supabase.rpc('renew_push_delivery', ownership);
      if (error) throw error;
      if (!renewed) {owns = false; break;}
      try {
        await webpush.sendNotification({endpoint: device.endpoint, keys: {p256dh: device.p256dh, auth: device.auth}},
          JSON.stringify(job.payload), {TTL: Math.max(1, Math.min(job.ttl, Math.ceil((Date.parse(job.expires_at)-Date.now())/1000))), timeout: 10000});
        sent++;
        // Persist each accepted endpoint before proceeding to another device.
        // A crash after provider acceptance but before this acknowledgement can
        // still redeliver: web push has no transactional exactly-once guarantee.
        const {data: acknowledged, error} = await supabase.rpc('ack_push_subscription', {...ownership, subscription_id: device.id});
        if (error) throw error;
        if (!acknowledged) {owns = false; break;}
        accepted.push(device.id);
      } catch (error: any) {
        if ([404,410].includes(error?.statusCode)) {
          const {error: deleteError} = await supabase.from('push_subscriptions').delete().eq('id', device.id);
          if (deleteError) throw deleteError;
          stale++;
        } else { retry = true; console.error('Durable push failed', error?.statusCode ?? error?.message); }
      }
    }
    if (owns) {
      const {error} = await supabase.rpc('finish_push_delivery', {...ownership, accepted_ids: accepted,
        retry: retry || (!job.accepted_subscription_ids.length && !accepted.length)});
      if (error) throw error;
    }
  }
  return {sent, stale};
}
