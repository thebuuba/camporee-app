# Recordatorios de tareas vencidas

El cron por minuto de `camporee-reminders` procesa un resumen diario por
responsable y camporee desde las 09:00 de la zona horaria del camporee.

Incluye tareas cuya fecha límite local es anterior a hoy, con responsable
activo y estado distinto de completado/cancelado. Excluye camporees
finalizados o archivados, tareas sin fecha y tareas sin responsable.

La entrega requiere permiso de notificaciones y una suscripción al camporee.
El enlace abre las tareas de ese mismo camporee. El contador de envío indica
aceptación del proveedor, no recepción ni lectura en el dispositivo.

Los trabajos usan `system_push_reminder_log` y la clave única
`task-overdue:AAAA-MM-DD`. Los leases recuperables permiten reintentar tras
un fallo o interrupción. Se confirman dispositivos individualmente; las
suscripciones 404/410 se eliminan. Una interrupción entre aceptación y
confirmación todavía puede causar reentrega.

Aplicar `20261027171816_durable_delivery.sql` y desplegar la función completa
con `delivery.ts`, `index.ts`, `messages.ts`, `schedule.ts` y `tasks.ts`.
Conserva autenticación por secreto de cron y `verify_jwt=false`; no necesita
otro cron. Ver [publicación coordinada](correcciones-auditoria-2026-10-27.md).

Verificar con `npm test`, `npm run check` y ambas variantes de `npm run test:db`.
