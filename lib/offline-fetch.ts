// This module is also imported directly by Node's native TypeScript test runner.
// Keep its scope parser dependency-free so browser and test resolution match.
function parseTenantPath(path: string) {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const match = new RegExp(`^/o/(${uuid})/c/(${uuid})(?:/|$)`, 'i').exec(path);
  return match ? { organizationId:match[1], camporeeId:match[2] } : null;
}

type QueuedRequest = {
  // Older entries lack scope information. They are preserved for recovery but
  // must NEVER be replayed under whichever account happens to be signed in.
  ownerId?: string;
  organizationId?: string;
  camporeeId?: string;
  id: string;
  url: string;
  method: string;
  headers: [string, string][];
  body: string | null;
  createdAt: number;
};

const DB_NAME = 'camporee-offline';
const STORE = 'requests';
const REST_TABLES_WITH_UUID_ID = new Set([
  'camporees','areas','tasks','task_checklist_items','schedule_events','lists','list_items','meals','meal_ingredients','participants','expenses','income_entries','notes','inventory_items','emergency_contacts','camporee_documents','announcements','attendance_sessions','camporee_activities'
]);
let flushing = false;

export function queuedResponseIsComplete(method: string, status: number) {
  // A 409 can be a real database conflict, not an idempotent duplicate.
  return (status >= 200 && status < 300) || (method === 'DELETE' && status === 404);
}

function subjectFromAccessToken(header: string): string | null {
  // Used only to bind local queued writes to an account. The backend still
  // verifies JWT signatures and enforces RLS on every replay.
  if (!header.startsWith('Bearer ')) return null;
  try {
    const segment = header.slice(7).split('.')[1];
    if (!segment) return null;
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(segment.length / 4) * 4, '=')));
    return typeof payload.sub === 'string' && /^[0-9a-f-]{36}$/i.test(payload.sub) ? payload.sub : null;
  } catch { return null; }
}

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
  const count = await getOfflineQueueCount();
  window.dispatchEvent(new CustomEvent('camporee:queue-state', { detail: { count } }));
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

export async function getOfflineQueueCount(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  const db = await openDb();
  const count = await new Promise<number>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return count;
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

export async function flushOfflineWrites(authOverride?: string): Promise<{ remaining:number; failed:boolean }> {
  if (typeof window === 'undefined' || !navigator.onLine || flushing) return { remaining: await getOfflineQueueCount(), failed:false };
  const auth = authOverride ?? '';
  const ownerId = subjectFromAccessToken(auth);
  const context = parseTenantPath(window.location.pathname);
  // Never replay from a logout screen, another account, a legacy unscoped
  // route or an unidentified session.
  if (!ownerId || !context) return { remaining:await getOfflineQueueCount(), failed:false };
  flushing = true;
  let failed = false;
  try {
    const queued = await getQueued();
    for (const item of queued) {
      if (!item.ownerId || !item.organizationId || !item.camporeeId) {
        // Keep pre-migration queue items for explicit/manual recovery.
        failed = true;
        continue;
      }
      if (item.ownerId !== ownerId || item.organizationId !== context.organizationId ||
          item.camporeeId !== context.camporeeId) continue;
      const headers = new Headers(item.headers);
      headers.set('authorization', auth);
      try {
        const response = await fetch(item.url, { method:item.method, headers, body:item.body });
        if (queuedResponseIsComplete(item.method, response.status)) await deleteQueued(item.id);
        else { failed = true; break; }
      } catch { failed = true; break; }
    }
    const count = await getOfflineQueueCount();
    window.dispatchEvent(new CustomEvent('camporee:queue-state', { detail: { count } }));
    if (queued.length > 0 && count === 0) window.dispatchEvent(new CustomEvent('camporee:queue-flushed'));
    if (failed) window.dispatchEvent(new CustomEvent('camporee:sync-error', { detail: { count } }));
    return { remaining:count, failed };
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
  if (method === 'DELETE') return new Response(null, { status: 204, headers: { 'x-camporee-offline':'queued' } });
  const result = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload, ...(id ? { id } : {}) } : payload;
  const wantsObject = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
  return new Response(JSON.stringify(wantsObject || Array.isArray(result) ? result : [result]), { status: 200, headers: { 'content-type':'application/json', 'x-camporee-offline':'queued' } });
}

export async function camporeeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return fetch(input, init);
  let request = new Request(input, init);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const isSupabaseHost = url.hostname.endsWith('.supabase.co');
  // RPCs have function-specific return values and side effects; only table
  // mutations can use the optimistic row response and offline replay queue.
  const isRestMutation = isSupabaseHost && /^\/rest\/v1\/[^/]+$/.test(url.pathname) && ['POST','PATCH','DELETE'].includes(method);
  const auth = request.headers.get('authorization') || '';
  if (!isRestMutation) {
    if (navigator.onLine && subjectFromAccessToken(auth)) void flushOfflineWrites(auth);
    const response = await fetch(request);
    const isDataRequest = isSupabaseHost && (url.pathname.includes('/rest/v1/') || url.pathname.includes('/storage/v1/'));
    if (isDataRequest && !response.ok) window.dispatchEvent(new CustomEvent('camporee:request-error', { detail: { status:response.status } }));
    return response;
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
    if (!response.ok) window.dispatchEvent(new CustomEvent('camporee:request-error', { detail: { status:response.status } }));
    if (subjectFromAccessToken(auth)) void flushOfflineWrites(auth);
    return response;
  } catch (networkError) {
    const ownerId = subjectFromAccessToken(auth);
    const context = parseTenantPath(window.location.pathname);
    // Fail closed: never pretend an unscoped mutation succeeded offline.
    if (!ownerId || !context) throw networkError;
    const explicitScope = url.searchParams.get('camporee_id');
    if (explicitScope?.startsWith('eq.') && explicitScope.slice(3) !== context.camporeeId) throw networkError;
    const rows = Array.isArray(payload) ? payload : [payload];
    if (rows.some(row => row && typeof row === 'object' &&
        'camporee_id' in row && row.camporee_id !== context.camporeeId)) throw networkError;
    const safeHeaders = Array.from(request.headers.entries()).filter(([name]) => name.toLowerCase() !== 'authorization');
    const queued: QueuedRequest = {
      id:crypto.randomUUID(), ownerId, organizationId:context.organizationId,
      camporeeId:context.camporeeId, url:request.url, method, headers:safeHeaders, body, createdAt:Date.now(),
    };
    await putQueued(queued);
    return syntheticResponse(request, payload, method, optimisticId);
  }
}

// Replays are started by an authenticated Supabase request. Online events
// alone have no trusted identity and must not borrow a previous user's token.
