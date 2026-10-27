# Auditoría del 27 de octubre de 2026

## Alcance y estado

Revisión local de configuración, dependencias, autenticación, contexto de organización/camporee, políticas SQL, funciones Edge, navegación, sincronización y caché offline. Incluye una revisión independiente con OpenCode y `opencode/deepseek-v4.1-flash-free`, en modo `plan` de solo lectura. No equivale a una certificación de seguridad ni a una prueba completa del despliegue.

Se conservaron los cambios que ya existían en tareas, presupuesto, recordatorios y sus pruebas. No se aplicaron migraciones ni se publicó una versión.

## Hallazgos corregidos

| Prioridad | Hallazgo y reproducción | Corrección |
| --- | --- | --- |
| Alta | `npm audit` inicial detectó 9 paquetes afectados: 2 de severidad crítica y 7 alta. Esto describe avisos de dependencias; no demuestra que todos sean explotables desde esta aplicación. | Next.js 16.3.4 → 16.4.3, Wrangler 4.129.1 → 4.153.0 y actualización compatible de dependencias transitivas en `package-lock.json`. Resultado final: cero vulnerabilidades reportadas. |
| Media | `lib/offline-fetch.ts` clasificaba cualquier POST bajo `/rest/v1/` como escritura de tabla. Al fallar una llamada a `rpc/register_camporee_push` sin conexión, devolvía HTTP 200 sintético y encolaba la llamada. Los controles podían presentar las notificaciones como activadas antes de que el servidor las registrara. | Solo las rutas de tablas participan en respuestas optimistas y encolado. Los errores RPC se propagan al consumidor. |
| Media | Una escritura offline de varias filas devolvía `[[fila1, fila2]]` en vez de `[fila1, fila2]`. | Se conserva la estructura plana del lote. |
| Baja | DeepSeek señaló que la comprobación por subcadena también aceptaba `test.supabase.co.evil.example` como destino offline de Supabase. La prueba nueva reprodujo el éxito sintético incorrecto cuando fallaba la red. | Se comprueba el sufijo de `URL.hostname`, sin aceptar dominios que solo contienen ese texto. Esto corrige la clasificación; no se presenta como una fuga de credenciales demostrada. |
| Baja | El build de Cloudflare generaba `.open-next/` sin exclusión de Git. | Se agregó `.open-next/` a `.gitignore` y se comprobó que el worker generado queda excluido. |

Las tres correcciones del adaptador offline tienen pruebas de regresión en `tests/offline-fetch-contract.test.mjs`: fallaron antes de cada cambio y pasaron después.

Referencia del aviso de Next.js sobre `next/og`: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j. Su explotación requiere el uso descrito en el aviso; la actualización evita mantener la versión afectada instalada.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Suite inicial | 256 pruebas aprobadas, cero fallos. |
| Suite después de las correcciones y actualización | 259 pruebas aprobadas, cero fallos. |
| `npm run check` | Correcto. |
| `npm audit` | Cero vulnerabilidades reportadas. |
| `npm ls --depth=0` | Dependencias directas resueltas. |
| `npx opennextjs-cloudflare build` | Correcto con Next.js 16.4.3; worker generado. Incluye `next build`, comprobación TypeScript y generación de 30 páginas. |
| Servidor de producción local | Arrancó con `npm run start -- -p 3107`. |
| HTTP `/login`, `/signup`, `/offline`, `/manifest.webmanifest`, `/sw.js` | Respuesta 200. |
| HTTP `/` sin sesión | Redirige a `/login`. |
| `git diff --check` | Sin errores de espacios; Git informa normalización LF/CRLF en archivos locales. |
| `npm run test:db` | No ejecutable: falta el contenedor PostgreSQL de pruebas y el motor Docker no responde. |

## Pendientes y límites concretos

1. **Base de datos real:** verificar migraciones y RLS con el contenedor aislado documentado en `supabase/tests/README.md`, incluyendo `--production-legacy`. Las pruebas Node no sustituyen PostgreSQL real.
2. **Aceptación con cuentas:** probar navegación y modificaciones con dos usuarios, organizaciones y sesiones reales, además de invitación, revocación, recuperación de contraseña y cambios de cuenta. Los chequeos HTTP de esta auditoría cubren rutas públicas y redirección sin sesión.
3. **Web Push real:** verificar entrega en dispositivos e iPhone PWA, tokens vencidos y recuperación después de fallos. Las funciones Edge se revisaron por código y pruebas con dobles, sin desplegarlas.
4. **Cloudflare:** el empaquetado pasa, pero OpenNext advierte sobre Windows y soporte experimental del middleware Node.js. Falta validar el worker en su entorno real.
5. **Offline privado:** el service worker evita guardar HTML privado en caché compartida. Sin red, la navegación privada usa la pantalla offline; esta limitación ya consta en `MULTI_TENANT_RELEASE_CHECKLIST.md` y no se reintrodujo caché insegura.
6. **Gestores de paquetes:** CI usa npm. Los archivos pnpm ya presentes quedan conservados; su lockfile no se sincronizó con las actualizaciones de npm. `pnpm-workspace.yaml` contiene valores de ejemplo en `allowBuilds` que requieren revisión antes de adoptar pnpm.
7. **Pruebas:** Node avisa que los archivos TypeScript importados directamente carecen de un tipo de módulo explícito en `package.json`. No impide las pruebas; no se cambió el sistema de módulos durante esta auditoría.
8. **Escala y consistencia:** el dashboard consulta tablas completas por camporee y algunos flujos hacen varias escrituras independientes. Son áreas para medir y probar con fallos intermedios; no se presentan aquí como pérdidas de datos demostradas.

El estado del esquema de producción no se dedujo de documentación histórica. Para cerrar los pendientes de despliegue hay que comprobar el entorno vigente.

## Resultado de DeepSeek y evaluación

OpenCode ejecutó la revisión con `opencode/deepseek-v4.1-flash-free`. La revisión extensa inspeccionó rutas, contexto de permisos, SQL y funciones Edge, pero se acotó su cierre tras una respuesta demorada. Una segunda revisión de los archivos corregidos terminó y confirmó las correcciones de RPC y lotes. La conclusión recibida no certifica el conjunto del repositorio.

Además del dominio corregido, señaló estos límites del adaptador existente:

- Una respuesta no exitosa detiene el procesamiento de la cola. Esto conserva el orden y evita descartar datos; un 401 o 500 puede recuperarse al renovar la sesión o reintentar. Un conflicto persistente sí necesita resolución explícita para desbloquear operaciones posteriores.
- Si un POST se guardó y se perdió su respuesta, repetirlo con el mismo ID puede producir 409. No es correcto tratar cualquier 409 como éxito: también puede indicar otro conflicto de integridad. Falta una reconciliación que compruebe la fila y su contenido con autorización antes de resolver la operación.
- Las entradas antiguas sin identidad/ámbito se conservan sin reproducirse. Pueden mantener visible un error de sincronización; necesitan recuperación o descarte explícito por el usuario.
- La respuesta optimista no emula por completo la negociación singular de PostgREST para arrays enviados junto con `Accept: application/vnd.pgrst.object+json`. Los flujos de lotes revisados no piden ese formato; conviene cubrirlo antes de introducir esa combinación.

Estas observaciones quedan abiertas; no se borraron operaciones pendientes ni se relajó el aislamiento de cuentas para ocultarlas. Las pruebas previas de `tests/loading-reliability.test.mjs` cubren replay básico, conflictos y cambio de cuenta; las pruebas nuevas cubren los tres errores corregidos.
