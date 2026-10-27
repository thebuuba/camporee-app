// In-memory transport for worker tests; actual locking/permissions are tested in SQL.
export function deliveryRpc(rows, now) {
  return async function rpc(name,args={}) {
    const jobs=rows.system_push_reminder_log;
    const clock=new Date(now()).getTime();
    if(name==='enqueue_push_delivery') {
      if(!jobs.some(j=>j.camporee_id===args.target_camporee&&j.user_id===args.target_user&&j.milestone===args.delivery_key))
        jobs.push({id:String(jobs.length+1),camporee_id:args.target_camporee,user_id:args.target_user,milestone:args.delivery_key,
          payload:args.delivery_payload,ttl:args.delivery_ttl,expires_at:args.delivery_expires,state:'pending',attempts:0,next:0,accepted_subscription_ids:[]});
      return {data:null,error:null};
    }
    if(name==='claim_push_delivery') {
      const job=jobs.find(j=>j.state==='pending'&&j.next<=clock&&Date.parse(j.expires_at)>clock);
      if(!job)return {data:[],error:null};
      job.state='leased';job.attempts++;job.lease_token=String(job.attempts);return {data:[{...job}],error:null};
    }
    const job=jobs.find(j=>j.id===args.delivery_id&&j.lease_token===args.owner_token&&j.state==='leased');
    if(!job)return {data:false,error:null};
    if(name==='renew_push_delivery')return {data:true,error:null};
    if(name==='ack_push_subscription')job.accepted_subscription_ids.push(args.subscription_id);
    if(name==='finish_push_delivery'){job.state=args.retry?'pending':'delivered';job.next=clock+30000;}
    return {data:true,error:null};
  };
}
