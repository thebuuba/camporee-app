# Auditoría: migración de solo MP3 del cancionero a Cloudflare R2

Fecha: 2026-10-17
Rama: `feature/cloudflare-r2-music` (creada desde `origin/main`, HEAD `150bdb6`)
Alcance: **solo auditoría**. No se implementaron cambios de producto, migraciones remotas ni despliegues. Este documento describe el estado real del módulo de canciones y lo que implica mover únicamente los MP3 a un bucket R2 independiente, manteniendo Supabase como base de datos.

> Nota sobre alcance del encargo: se pidió revisar "favoritos, listas y portadas". Tras leer todo el módulo, **no existen** favoritos, listas de usuario ni portadas en canciones. Se documenta esa ausencia de forma explícita más abajo en lugar de inventar estructuras.

---

## 1. Inventario de archivos del módulo

| Rol | Ruta real | Notas |
|---|---|---|
| Ruta/página del cancionero (Server Component) | `app/more/songs/page.tsx` | `requireCamporeeContext`, `canEdit('settings')`, consulta `camporee_documents`. |
| Gestor/UI (Client Component) | `app/more/songs/songs-manager.tsx` | Alta, edición, subida, borrado, detalle, descarga. |
| Reproductor global (Context Provider) | `app/components/music-player.tsx` | Montado en el layout; resuelve URLs y controla `<audio>`. |
| Burbuja flotante | `app/components/floating-music-bubble.tsx` | Posición arrastrable en `localStorage`. |
| Modelo/lógica de canciones | `lib/songs.ts` | Categorías, `songsFromDocuments`, `songPayload`, validaciones. |
| Descargas offline | `lib/song-downloads.ts` | IndexedDB `camporee-music`. |
| Posición de la burbuja | `lib/music-bubble-position.ts` | Sin relación con almacenamiento. |
| Estilos | `app/music-player.css`, `app/floating-music-bubble.css` | — |
| MP3 públicos de inicio | `public/audio/contracorriente.mp3` (9.3 MB), `public/audio/maranata.mp3` (10.3 MB) | Empaquetados como assets del Worker. |
| Service worker | `public/sw.js` | Cachea `/audio/*.mp3` same-origin con soporte de `Range`. |
| Montaje global | `app/layout.tsx:40,73` | `<MusicPlayer>{children}</MusicPlayer>`. |
| Entrada de menú | `app/more/page.tsx:10` | Tarjeta "Canciones del club" → `/more/songs`. |
| Enrutador de panel multi-tenant | `app/o/[organizationId]/c/[camporeeId]/[[...panel]]/page.tsx:24,31` | Mapea `more/songs` → `SongsPage`. |

Rutas efectivas:
- Ruta amigable/legacy: `/more/songs` (resuelve a `redirectLegacyPanel` si no hay ids).
- Ruta con tenant real: `/o/<organizationId>/c/<camporeeId>/more/songs`.

---

## 2. Esquema de datos real (Supabase Postgres)

Las canciones **no tienen tabla propia**. Reutilizan `public.camporee_documents`.

Tabla `public.camporee_documents` (migración `supabase/migrations/20260907183629_add_emergency_and_document_panels.sql:12-22`):

| Columna | Tipo | Uso para canciones |
|---|---|---|
| `id` | uuid PK `gen_random_uuid()` | Id de la canción. |
| `camporee_id` | uuid not null → `public.camporees(id)` on delete cascade | Ámbito tenant. |
| `title` | text not null | Nombre de la canción. |
| `document_type` | text | `song:<category>` con `category ∈ {hymns, camporee, club}`. |
| `file_path` | text | Clave del objeto en Storage (MP3). |
| `external_url` | text | URL `https:` de audio, o `null` si hay archivo. |
| `notes` | text | JSON `{"lyrics": "...", "chords": "..."}`. |
| `created_by` | uuid not null → `auth.users(id)` on delete cascade | Autor. |
| `created_at` | timestamptz not null default now() | Orden. |

Restricción clave (migración `20261011100000_organization_tenancy.sql:108-109`):

```sql
alter table public.camporee_documents add constraint documents_scoped_file_path
 check(file_path is null or file_path like camporee_id::text||'/%');
```

Consecuencia: **cualquier `file_path` debe empezar por `<camporee_id>/`**, independientemente de dónde se guarde el archivo. La ruta que hoy genera el módulo cumple esto: `app/more/songs/songs-manager.tsx:54` usa `${camporeeId}/songs/${crypto.randomUUID()}.${extension}`.

Índice: `camporee_documents_camporee_idx (camporee_id, created_at desc)`.

### Decodificación de canciones (`lib/songs.ts`)
- Filtro: `document_type` que empiece por `song:` (`lib/songs.ts:12`).
- Categoría: `document_type.slice(5)`; si no es válida se asume `club` (`lib/songs.ts:13,20`).
- `notes`: se intenta `JSON.parse`; si es texto plano antiguo se usa como letra (`lib/songs.ts:14-19`).
- `audioUrl`: `safeAudioUrl(external_url ?? '')` (`lib/songs.ts:20`).
- `safeAudioUrl` (`lib/songs.ts:5-8`) acepta **solo** `/audio/<slug>.mp3` o `https:`; cualquier otra cosa (incluido `//host`, `data:`, `javascript:`) devuelve `''`.
- Canciones de inicio (semilla, no persistidas): `maranata`, `contracorriente`, `conquistadores`, `guias-mayores`, `mejor-aventura` (`lib/songs.ts:22-28`). Se fusionan evitando duplicados por categoría+título normalizado.

### Codificación al guardar (`songPayload`, `lib/songs.ts:35-43`)
- `document_type = song:<category>`, `notes = JSON({lyrics, chords})`, `external_url = audio ? safeAudioUrl(audio) : null`.
- Valida título no vacío, categoría válida y que el enlace sea `https://`.

### Validación de archivo (`audioFileType`, `lib/songs.ts:48-54`)
- Extensiones/MIME: `mp3, m4a, ogg, wav, aac, opus, flac` (mapa a `audio/*`).
- Requiere `file.size > 0` y `≤ 15 MB` (`15 * 1024 * 1024`).
- Rechaza MIME no-audio salvo `application/octet-stream`.

---

## 3. Storage y permisos reales

### Bucket actual
- Bucket privado `camporee-files`: creado con `public=false` en `supabase/migrations/20260907165552_initial_camporee_schema.sql:110`.
- Bucket separado `profile-avatars` (avatares; no forma parte del cancionero).

### Políticas vigentes del bucket `camporee-files`
Definidas en `supabase/migrations/20261011100000_organization_tenancy.sql:246-254` (las políticas anteriores fueron eliminadas en las líneas 239-244):

| Política | Operación | Condición exacta |
|---|---|---|
| `camporee_files_read` | SELECT | `bucket_id='camporee-files' and private.is_camporee_member(private.path_camporee(name))` |
| `camporee_files_insert` | INSERT | `bucket_id='camporee-files' and private.can_edit_camporee(private.path_camporee(name),'settings')` |
| `camporee_files_update` | UPDATE | igual que insert (using + with check) |
| `camporee_files_delete` | DELETE | `... and private.can_edit_camporee(private.path_camporee(name),'settings')` |

Definiciones de apoyo (`20261011100000_organization_tenancy.sql`):
- `private.path_camporee(path)` (línea 136-139): toma el **primer segmento** de la ruta y, si es UUID, lo devuelve. Por eso la clave debe empezar por `<camporeeId>/`.
- `private.is_camporee_member(camporee)` (119-122): existe miembro activo en la organización del camporee.
- `private.can_edit_camporee(camporee, module)` (123-128): `status<>'archived'` y (`role in ('admin','editor')` o `permissions->module='true'` o `permissions->'edit'='true'`).

### Políticas de la tabla `camporee_documents`
Generadas en `20261011100000_organization_tenancy.sql:221-225` para el módulo **`settings`**:
- `tenant_read`: `private.is_camporee_member(camporee_id)`.
- `tenant_insert`: `private.can_edit_camporee(camporee_id,'settings') AND created_by=(select auth.uid())`.
- `tenant_update`: `private.can_edit_camporee(camporee_id,'settings')` (using + with check).
- `tenant_delete`: `private.can_edit_camporee(camporee_id,'settings')`.

### Permiso de aplicación equivalente
En el servidor: `context.canEdit('settings')` (`app/more/songs/page.tsx:10`, lógica en `lib/tenant-context.ts:77`). Mismos criterios que `can_edit_camporee` (rol admin/editor, `permissions.settings`, `permissions.edit`, o `permissions.edit`; camporee no archivado).

**Resumen de autorización para MP3**: leer = ser miembro del camporee; escribir/borrar = permiso del módulo `settings` (admin/editor o `settings`/`edit`). Esto hoy lo aplica **RLS de Supabase Storage**, no el código de la app.

---

## 4. Flujos reales

### 4.1 Carga del cancionero
1. `SongsPage` (server) → `requireCamporeeContext` → `camporee_documents` con `document_type like 'song:%'`, seleccionando `id,title,document_type,notes,external_url,file_path` (`app/more/songs/page.tsx:11`).
2. `songsFromDocuments(documents)` → lista de `Song`.
3. `SongsManager` recibe `initialSongs`, `camporeeId`, `userId`, `canEdit`.
4. `SongsManager` llama `player.setSongs(songs, `${userId}:${camporeeId}`)` (`app/more/songs/songs-manager.tsx:27`). El `scope` aísla descargas por usuario+camporee.

Tipo `Song` (`lib/songs.ts:2`): `{ id, title, category, lyrics, chords, audioUrl, filePath?, stored }`.

### 4.2 Subida (alta)
`save(fields)` en `app/more/songs/songs-manager.tsx:41-76`:
1. Si hay `audio_file`: sube a `camporee-files` en `path = ${camporeeId}/songs/${randomUUID()}.${ext}` con `upsert:false` (líneas 51-58). Se guarda `uploadedPath`.
2. Construye `document` con `file_path` y hace `insert` en `camporee_documents` con `camporee_id` y `created_by` (línea 60).
3. Si el insert falla, **borra el archivo recién subido** para no dejar huérfanos (línea 72).
4. Canciones de inicio (`stored:false`) se "completan" con un insert normal.

### 4.3 Edición
Misma función `save`:
- Si no se elige archivo nuevo y el `external_url` no cambió, conserva `editing.filePath` (línea 50).
- Con archivo nuevo, sube el nuevo y actualiza el documento; si había `editing.filePath` distinto y empieza por `${camporeeId}/songs/`, **detiene el reproductor si suena esa canción** y borra el archivo anterior (líneas 64-67).
- `update(...).eq('id', editing.id).eq('camporee_id', camporeeId)` (línea 60). El `stored` determina insert vs update.

### 4.4 Borrado
**No existe borrado de canciones en la UI del cancionero.** `songs-manager.tsx` no expone eliminar. Solo hay borrado de archivo en edición/reemplazo y limpieza de huérfanos. (El borrado de documentos existe en `app/more/documents/document-manager.tsx:55-63`, pero filtra `document_type` que NO empieza por `song:`.)

### 4.5 Reproducción
`app/components/music-player.tsx`:
- `sourceUrl(song)` (líneas 14-19): si `song.filePath` → `createClient().storage.from('camporee-files').createSignedUrl(song.filePath, 3600)`; si no, `safeAudioUrl(song.audioUrl)`.
- `prepareSong` (52-58): pre-firma y cachea en memoria `signedSources` con caducidad `Date.now() + 3_500_000` (~58 min) para iniciar reproducción dentro del toque.
- `playSong` (60-76): prioriza Blob descargado (`URL.createObjectURL(record.blob)`), luego signed URL cacheada/firmada, luego `audioUrl` directa.
- `MediaSession` para controles del sistema (100-107). Salta pistas con `skip` sobre `playlist = songs + downloads` (línea 98).

### 4.6 Descargas offline
- `downloadSong` (77-93): `fetch(await sourceUrl(song))` → `blob` → `saveDownloadedSong(scope, song, blob)`.
- `lib/song-downloads.ts`: IndexedDB `camporee-music` v1, store `tracks` (keyPath `key`).
  - `songSourceKey(song) = song.filePath || song.audioUrl` (`lib/song-downloads.ts:5`).
  - `key = `${scope}:${songSourceKey}``; `scope = ${userId}:${camporeeId}` (`lib/song-downloads.ts:52`).
  - Operaciones: `listDownloadedSongs`, `saveDownloadedSong`, `removeDownloadedSong`.
- Al cambiar de `scope` (cuenta/camporee) el reproductor detiene y vacía descargas (`music-player.tsx:40-46`).

### 4.7 Offline / Service Worker
- `public/sw.js:76-98`: intercepta **solo** `pathname.startsWith('/audio/') && endsWith('.mp3')` **same-origin** (`url.origin!==location.origin` → return, línea 72). Descarga el archivo completo y sirve `Range` (206) desde caché.
- Las canciones subidas (signed URLs de Supabase) son **cross-origin**: no pasan por esa rama del SW. Su reproducción offline depende exclusivamente de las descargas en IndexedDB.
- `lib/offline-fetch.ts`: la cola offline solo encola mutaciones REST de Supabase (`/rest/v1/`, POST/PATCH/DELETE, líneas 158-208). **No encola subidas a Storage** (la ruta `/storage/v1/` no entra en `isRestMutation`). Con R2 esto no cambia.
- `withSupabaseRetry` (`lib/supabase/retry-fetch.ts`) solo reintenta GET/HEAD ante 504/544; no aplica a subidas.

### 4.8 Burbuja flotante
`app/components/floating-music-bubble.tsx` posiciona la burbuja y persiste en `localStorage` (`camporee:music-bubble-position`). Sin interacción con almacenamiento de audio.

### 4.9 Favoritos, listas y portadas
- **Favoritos**: no existen (ninguna tabla, columna ni UI).
- **Listas de reproducción**: no existen entidades; `playlist` es un cálculo en memoria (`music-player.tsx:98`). Las "categorías" son filtros (`lib/songs.ts:1`).
- **Portadas/imágenes de canción**: no existen columnas ni UI; no se muestran carátulas.

---

## 5. Configuración Cloudflare / entorno / bindings

- `wrangler.jsonc`: `name: camporee-app`, `main: .open-next/worker.js`, `compatibility_date: 2026-09-07`, `compatibility_flags: ["nodejs_compat"]`, binding `ASSETS` (`.open-next/assets`), observabilidad activada. **No hay bindings R2, KV, D1 ni secrets declarados.**
- `open-next.config.ts`: `defineCloudflareConfig()` por defecto, sin overrides.
- `next.config.ts`: vacío.
- `package.json`: deploy vía `opennextjs-cloudflare build && ... deploy`; `cf-typegen` genera `cloudflare-env.d.ts` (que **no existe** en el repo).
- Variables de entorno conocidas (`lib/supabase/*.ts`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Opcional `NEXT_PUBLIC_SITE_URL` (login/usuarios/created).
- `.env.example`: solo las dos variables públicas de Supabase. `.gitignore` excluye `.env`, `.env.local`, `.env.*.local`, `.wrangler`.
- No hay dependencias de AWS SDK ni `aws4fetch` en `package.json`.

No se imprimió ningún secreto.

---

## 6. Pruebas y scripts existentes

Pruebas (`npm test` → `node --experimental-strip-types --test tests/*.test.mjs`):
- `tests/songs.test.mjs`: convierte documentos, valida payloads, **afirma `supabase.storage.from('camporee-files')`**, exige ruta `/^event\/songs\/.+\.mp3$/`, limpieza de huérfanos, y que `canEdit:false` no escriba.
- `tests/music-player.test.mjs`: mockea `supabase.storage.from(...).createSignedUrl`; verifica firma única en `prepareSong`, reproducción desde Blob, invalidación al quitar el reproductor y vaciado al cambiar de cuenta. **Depende del nombre de bucket y de `createSignedUrl`.**
- `tests/song-downloads.test.mjs`: contrato de IndexedDB (`camporee-music`, versión 1, store `tracks`), aislamiento por scope (usuario+camporee), cuota/abortos.
- `tests/pwa-cache.test.mjs`: cacheo y `Range` de `/audio/*.mp3`, pantalla `/offline` para páginas privadas.
- `tests/offline-startup.test.mjs`: guardado del snapshot HTML de `/more/songs`.
- `tests/music-bubble-position.test.mjs`: geometría de la burbuja.

Scripts:
- `npm run check` → `tsc --noEmit`.
- `npm run build` → `next build`.
- `npm run test:db` → `scripts/test-database.mjs` (Docker `supabase/postgres:15.8.1.085`; aplica migraciones y `supabase/tests/*.sql`). Nada de R2.
- CI `.github/workflows/ci.yml`: `npm test`, `npm run check`, `npm run build` y validación de migraciones/RLS.

---

## 7. Riesgos de compatibilidad de la migración (solo MP3 → R2)

1. **Autorización sale de RLS.** R2 no tiene RLS. Hoy Storage aplica `is_camporee_member` (lectura) y `can_edit_camporee(...,'settings')` (escritura/borrado). Al mover a R2 esa lógica debe reimplementarse en el servidor (route handlers / server actions usando `requireCamporeeContext` + `canEdit('settings')`). Cualquier URL pública o prefirmada que se entregue al cliente **debe** respetar el ámbito `camporeeId`.
2. **Restricción de DB `documents_scoped_file_path`.** El `file_path` guardado debe empezar por `<camporee_id>/`. Si la clave R2 usa otro prefijo (p. ej. `songs/...` sin el uuid), el `insert/update` en `camporee_documents` fallará (`23514`).
3. **Acoplamiento de nombres y APIs en cliente.** `createSignedUrl('camporee-files', ...)` está fijo en `music-player.tsx:16`, y la subida/borrado en `songs-manager.tsx:55,66,72`. Los tests lo afirman explícitamente; deben actualizarse.
4. **Service worker same-origin.** `sw.js` solo cachea `/audio/*.mp3` same-origin. Un bucket servido desde otro dominio (r2.dev/custom) **no** será cacheado por el SW; el offline seguiría dependiendo de IndexedDB. Para conservar el pipeline de cacheo+`Range`, se necesitaría un proxy same-origin (nueva ruta p. ej. `/media/...`) y actualizar el SW (hoy el filtro es estricto: prefijo `/audio/` y sufijo `.mp3`).
5. **Soporte de `Range`/CORS/Content-Type.** El elemento `<audio>` y las descargas requieren `Range` y `Content-Type` correctos. R2 lo soporta; un proxy en Worker debe implementarlo manualmente. Un dominio distinto requiere configurar CORS.
6. **Continuidad de descargas existentes.** `songSourceKey = filePath || audioUrl` es la clave estable en IndexedDB. Si se cambia `filePath` (o se reescribe), las descargas locales ya guardadas quedarán huérfanas. Mantener la misma clave `${camporeeId}/songs/...` evita migración local.
7. **Edición/reemplazo.** La comprobación de borrado exige que `editing.filePath.startsWith(`${camporeeId}/songs/`)` (`songs-manager.tsx:64`). Si se adopta otro prefijo para R2, esta limpieza deja de ejecutarse y se acumulan objetos.
8. **MP3 públicos y `safeAudioUrl`.** Los dos MP3 de inicio viven en `public/audio/` (≈19.6 MB empaquetados en el Worker) y `safeAudioUrl` solo acepta exactamente `/audio/<slug>.mp3`. Moverlos a R2 obliga a cambiar el regex, la semilla `songs.ts:23-24` y el rango del SW.
9. **Cobertura offline de subidas.** La cola offline (`offline-fetch.ts`) no cubre Storage hoy; tampoco cubriría R2 salvo que se integre explícitamente. No es una regresión, pero conviene decidirlo.
10. **Bucket compartido con documentos.** `camporee_documents` mezcla canciones (`song:%`) y documentos. Si solo los MP3 migran, debe distinguirse por `document_type`/`file_path` y no romper `documents`. Ningún documento actual apunta a rutas `songs/`.
11. **Secretos.** Si se usa la API S3 de R2, las claves deben ser secrets del Worker (nunca `NEXT_PUBLIC_*`). El binding nativo evita credenciales.
12. **Caché de URLs firmadas.** El reproductor cachea la URL ~58 min (`music-player.tsx:57`) mientras la firma dura 1 h (línea 16). Las URLs prefirmadas de R2 deben respetar una ventana equivalente o menor.

---

## 8. Recomendación: binding R2 nativo vs API S3

Ambas opciones permiten conservar **Supabase como base de datos** y solo mover los bytes de MP3. Diferencia principal: cómo se autoriza y cómo viaja el archivo.

### Opción A — Binding nativo de R2 (`r2_buckets` en `wrangler.jsonc`)
- Acceso **solo desde el servidor** (route handlers / server actions) vía `getCloudflareContext()` de `@opennextjs/cloudflare`.
- **Sin credenciales** en código ni en el cliente.
- Permite un proxy same-origin que: valida permisos con el contexto tenant, soporta `Range` y fija `Content-Type`, y conserva el cacheo del service worker.
- Contras: todo el tráfico pasa por el Worker (CPU/duración), hay que implementar `Range` y no se puede usar desde componentes cliente directamente.

### Opción B — API compatible S3 con URLs prefirmadas
- Más parecida al patrón actual `createSignedUrl`: el cliente sube/descarga directo contra R2.
- Contras: requiere claves S3 como **secrets**, configurar CORS en el bucket/dominio, y las URLs prefirmadas son cross-origin (el SW no las cachea; el offline sigue dependiendo de IndexedDB).

### Recomendación
**Usar el binding nativo de R2 (Opción A) como mecanismo principal**, exponiéndolo mediante route handlers same-origin que apliquen `is_camporee_member` (lectura) y `can_edit_camporee(camporee,'settings')` (escritura/borrado) y sirvan el audio con soporte de `Range`. Motivos:
- La app ya corre como Worker de Cloudflare vía OpenNext (`nodejs_compat`), sin credenciales adicionales.
- Mantiene autorización server-side, reemplazando limpiamente las políticas RLS de Storage que hoy protegen el bucket.
- Conservar el audio **same-origin** permite seguir usando el pipeline del service worker (cacheo + `Range`) y no altera `songSourceKey` ni las descargas IndexedDB.

Considerar la **Opción B solo si** se busca descargar tráfico del Worker con subidas/descargas directas a R2; en ese caso, añadir CORS, secrets y asumir que el cacheo offline por SW no aplicará a los objetos de R2.

En ambos casos, mantener el prefijo de clave `${camporeeId}/songs/...` para respetar `documents_scoped_file_path` y la continuidad de descargas, y actualizar `music-player.tsx`, `songs-manager.tsx`, `sw.js` (si se sirve same-origin bajo un prefijo nuevo) y los tests de `bucket`/`createSignedUrl`.

---

## 9. Incógnitas / decisiones pendientes (no asumidas)

- Nombre del bucket R2, dominio y prefijo de clave (propuesta coherente: `<camporeeId>/songs/...`).
- Si los dos MP3 públicos (`public/audio/*.mp3`) también migran o permanecen empaquetados.
- Si se desea subida directa a R2 (S3) o mediada por el Worker (binding).
- TTL de URLs y política de caché del service worker para el nuevo origen/prefijo.
- Si hace falta borrado de canciones en la UI (hoy no existe) y su manejo de objetos R2.

---

## 10. Resumen

- Las canciones viven en `public.camporee_documents` (`document_type='song:<cat>'`, `notes` JSON, `external_url` o `file_path`), no en una tabla propia.
- Los MP3 subidos están en el bucket privado Supabase `camporee-files`, clave `${camporeeId}/songs/<uuid>.<ext>`, protegido por RLS: leer = miembro del camporee; escribir/borrar = permiso del módulo `settings`.
- La reproducción usa `createSignedUrl(filePath, 3600)`; las descargas offline van a IndexedDB `camporee-music` con clave `${userId}:${camporeeId}:${filePath||audioUrl}`.
- El service worker solo cachea `/audio/*.mp3` same-origin con `Range`; no toca signed URLs cross-origin.
- Cloudflare hoy solo tiene el binding `ASSETS`; no hay R2 ni secrets, ni `cloudflare-env.d.ts`.
- **No existen** favoritos, listas de usuario ni portadas en canciones.
- Recomendación: **binding nativo R2** con proxy same-origin y autorización server-side, conservando el prefijo de clave y actualizando reproductor, gestor, SW y tests.

No se realizaron cambios de producto, migraciones remotas ni despliegues. Sin commits.

## Decisiones posteriores a esta auditoría

La implementación elegida usa `notes.audio` para la referencia R2, sin reutilizar `file_path` para otro proveedor. Así se conserva la restricción SQL y la identidad de las descargas anteriores. Las nuevas claves R2 tienen prefijo `camporee-app/<camporeeId>/songs/`; los originales Supabase mantienen su ruta anterior. El audio privado por API no se agrega a la caché global del service worker: el mecanismo privado de descargas continúa siendo IndexedDB. La auditoría anterior documenta el estado previo, no instrucciones para modificar otros módulos.
