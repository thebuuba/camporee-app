# MP3 de Camporee App en Cloudflare R2

## Estado y arquitectura

La rama `feature/cloudflare-r2-music` parte de `origin/main` (`150bdb6`). La auditoría previa está en [r2-music-audit.md](r2-music-audit.md), y las decisiones de implementación en [r2-music-plan.md](r2-music-plan.md). Los cambios locales anteriores de presupuesto y tareas permanecen en el checkout original y no forman parte de esta rama.

El módulo existente usa `camporee_documents` con `document_type = song:<categoría>`. `notes` contiene letras y acordes; `file_path` apunta al bucket privado Supabase `camporee-files` y `external_url` permite enlaces. Hay dos MP3 empaquetados en `public/audio`. El reproductor tiene reproducción/pausa, anterior/siguiente, progreso, Media Session y descargas IndexedDB aisladas por usuario y camporee. No existen favoritos, portadas ni listas personalizadas; se conserva la cola actual.

Se elige el **binding nativo `MUSIC_BUCKET`**, compatible con el despliegue OpenNext existente. El Worker autentica la sesión Supabase y la pertenencia al camporee antes de acceder a R2. R2 permanece privado. La misma ruta HTTP de la app transmite el cuerpo R2 como stream y admite Range y respuestas parciales; no pasa audio por Supabase, no agrega un servidor ni expone credenciales. Las descargas siguen guardándose en IndexedDB; no se cachea audio privado globalmente en el service worker.

## Cloudflare y aislamiento

Con autorización del usuario se creó el bucket **`camporee-app-music`**, clase Standard, en la cuenta **`fbfe781a453c090425c8bfe52d9e96a6`**. Se verificó que el acceso público está desactivado. No se modificó ningún otro bucket.

`wrangler.jsonc` fija esa cuenta y declara el binding `MUSIC_BUCKET`. Las claves de objetos se limitan a `camporee-app/<camporee UUID>/songs/<identificador>.mp3`. El navegador no puede escoger el bucket ni un objeto arbitrario. Los permisos de edición continúan siendo los del módulo `settings`; los miembros activos pueden leer. Los camporees archivados no permiten escrituras.

La sesión actual de Wrangler pertenece a otra cuenta de Cloudflare. No se sobrescribió ni se cambió su autenticación. Para desplegar o migrar, usar una sesión/perfil autorizado para la cuenta de Camporee, o un `CLOUDFLARE_API_TOKEN` limitado a esa cuenta y bucket, dentro del proceso de administración. No pegar tokens en el chat ni guardarlos en Git.

## Supabase y variables

No se crean tablas, columnas ni políticas. Se amplía el JSON `notes` de las canciones con `audio: {provider:'r2',key,size,contentType:'audio/mpeg',sha256}`. La migración SQL `20261017234228_compare_and_update_song_document.sql` añade una función RPC `SECURITY INVOKER`, sin ampliar RLS, para comparar y actualizar canciones mediante el cuerpo de la petición; evita incluir letras largas en la URL. **Aplicar esta migración antes del despliegue y antes de migrar archivos.** No se ha aplicado a producción. Las letras, acordes, IDs, relaciones y fuentes anteriores se conservan durante la migración.

Para ejecutar la app siguen siendo necesarias `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. R2 usa el binding, **sin claves S3 ni variables R2 públicas**. `next dev` usa almacenamiento R2 local aislado mediante OpenNext; no usa el bucket remoto automáticamente.

Solo para la herramienta de migración se usan las variables documentadas en `.env.example`: `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `MUSIC_R2_BUCKET` y, si no se usa OAuth autorizado de Wrangler, `CLOUDFLARE_API_TOKEN`. Las claves de servicio nunca se importan al bundle cliente. `.env.local`, `.dev.vars*`, `.wrangler` y manifiestos de migración están excluidos de Git.

## Archivos de la entrega

| Área | Archivos |
|---|---|
| Configuración | `wrangler.jsonc`, `next.config.ts`, `.env.example`, `.gitignore` |
| Modelo y fuentes | `lib/songs.ts`, `lib/song-audio.ts`, `lib/song-downloads.ts` |
| Servidor y mantenimiento | `lib/song-api.ts`, `lib/r2-music.ts`, `lib/r2-cleanup.ts` |
| Rutas nuevas | `app/api/music/[camporeeId]/route.ts`, `app/api/music/[camporeeId]/[songId]/route.ts`, `app/api/music/[camporeeId]/cleanup/route.ts` |
| UI y reproductor | `app/more/songs/page.tsx`, `app/more/songs/songs-manager.tsx`, `app/components/music-player.tsx`, `app/music-player.css` |
| Migración | `scripts/migrate-song-audio.mjs`, `scripts/song-audio-migration.mjs`, `supabase/migrations/20261017234228_compare_and_update_song_document.sql` |
| Pruebas | `tests/r2-music.test.mjs`, `tests/r2-cleanup.test.mjs`, `tests/song-api.test.mjs`, `tests/song-audio-migration.test.mjs`, `tests/songs.test.mjs`, `tests/music-player.test.mjs`, `tests/song-downloads.test.mjs`, `supabase/tests/multi-tenant.sql` |
| Documentación | `docs/r2-music-audit.md`, `docs/r2-music-plan.md`, `docs/r2-music-migration.md`, este informe |

## Migración y reversión

La herramienta y sus comandos se describen en [r2-music-migration.md](r2-music-migration.md). Se comienza en dry-run. La migración verifica los bytes en destino, guarda un manifiesto y actualiza únicamente canciones que sigan coincidiendo con la versión auditada. La reversión restaura referencias sin borrar objetos originales. Las canciones migradas y las no migradas pueden convivir.

Para reconciliar también objetos de subidas fallidas o reemplazos hechos por la app, existe `POST /api/music/<camporeeId>/cleanup?organization_id=<organizationId>`. Requiere sesión, permiso `settings` y `Origin` del mismo sitio. Por defecto solo devuelve candidatos; `&apply=true` solicita la eliminación. Examina una página de hasta 100 objetos, devuelve cursor para continuar y excluye objetos de menos de 48 horas. Vuelve a consultar todas las referencias antes de cada borrado y se detiene si falla la base de datos. No ejecutar dos procesos de administración/migración sobre el mismo camporee simultáneamente; Supabase y R2 no comparten una transacción.

No se borran MP3 de Supabase ni de `public/audio`; su eliminación exige una autorización posterior expresa. No se ejecutó una migración real con una sesión de otra cuenta. El inventario de producción consultado antes de implementar tenía una canción con enlace externo y ninguna con `file_path`; esto no incluye las dos canciones locales iniciales.

## Validación y límites

Baseline: 239 pruebas pasaban antes de la implementación. Los resultados finales se registran al terminar la integración. El Worker local respondió HTTP 401 sin sesión; Wrangler local confirmó escritura/lectura del binding. El cuerpo SQL de la RPC fue validado con `EXPLAIN` contra el esquema actual sin ejecutar actualizaciones. Las pruebas pgTAP/RLS aprobaron en GitHub Actions; la ejecución local requiere iniciar Docker.

| Comprobación final | Resultado |
|---|---|
| `npm test` | 286 pruebas aprobadas, 0 fallos |
| `npm run check` | Aprobado |
| `npm run build` / compilación Next.js | Aprobada |
| `npx opennextjs-cloudflare build` | Worker generado correctamente |
| Range HTTP y fuentes MP3 actuales | 200/206/304/416, sufijos, rangos abiertos, If-Range y HEAD verificados en pruebas |
| Worker y R2 locales | 401 sin sesión; objeto de prueba escrito y leído exclusivamente en almacenamiento local |
| `npm run test:db` / CI `database` | Aprobado en GitHub Actions, incluidos los casos RPC/RLS; Docker local no iniciado |
| iOS/Android físicos y migración remota | Pendientes de dispositivos y credenciales de la cuenta correcta |

La revisión con DeepSeek motivó la RPC para letras largas, la recuperación de actualizaciones confirmadas sin acuse, la protección de referencias incompletas y el uso de fechas reales R2 para la limpieza. Reemplazar el audio intencionalmente cambia su identidad de descarga; migrar los mismos bytes conserva la identidad anterior.

La validación automatizada no equivale a una prueba física en iPhone o Android. Antes de activar en producción, comprobar en Safari iOS y Chrome Android: reproducción desde toque, pausa, bloqueo de pantalla, cambio de canción, seek, descarga, modo avión y cambio de cuenta. También verificar 200/206/416 y HEAD con una sesión del mismo camporee, y denegación con sesión ajena. No publicar claves ni URLs de sesión al registrar resultados.

El límite de subida se conserva en 15 MiB. Las fuentes antiguas de otros formatos siguen siendo reproducibles; los nuevos archivos que se almacenan en R2 son MP3 validados. Subir un archivo y confirmar la fila en Supabase son operaciones separadas: los fallos se compensan cuando es seguro y los huérfanos se reconcilian de manera conservadora. La entrega depende de la red y de los permisos del navegador para reproducción/almacenamiento local.

## Pull Request y activación

La mejora visual del reproductor se publicó por separado en `main` mediante el [PR #3](https://github.com/thebuuba/camporee-app/pull/3). Esta rama incorpora esa versión, manteniendo la integración R2 pendiente y las fuentes de audio compatibles.

[PR #2](https://github.com/thebuuba/camporee-app/pull/2), en borrador y sin fusionar. Los checks `verify`, `database` y Cloudflare Workers Builds aprobaron la implementación en `536e685`. La automatización ejecuta `wrangler versions upload`: genera una versión de preview y no promociona producción. Antes de activar, aplicar la migración SQL, completar las comprobaciones móviles y ejecutar el inventario/migración con credenciales de la cuenta correcta. No se migraron ni eliminaron MP3 originales.

## Costos

R2 Standard: USD 0,015 por GB-mes, USD 4,50 por millón de operaciones A y USD 0,36 por millón de operaciones B. Incluye mensualmente 10 GB-mes, un millón de operaciones A y diez millones B; no cobra salida de datos de R2. Estos límites son de la cuenta, no un cupo independiente por bucket. Las solicitudes/CPU del Worker y las consultas Supabase se cobran según sus planes; las peticiones Range pueden aumentar las operaciones de lectura. Ver [precios oficiales R2](https://developers.cloudflare.com/r2/pricing/) y [bindings OpenNext](https://opennext.js.org/cloudflare/bindings).
