type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  headers: [string, string][];
  body: string | null;
  createdAt: number;
};

const DB_NAME = 'camporee-offline';
const STORE = 'requests';
const REST_TABLES_WITH_UUID_ID = new Set(['camporees','areas','tasks','task_checklist_items','schedule_events','lists','list_items','meals','participants','expenses','notes','inventory_items','emergency_contacts','camporee_documents']);
let lastAuthorization = '';
let flushing = false;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putQueued(item: QueuedRequest) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  window.dispatchEvent(new CustomEvent('camporee:queued-write'));
}

async function getQueued(): Promise<QueuedRequest[]> {
  const db = await openDb();
  const rows = await new Promise<QueuedRequest[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as QueuedRequest[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows.sort((a,b) => a.createdAt - b.createdAt);
}

async function deleteQueued(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function flushOfflineWrites(authOverride?: string) {
  if (typeof window === 'undefined' || !navigator.onLine || flushing) return;
  flushing = true;
  try {
    const queued = await getQueued();
    for (const item of queued) {
      const headers = new Headers(item.headers);
      const auth = authOverride || lastAuthorization;
      if (auth) headers.set('authorization', auth);
      try {
        const response = await fetch(item.url, { method:item.method, headers, body:item.body });
        if (response.ok) await deleteQueued(item.id);
        else if (response.status !== 401 && response.status !== 403 && response.status < 500) await deleteQueued(item.id);
      } catch { break; }
    }
    window.dispatchEvent(new CustomEvent('camporee:queue-flushed'));
  } finally { flushing = false; }
}

function tableFromUrl(url: URL) {
  const marker = '/rest/v1/';
  const index = url.pathname.indexOf(marker);
  return index >= 0 ? url.pathname.slice(index + marker.length).split('/')[0] : '';
}

function extractEqId(url: URL) {
  const raw = url.searchParams.get('id');
  return raw?.startsWith('eq.') ? raw.slice(3) : undefined;
}

function syntheticResponse(request: Request, payload: any, method: string, id?: string) {
  if (method === 'DELETE') return new Response(null, { status: 204 });
  const result = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload, ...(id ? { id } : {}) } : payload;
  const wantsObject = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
  return new Response(JSON.stringify(wantsObject ? result : [result]), { status: 200, headers: { 'content-type':'application/json', 'x-camporee-offline':'queued' } });
}

export async function camporeeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return fetch(input, init);
  let request = new Request(input, init);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const isRestMutation = url.origin.includes('.supabase.co') && url.pathname.includes('/rest/v1/') && ['POST','PATCH','DELETE'].includes(method);
  const auth = request.headers.get('authorization') || '';
  if (auth) lastAuthorization = auth;
  if (!isRestMutation) {
    if (navigator.onLine) void flushOfflineWrites(auth);
    return fetch(request);
  }

  let body = method === 'DELETE' ? null : await request.clone().text();
  let payload:any = body ? JSON.parse(body) : null;
  let optimisticId = extractEqId(url);
  const table = tableFromUrl(url);
  if (method === 'POST' && payload && !Array.isArray(payload) && REST_TABLES_WITH_UUID_ID.has(table) && !payload.id) {
    optimisticId = crypto.randomUUID();
    payload = { ...payload, id: optimisticId };
    body = JSON.stringify(payload);
    request = new Request(request.url, { method, headers: request.headers, body });
  }

  try {
    if (!navigator.onLine) throw new TypeError('offline');
    const response = await fetch(request);
    void flushOfflineWrites(auth);
    return response;
  } catch (error) {
    const queued: QueuedRequest = { id: crypto.randomUUID(), url: request.url, method, headers: Array.from(request.headers.entries()), body, createdAt: Date.now() };
    await putQueued(queued);
    return syntheticResponse(request, payload, method, optimisticId);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushOfflineWrites(); });
}
