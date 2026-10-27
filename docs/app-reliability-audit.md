# Revisión de fallos — 17 de octubre de 2026

Base: `origin/main` en `e0aafc6`. Rama: `fix/app-reliability-audit`.

## Fallos reproducidos y corregidos

| Área | Caso reproducido | Corrección |
|---|---|---|
| Tareas | La fecha límite cambiaba según la zona del teléfono | Crear, editar y mostrar con la zona del camporee |
| Asistencia | La hora ingresada se interpretaba en la zona del dispositivo | Usar la zona del camporee al guardar y mostrar |
| Competencias | El mismo horario no coincidía con Programa entre dispositivos | Reutilizar los conversores de zona de Programa |
| Sincronización | Un cambio antiguo pendiente sobrescribía otro más reciente al volver la conexión | Completar los pendientes antes de enviar la nueva edición; conservar el orden cuando hay conflicto o un replay en curso |
| Sincronización | Cambiar de camporee durante un error de red reasignaba el pendiente | Capturar usuario y camporee al iniciar la petición |
| Sincronización | Un RPC fallido se presentaba como guardado sin conexión | Excluir RPC del mecanismo de respuestas optimistas |
| Sincronización | Las inserciones de varias filas devolvían un arreglo anidado | Conservar la forma de respuesta de varias filas |
| Navegador | El bloqueo de almacenamiento local impedía guardar con conexión | Permitir el guardado online cuando IndexedDB está deshabilitado por seguridad |
| Reproductor | El rechazo tardío de una reproducción anterior mostraba un error sobre la canción nueva | Ignorar resultados de generaciones anteriores |
| Reproductor | Reintentar un archivo privado repetía un enlace firmado caducado | Invalidar la fuente y renovar su firma después del error |
| Notificaciones | Bloquear `sessionStorage` producía una excepción y no permitía cerrar el aviso | Mantener el aviso y su cierre aun sin almacenamiento |
| Documentos | El navegador podía bloquear la pestaña abierta después de esperar una firma privada | Reservar la pestaña durante el clic, aislar su `opener` y cerrarla si falla la firma |

Cada corrección funcional tiene una prueba de regresión. Los casos nuevos se reprodujeron antes de corregirlos.

## Dependencias

`npm audit` informó inicialmente ocho dependencias afectadas (dos críticas y seis altas). Se actualizó Next.js de `16.3.4` a `16.3.8`, Wrangler de `4.129.1` a `4.151.1` y las dependencias transitivas corregibles dentro de sus rangos compatibles. El resultado final de `npm audit --audit-level=low` es **cero vulnerabilidades conocidas**.

Referencias consultadas: [aviso de Next.js sobre ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [aviso de Next.js sobre caché SSG/ISR](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) y [aviso de Undici](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j).

Se excluyeron de Git los artefactos `.open-next/` y los archivos locales de secretos `.dev.vars*`.

## Validación

- Base: 241 pruebas aprobadas. Suite ampliada: 256 pruebas aprobadas, cero fallos.
- Comprobación TypeScript y compilación Next.js aprobadas.
- Compilación OpenNext del Worker de Cloudflare aprobada.
- 30 rutas comprobadas por HTTP sin sesión: páginas públicas 200, rutas privadas con redirección al acceso y enlaces inválidos 404; ningún 500.
- Pantalla de acceso comprobada en Chrome: validación de campos vacíos y ausencia de errores en consola.
- Revisión general y revisión específica de sincronización con DeepSeek mediante OpenCode; se contrastaron los hallazgos con el código y las pruebas.
- La integración en `main` se realiza después de aprobar los checks remotos de aplicación, PostgreSQL/RLS y Cloudflare.

## Alcance y límites

La revisión cubre el código de `main`, los módulos existentes, las pruebas de aislamiento entre clubes y camporees y los errores de red simulados. Esta entrega no requiere cambios de esquema ni migraciones SQL.

Los flujos autenticados de escritura se probaron con dependencias controladas; no se hicieron altas ni borrados de datos reales. Las comprobaciones HTTP y de navegador fueron sin sesión. No se dispone de una prueba física completa en iPhone y Android ni de todas las combinaciones de dispositivos y permisos. Una suite aprobada no demuestra ausencia absoluta de errores.

Los cambios locales anteriores del checkout original y la integración R2 del PR #2 se mantienen separados de esta entrega.
