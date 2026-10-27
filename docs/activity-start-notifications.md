# Inicio de actividades y primer día del camporee

El cron `camporee-activity-start-reminders` ejecuta `camporee-reminders`
cada minuto con `action: schedule` y conserva el trabajo diario de cuenta regresiva.

El aviso «¡Llegó el día!» se crea el día de `starts_on` desde las **08:00 en
`camporees.time_zone`** (por defecto `America/Santo_Domingo`). No usa la zona
del teléfono ni del servidor. Se reintenta dentro de esa hora y vence a las
09:00 locales. El cron diario solo genera los avisos de 10, 5 y 1 días antes.
El proveedor y la red pueden demorar la recepción; no se promete entrega al segundo.

Las actividades se detectan durante los cinco minutos posteriores al inicio,
si aún no terminaron y el camporee no está finalizado ni archivado. También
funcionan las reuniones de preparación. Los trabajos ya creados pueden
reintentarse hasta su vencimiento: máximo 30 minutos desde el inicio,
acotado por la hora de fin. Cambiar el inicio genera una nueva clave de aviso.

Solo reciben avisos miembros activos con una suscripción al camporee.
Los trabajos se conservan en `system_push_reminder_log`; usan leases UUID,
reintentos limitados y confirmación por dispositivo. Un worker interrumpido
puede recuperarse al vencer su lease. Puede haber reentrega si el proveedor
aceptó un push antes de que se registrara su confirmación.

Inicio y Programa conservan la zona horaria del camporee. Sin fin explícito,
una actividad se muestra en curso durante una hora.

Para publicar se necesitan las migraciones anteriores, incluyendo
`20261012012045_schedule_activity_start_reminders.sql`, y
`20261027171816_durable_delivery.sql`. Desplegar `camporee-reminders` completo,
incluido `delivery.ts`, con `--no-verify-jwt`: autentica el cron mediante su
secreto privado `camporee_reminders`. Ver
[orden de publicación y límites](correcciones-auditoria-2026-10-27.md).
