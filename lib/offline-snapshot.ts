export type OfflineEvent = { id:string; title:string; description:string|null; starts_at:string; ends_at:string|null; location:string|null };
export type OfflineMeal = { id:string; meal_date:string; meal_type:string; meal_time:string|null; menu:string; responsible_name:string|null; notes:string|null };
export type OfflineTask = { id:string; title:string; description:string|null; status:string; due_at:string|null; phase:string|null };
export type OfflineList = { id:string; title:string; category:string|null; list_items:{id:string;label:string;is_done:boolean;quantity:number|null;unit:string|null}[] };

export type OfflineSnapshot = {
  key:string; ownerId:string; organizationId:string; camporeeId:string;
  camporeeName:string; timeZone:string; savedAt:number;
  canEditTasks:boolean; canEditLists:boolean;
  program:OfflineEvent[]; meals:OfflineMeal[]; tasks:OfflineTask[]; lists:OfflineList[];
};

export type OfflineMutation={table:string;method:string;id:string|null;payload:Record<string,unknown>|null};
export function applyOfflineMutations(snapshot:OfflineSnapshot,mutations:OfflineMutation[]):OfflineSnapshot {
  let result=snapshot;
  for(const change of mutations){
    const key=({schedule_events:'program',meals:'meals',tasks:'tasks',lists:'lists'} as Record<string,'program'|'meals'|'tasks'|'lists'>)[change.table];
    if(change.table==='list_items'){
      const id=change.id;
      if(!id)continue;
      result={...result,lists:result.lists.map(list=>{
        const items=list.list_items;
        if(change.method==='POST'&&change.payload?.list_id===list.id&&typeof change.payload.label==='string'&&!items.some(item=>item.id===id))
          return {...list,list_items:[...items,{id,label:change.payload.label,is_done:change.payload.is_done===true,
            quantity:typeof change.payload.quantity==='number'?change.payload.quantity:null,
            unit:typeof change.payload.unit==='string'?change.payload.unit:null}]};
        if(change.method==='DELETE')return {...list,list_items:items.filter(item=>item.id!==id)};
        return {...list,list_items:items.map(item=>item.id===id&&change.method==='PATCH'?{...item,...change.payload}:item)};
      })};
      continue;
    }
    if(!key||!change.id)continue;
    const rows=result[key] as {id:string}[];
    if(change.method==='DELETE')result={...result,[key]:rows.filter(row=>row.id!==change.id)};
    if(change.method==='PATCH'&&change.payload)result={...result,[key]:rows.map(row=>row.id===change.id?{...row,...change.payload}:row)};
    if(change.method==='POST'&&change.payload&&!rows.some(row=>row.id===change.id)){
      result={...result,[key]:[...rows,{...change.payload,id:change.id,...(key==='lists'?{list_items:[]}:{})}]};
    }
  }
  return result;
}

export const OFFLINE_IDENTITY_KEY = 'camporee-offline-identity-v1';
const DB_NAME = 'camporee-snapshots-v1';
const STORE = 'snapshots';
export const snapshotKey = (ownerId:string, organizationId:string, camporeeId:string) => `${ownerId}:${organizationId}:${camporeeId}`;

function openDb():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'key'});};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>reject(request.error??new Error('No se pudo abrir la copia local.'));
    request.onblocked=()=>reject(new Error('Cierra las otras pestañas para preparar el modo sin conexión.'));
  });
}

async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await openDb();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      const request=run(tx.objectStore(STORE));
      tx.oncomplete=()=>resolve(request.result);
      tx.onerror=tx.onabort=()=>reject(tx.error??request.error??new Error('No se pudo guardar la copia local.'));
    });
  } finally {db.close();}
}

export function rememberOfflineIdentity(ownerId:string) {
  localStorage.setItem(OFFLINE_IDENTITY_KEY,ownerId);
}
export function currentOfflineIdentity():string|null {
  try {const id=localStorage.getItem(OFFLINE_IDENTITY_KEY);return id&&/^[0-9a-f-]{36}$/i.test(id)?id:null;}catch{return null;}
}
export function forgetOfflineIdentity() {
  try {localStorage.removeItem(OFFLINE_IDENTITY_KEY);}catch{/* Private browsing may block storage. */}
}

export async function saveOfflineSnapshot(snapshot:OfflineSnapshot):Promise<void> {
  await transaction('readwrite',store=>store.put(snapshot));
  rememberOfflineIdentity(snapshot.ownerId);
}
export async function listOfflineSnapshots(ownerId:string):Promise<OfflineSnapshot[]> {
  const rows=await transaction<OfflineSnapshot[]>('readonly',store=>store.getAll());
  return rows.filter(row=>row.ownerId===ownerId).sort((a,b)=>b.savedAt-a.savedAt);
}
export async function updateOfflineSnapshot(snapshot:OfflineSnapshot):Promise<void> {
  await transaction('readwrite',store=>store.put(snapshot));
}
