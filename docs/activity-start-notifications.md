# Inicio de actividades del programa

El trabajo `camporee-activity-start-reminders` ejecuta `camporee-reminders`
cada minuto con `action: schedule`. Conserva el trabajo diario de cuenta
regresiva del camporee.

Se revisan actividades que comenzaron en los últimos cinco minutos, siempre
que no hayan terminado y que el camporee no esté finalizado ni archivado.
También funcionan las reuniones durante la preparación. Reciben el push
solo los miembros activos del club con una suscripción al camporee.

El registro `system_push_reminder_log` reclama cada combinación de actividad,
hora de inicio y usuario mediante su restricción única antes de enviar.
Si ningún dispositivo acepta el aviso, se libera el registro para reintentar
dentro de la ventana de cinco minutos. Cambiar la hora de inicio permite un
nuevo aviso. La recepción depende del permiso de notificaciones y de la red;
la revisión por minuto no promete entrega al segundo exacto.

Inicio muestra la reunión actual también durante la preparación. Programa
usa la zona horaria del camporee al guardar, editar, agrupar y filtrar por
Hoy. Sin hora de fin, una actividad se muestra en curso durante una hora.

Desplegar `camporee-reminders` incluyendo `index.ts`, `messages.ts` y
`schedule.ts`, con `--no-verify-jwt`: la función autentica el cron mediante
el secreto privado `camporee_reminders`. Aplicar la migración
`20261012012045_schedule_activity_start_reminders.sql`.

Verificación: `npm test`, `npm run check`, `npm run build`, `npm run test:db`
y `npm run test:db -- --production-legacy`.
