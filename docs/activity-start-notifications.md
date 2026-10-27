# Inicio de actividades del programa

El trabajo `camporee-activity-start-reminders` ejecuta `camporee-reminders`
cada minuto con `action: schedule`. Conserva el trabajo diario de cuenta
regresiva del camporee.

El aviso «¡Llegó el día!» usa ese mismo trabajo por minuto: se envía el día
de `starts_on` a partir de las **08:00 en `camporees.time_zone`** (por defecto,
`America/Santo_Domingo`). No depende de la zona del teléfono ni del servidor.
Si ningún dispositivo acepta el envío, se puede reintentar durante la hora
de las 08:00; después de las 09:00 no se inicia un nuevo envío. El servicio
push puede conservar este aviso durante una hora para un dispositivo que
esté sin conexión. La entrega exacta depende de la red y del sistema operativo.

El cron diario conserva los avisos de 10, 5 y 1 días antes; excluye el aviso
del primer día para no enviarlo a otra hora. El registro único se reclama
antes de enviar, evitando duplicados entre ejecuciones concurrentes. Reciben
el aviso únicamente miembros activos con notificaciones activadas para ese
camporee. El texto sigue adaptándose al cargo y los permisos del usuario.

Este ajuste requiere desplegar la versión actualizada de `camporee-reminders`.
Reutiliza el cron por minuto existente y la tabla de registro; no agrega una
migración de base de datos. Si ese cron aún no está instalado, hay que aplicar
la migración indicada al final de este documento.

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
