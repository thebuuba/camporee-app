import {dailySunsetTimes,fridaySunsetReminder,localDate,sunsetReference,sunsetTransitionReminder,supportsSunsetRegion} from '../_shared/sunset.ts';
import {enqueueDelivery} from './delivery.ts';

export async function sendSunsetReminders(supabase:any,now=new Date()){
 const date=localDate(now.getTime());
 if(![5,6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()))return;
 const {data:camporees,error}=await supabase.from('camporees').select('id,organization_id,status,location,time_zone').neq('status','finished').neq('status','archived');
 if(error)throw error;
 const targets=(camporees??[]).filter((camporee:any)=>supportsSunsetRegion(camporee.location,camporee.time_zone));
 if(!targets.length)return;
 const times=await dailySunsetTimes(date);
 if(!sunsetReference(times,date)){console.error('Sunset source unavailable; reminder not queued');return;}
 const reminder=fridaySunsetReminder(now.getTime(),times);
 const transition=sunsetTransitionReminder(now.getTime(),times);
 if(!reminder&&!transition)return;
 const body=times.map(row=>`${row.label}: ${new Intl.DateTimeFormat('es-DO',{timeZone:row.timeZone,hour:'numeric',minute:'2-digit'}).format(Date.parse(row.sunset))}`).join('. ');
 const alert=transition??{key:`sunset:${date}`,expires:reminder!.expires,title:'Se acerca la puesta de sol',body:`${body}. Prepárate para recibir el sábado.`};
 for(const camporee of targets){
  const {data:members,error:memberError}=await supabase.from('organization_members').select('user_id').eq('organization_id',camporee.organization_id).eq('is_active',true);
  if(memberError)throw memberError;
  if(!members?.length)continue;
  const {data:devices,error:deviceError}=await supabase.from('push_subscriptions').select('user_id').contains('camporee_ids',[camporee.id]).in('user_id',members.map((member:any)=>member.user_id));
  if(deviceError)throw deviceError;
  for(const member of members){
   if(!devices?.some((device:any)=>device.user_id===member.user_id))continue;
   const key=alert.key;
   await enqueueDelivery(supabase,camporee.id,member.user_id,key,{
    title:alert.title,body:alert.body,
    url:`/o/${camporee.organization_id}/c/${camporee.id}`,tag:`${camporee.id}-${key}`,
   },Math.max(1,Math.ceil((alert.expires-now.getTime())/1000)),new Date(alert.expires));
  }
 }
}
