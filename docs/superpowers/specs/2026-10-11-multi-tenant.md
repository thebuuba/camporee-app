# Camporee multi-tenant — diseño aprobado

El usuario aprobó implementar el diseño el 11 de octubre de 2026. Una cuenta puede pertenecer a varias organizaciones; sus roles son independientes.

## Contrato

- Una aplicación y una base Supabase. `organizations` y `organization_members` contienen la autoridad de acceso. Los camporees pertenecen a una organización y los miembros activos acceden a sus camporees. Roles admin/editor/viewer y permisos por módulo existentes se conservan.
- Migración aditiva y transaccional: todos los camporees, miembros y datos existentes pasan a una organización inicial, conservando IDs, estados de acceso, permisos, archivos y fechas. `app_members` y `camporee_members` quedan como registros históricos sin autoridad global. No aplicar esta migración al proyecto remoto durante el desarrollo.
- Registro crea únicamente el perfil. Crear una organización establece al creador como propietario/admin de forma atómica. Invitaciones de un solo uso, con hash de token, vencimiento y correo verificado; aceptar no permite escoger el rol. La administración modifica membresías, nunca elimina la cuenta Auth de otra persona.
- Camporees con historial y selector explícito. URL `/o/:organizationId/c/:camporeeId/...`; validar el contexto en cada lectura/escritura. Archivados son de solo lectura; administrador puede reabrir. Una referencia entre módulos debe pertenecer al mismo camporee, incluso si el usuario pertenece a ambos.
- RLS reemplaza todas las políticas globales en la misma transacción. Funciones privilegiadas verifican identidad y permisos; cambios de propietario/último administrador se serializan. Revocación efectiva en lecturas y sincronización posteriores.
- Archivos conservan `<camporeeId>/...`; RLS deriva organización. Avatares privados. Documentos no pueden apuntar a archivos internos de otro camporee.
- Offline, cola, snapshots y música se identifican por usuario/organización/camporee; no reproducir escrituras de otra cuenta ni reasignar colas antiguas. Conflictos y revocaciones quedan visibles. Realtime solo invalida datos del contexto. Push y recordatorios verifican membresía actual y contexto.
- Reutilizar páginas, gestores y utilidades existentes. Sin bibliotecas adicionales salvo una necesidad demostrada.

## Validación y despliegue

Pruebas PostgreSQL reales con dos organizaciones, roles distintos en la misma cuenta, referencias cruzadas, archivos, invitaciones, revocación y rollback/backfill. Pruebas de servidor, offline y SW; suite existente, TypeScript y build. Preflight remoto, respaldo restaurable de DB y Storage, conciliación de esquema (`is_completed` no figura en migraciones antiguas), ensayo en copia, despliegue coordinado y verificación de cantidades/IDs antes de habilitar nuevas organizaciones.
