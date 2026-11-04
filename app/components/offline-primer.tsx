'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {parseTenantPath} from '@/lib/tenant-context';
import {readScopedOfflineWrites} from '@/lib/offline-fetch';
import {saveOfflineSnapshot,snapshotKey,type OfflineSnapshot} from '@/lib/offline-snapshot';

// Keep one RLS-checked copy of the four field panels for the selected account
// and camporee. No private server-rendered HTML is placed in a shared cache.
export default function OfflinePrimer() {
  const pathname=usePathname();
  useEffect(()=>{
    const scope=parseTenantPath(pathname);
    if(!scope)return;
    const supabase=createClient();
    let disposed=false, preparing=false, again=false;
    const prepare=async()=>{
      if(disposed||!navigator.onLine)return;
      if(preparing){again=true;return;}
      preparing=true;
      try {
        const {data:auth,error:authError}=await supabase.auth.getUser();
        if(authError||!auth.user||disposed)return;
        const {data:session}=await supabase.auth.getSession();
        if(session.session?.access_token && (await readScopedOfflineWrites(`Bearer ${session.session.access_token}`)).length)return;
        const [event,member,program,meals,tasks,lists]=await Promise.all([
          supabase.from('camporees').select('id,organization_id,name,time_zone,status').eq('id',scope.camporeeId).eq('organization_id',scope.organizationId).maybeSingle(),
          supabase.from('organization_members').select('role,is_active,permissions').eq('organization_id',scope.organizationId).eq('user_id',auth.user.id).maybeSingle(),
          supabase.from('schedule_events').select('id,title,description,starts_at,ends_at,location').eq('camporee_id',scope.camporeeId).order('starts_at'),
          supabase.from('meals').select('id,meal_date,meal_type,meal_time,menu,responsible_name,notes').eq('camporee_id',scope.camporeeId).order('meal_date'),
          supabase.from('tasks').select('id,title,description,status,due_at,phase').eq('camporee_id',scope.camporeeId).order('created_at',{ascending:false}),
          supabase.from('lists').select('id,title,category,list_items(id,label,is_done,quantity,unit)').eq('camporee_id',scope.camporeeId).order('created_at'),
        ]);
        if(disposed||!navigator.onLine||!event.data||!member.data?.is_active||
          [event,member,program,meals,tasks,lists].some(result=>result.error))return;
        const permission=(module:string)=>event.data.status!=='archived'&&(
          member.data.role==='admin'||member.data.role==='editor'||
          member.data.permissions?.[module]===true||member.data.permissions?.edit===true);
        const snapshot:OfflineSnapshot={
          key:snapshotKey(auth.user.id,scope.organizationId,scope.camporeeId),
          ownerId:auth.user.id,organizationId:scope.organizationId,camporeeId:scope.camporeeId,
          camporeeName:event.data.name,timeZone:event.data.time_zone||'America/Santo_Domingo',savedAt:Date.now(),
          canEditTasks:permission('tasks'),canEditLists:permission('lists'),
          program:program.data??[],meals:meals.data??[],tasks:tasks.data??[],lists:lists.data??[],
        };
        await saveOfflineSnapshot(snapshot);
      }catch{/* An unavailable account, network or storage leaves the existing copy intact. */}
      finally{preparing=false;if(again&&!disposed){again=false;void prepare();}}
    };
    const onOnline=()=>void prepare();
    const onChange=()=>{if(navigator.onLine)void prepare();};
    void prepare();
    window.addEventListener('online',onOnline);
    window.addEventListener('camporee:mutation-success',onChange);
    window.addEventListener('camporee:queue-flushed',onChange);
    return()=>{disposed=true;window.removeEventListener('online',onOnline);window.removeEventListener('camporee:mutation-success',onChange);window.removeEventListener('camporee:queue-flushed',onChange);};
  },[pathname]);
  return null;
}
