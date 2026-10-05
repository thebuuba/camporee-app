# Cargos de la directiva y recordatorios

En **Más → Usuarios y permisos**, un administrador puede asignar Director/a,
Subdirector/a, Secretario/a, Tesorero/a, Consejero/a o un cargo personalizado.
El cargo se muestra junto al nombre del responsable en Tareas.

El cargo no concede permisos de edición: Administrador, Editor, Solo lectura y
los permisos por módulo continúan controlando el acceso.

Los recordatorios de 10, 5 y 1 días antes, y el del inicio del camporee, usan el
cargo para elegir su contenido y destino. Sin cargo se conserva el comportamiento
anterior por rol de acceso y permisos. Los cargos personalizados usan sus áreas
asignadas. Las notificaciones requieren una suscripción push del usuario.

## Activación en Supabase

Aplicar primero `20261005120000_add_directive_roles_and_task_assignees.sql` al
proyecto de Supabase usado por la app. Añade la columna `directive_role` y la
función `active_task_assignees()`, accesible solo a usuarios activos, sin exponer
los roles de acceso ni los permisos de otras personas.

Después publicar la función `camporee-reminders`, incluyendo `messages.ts`, y
publicar la app. Mantener la configuración de autenticación del cron existente:
la función valida el encabezado `x-cron-secret` antes de enviar notificaciones.

La app puede abrir Tareas y administrar los permisos con el esquema anterior:
si falta la función nueva usa las consultas anteriores, y oculta el campo Cargo
hasta que exista la columna. En esa situación el selector conserva las
limitaciones anteriores para editores. La función de recordatorios nueva sí
requiere aplicar la migración antes de publicarla.

## Verificación

`npm test` comprueba los mensajes por cargo, los cuatro hitos, el comportamiento
anterior y los cargos personalizados. `npm run build` comprueba la app.
Tras aplicar la migración, comprobar con una cuenta Editor que el selector de
Tareas muestra a otros usuarios activos y con una cuenta pendiente que la función
no devuelve el directorio. Verificar el guardado del cargo como administrador.
Las pruebas locales no envían notificaciones reales.
