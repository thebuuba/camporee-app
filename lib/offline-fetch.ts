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
let queueJob: Promise<unknown> | null = null;

async function withQueueLock<T>(run: () => Promise<T>): Promise<T> {
  while (queueJob) { try { await queueJob; } catch { /* A failed predecessor releases the lock. */ } }
  const job = run();
  queueJob = job;
  try { return await job; }
  finally { if (queueJob === job) queueJob = null; }
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

function belongsToCurrentScope(item: QueuedRequest, auth: string) {
  const ownerId = subjectFromAccessToken(auth);
  const scope = typeof window === 'undefined' ? null : parseTenantPath(window.location.pathname);
  return Boolean(ownerId && scope && item.ownerId === ownerId &&
    item.organizationId === scope.organizationId && item.camporeeId === scope.camporeeId);
}

export type RecoverableWrite = Pick<QueuedRequest, 'id' | 'url' | 'method' | 'body' | 'createdAt'>;

export async function readScopedOfflineWrites(auth: string): Promise<RecoverableWrite[]> {
  return (await getQueued()).filter(item => belongsToCurrentScope(item, auth))
    .map(({ id, url, method, body, createdAt }) => ({ id, url, method, body, createdAt }));
}

export async function discardScopedOfflineWrite(id: string, auth: string, current = () => true) {
  return withQueueLock(async () => {
    const item = (await getQueued()).find(row => row.id === id);
    if (!current()) return;
    if (!item || !belongsToCurrentScope(item, auth)) throw new Error('El cambio no pertenece a esta cuenta y camporee.');
    await deleteQueued(id);
    window.dispatchEvent(new CustomEvent('camporee:queue-state', { detail: { count: await getOfflineQueueCount() } }));
  });
}

async function insertAlreadyStored(item: QueuedRequest, headers: Headers): Promise<boolean> {
  if (item.method !== 'POST' || !item.body || !item.camporeeId) return false;
  try {
    const payload = JSON.parse(item.body);
    const url = new URL(item.url);
    const table = tableFromUrl(url);
    if (!REST_TABLES_WITH_UUID_ID.has(table) || table === 'camporees' || !payload || Array.isArray(payload) ||
        typeof payload.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.id) ||
        !Object.keys(payload).every(key => /^[a-z_][a-z0-9_]*$/.test(key))) return false;
    url.search = '';
    url.searchParams.set('id', `eq.${payload.id}`);
    url.searchParams.set('camporee_id', `eq.${item.camporeeId}`);
    url.searchParams.set('select', [...new Set([...Object.keys(payload), 'camporee_id'])].join(','));
    headers = new Headers(headers);
    headers.set('accept', 'application/json');
    const response = await fetch(url.href, { method: 'GET', headers });
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0].camporee_id === item.camporeeId &&
      Object.entries(payload).every(([key, value]) => {
        const stored = rows[0][key];
        if (JSON.stringify(stored) === JSON.stringify(value)) return true;
        const timestamps = ['due_at', 'starts_at', 'ends_at', 'occurred_at', 'updated_at', 'created_at', 'published_at'];
        const zoned = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i;
        return timestamps.includes(key) && typeof stored === 'string' && typeof value === 'string' &&
          zoned.test(stored) && zoned.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(stored) === Date.parse(value);
      });
  } catch { return false; }
}

export async function flushOfflineWrites(authOverride?: string): Promise<{ remaining:number; failed:boolean }> {
  return withQueueLock(() => flushScopedWrites(authOverride));
}

async function replayConfirmed(response: Response, item: QueuedRequest) {
  if (!response.ok) return false;
  try {
    const data = await response.json();
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (!rows.length || rows.some(row => !row || typeof row !== 'object')) return false;
    const id = extractEqId(new URL(item.url));
    if (id) return rows.length === 1 && rows[0].id === id;
    const payload = item.body ? JSON.parse(item.body) : null;
    const expected = Array.isArray(payload) ? payload : payload ? [payload] : [];
    if (expected.length && expected.length !== rows.length) return false;
    return expected.every(entry => {
      if (entry.id) return rows.some(row => row.id === entry.id);
      // Attendance uses a composite key rather than a client generated id.
      if (entry.session_id && entry.participant_id) return rows.some(row =>
        row.session_id === entry.session_id && row.participant_id === entry.participant_id);
      return true;
    });
  } catch { return false; }
}

async function flushScopedWrites(authOverride?: string): Promise<{ remaining:number; failed:boolean }> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || !navigator.onLine) return { remaining: await getOfflineQueueCount(), failed:false };
  const auth = authOverride ?? '';
  const ownerId = subjectFromAccessToken(auth);
  const context = parseTenantPath(window.location.pathname);
  // Never replay from a logout screen, another account, a legacy unscoped
  // route or an unidentified session.
  if (!ownerId || !context) return { remaining:await getOfflineQueueCount(), failed:false };
  let failed = false;
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
    const preferences = (headers.get('prefer') ?? '').split(',').filter(value => value && !value.trim().startsWith('return='));
    headers.set('prefer', [...preferences, 'return=representation'].join(','));
    try {
      const replayUrl = new URL(item.url);
      // Replay validates identities independently of the original UI projection.
      // In particular attendance needs both parts of its composite key.
      replayUrl.searchParams.set('select', '*');
      const response = await fetch(replayUrl.href, { method:item.method, headers, body:item.body });
      if (await replayConfirmed(response, item) ||
          (response.status === 409 && await insertAlreadyStored(item, headers))) await deleteQueued(item.id);
      else { failed = true; break; }
    } catch { failed = true; break; }
  }
  const count = await getOfflineQueueCount();
  window.dispatchEvent(new CustomEvent('camporee:queue-state', { detail: { count } }));
  if (queued.length > 0 && count === 0) window.dispatchEvent(new CustomEvent('camporee:queue-flushed'));
  if (failed) window.dispatchEvent(new CustomEvent('camporee:sync-error', { detail: { count } }));
  return { remaining:count, failed };
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
  if (method === 'DELETE' && !request.headers.get('prefer')?.includes('return=representation')) {
    return new Response(null, { status: 202, headers: { 'x-camporee-offline':'queued' } });
  }
  if (method === 'DELETE') payload = id ? { id } : null;
  const result = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload, ...(id ? { id } : {}) } : payload;
  const wantsObject = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
  return new Response(JSON.stringify(wantsObject ? result : Array.isArray(result) ? result : [result]), { status: 202, headers: { 'content-type':'application/json', 'x-camporee-offline':'queued' } });
}

export async function camporeeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return fetch(input, init);
  let request = new Request(input, init);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const isSupabaseHost = url.hostname.endsWith('.supabase.co');
  // RPC return values cannot use the optimistic table-row response.
  const isRestMutation = isSupabaseHost && /^\/rest\/v1\/[^/]+$/.test(url.pathname) && ['POST','PATCH','DELETE'].includes(method);
  const auth = request.headers.get('authorization') || '';
  const ownerId = subjectFromAccessToken(auth);
  const context = parseTenantPath(window.location.pathname);
  if (!isRestMutation) {
    if (navigator.onLine && subjectFromAccessToken(auth)) void flushOfflineWrites(auth).catch(() => window.dispatchEvent(new CustomEvent('camporee:sync-error')));
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
    if (ownerId && context && typeof indexedDB !== 'undefined') {
      // Finish older writes before sending a newer edit. A failed replay stays
      // ahead of this request instead of overwriting it after reconnection.
      const belongsToRequest = (item:QueuedRequest) => item.ownerId === ownerId && item.organizationId === context.organizationId && item.camporeeId === context.camporeeId;
      const queued = await getQueued().catch(error => {
        // A browser that disables local storage must still allow online saves.
        if ((error as {name?:string})?.name === 'SecurityError') return [];
        throw error;
      });
      if (queued.some(belongsToRequest)) {
        await flushOfflineWrites(auth);
        if ((await getQueued()).some(belongsToRequest)) throw new TypeError('Pending changes must synchronize first');
      }
    }
    const response = await fetch(request);
    if (!response.ok) window.dispatchEvent(new CustomEvent('camporee:request-error', { detail: { status:response.status } }));
    if (subjectFromAccessToken(auth)) void flushOfflineWrites(auth).catch(() => window.dispatchEvent(new CustomEvent('camporee:sync-error')));
    return response;
  } catch (networkError) {
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
