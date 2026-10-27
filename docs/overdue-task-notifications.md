# Recordatorios de tareas vencidas

El cron existente `camporee-activity-start-reminders` llama a
`camporee-reminders` cada minuto con `action: schedule`. Además de los
inicios de actividades, procesa un resumen diario de tareas vencidas por
responsable y camporee a partir de las 09:00 en la zona del camporee.

Solo incluye tareas cuya fecha límite local sea anterior a hoy, que tengan
responsable activo en la organización y que no estén completadas ni
canceladas. Excluye camporees finalizados o archivados. Las tareas sin
fecha límite o sin responsable no generan avisos.

La entrega requiere notificaciones activadas y una suscripción del
dispositivo al camporee. El aviso abre las tareas de ese mismo camporee.
Los totales de envío indican aceptación por el servicio push, no lectura
ni recepción confirmada en el dispositivo.

Se reclama una fila con la clave única existente de
`system_push_reminder_log` y `milestone = task-overdue:AAAA-MM-DD` antes
de enviar, para evitar duplicados por ejecuciones simultáneas. Si fallan
todos los dispositivos se libera la fila para reintentar. Un corte del
proceso después del reclamo puede impedir el resumen de ese día; el
siguiente día utiliza otra clave. Las suscripciones 404/410 se eliminan.

Desplegar `camporee-reminders` con `index.ts`, `messages.ts`, `schedule.ts`
y `tasks.ts`. Conserva la autenticación propia mediante el secreto del
cron y `verify_jwt: false`. No requiere migración ni otro trabajo cron.

Verificación: `npm test` y `npm run check`.
