# Multiusuario — checklist de preparación y despliegue

**Estado:** En pruebas; la rama `cambio-a-multiusuario` NO debe fusionarse ni desplegarse sin autorización explícita del propietario. El PR #1 permanece como borrador. Esta guía no autoriza operar sobre Supabase remoto.

## Alcance implementado

- Organización y miembros con permisos independientes, más varios camporees por organización.
- Rutas explícitas por organización y camporee; registro, invitación, administración y selección.
- Migraciones transaccionales con preservación de IDs históricos y reemplazo de RLS global.
- Archivos privados y relaciones entre módulos sujetas a ámbito de camporee.
- Identidad y membresía comprobadas al enviar push; recordatorios por organización y zona horaria.
- Registro push de varios camporees por dispositivo, reubicación de endpoint al cambiar de cuenta.
- Realtime filtrado por contexto activo.
- Cola offline etiquetada por usuario/organización/camporee; conflictos HTTP 409 preservados.
- Cierre de sesión con advertencia de operaciones pendientes; estados de sincronización no engañosos.
- Moneda y zona horaria por camporee en Inicio y Presupuesto.

## Limitaciones conocidas, no ocultar

1. **Páginas privadas sin navegación offline:** el service worker ya no conserva HTML privado en la caché compartida. Se conserva caché de recursos estáticos y audio público. Para recuperar navegación offline privada, hace falta caché cifrada/segregada, revocación y pruebas de cuentas alternas; no restaurar el comportamiento antiguo.
2. **Colas anteriores a la migración:** las operaciones offline sin identidad/ámbito se conservan temporalmente pero NO se envían automáticamente bajo una sesión nueva; necesitan recuperación asistida y verificación.
3. **Cierre de sesión:** `Clear-Site-Data` elimina almacenamiento local; el usuario debe confirmar explícitamente si hay operaciones sin sincronizar.
4. **Push/Edge:** solo se han revisado por código. La base de datos de prueba cubre destinos múltiples, revocación y cambio de usuario, pero todavía hacen falta pruebas con Web Push real, iPhone PWA, token vencido y dos dispositivos distintos.
5. **End-to-end:** la suite Node y SQL no sustituye navegación real con dos cuentas y dos organizaciones. Falta realizar esa prueba de aceptación en un entorno de staging con Supabase completo.
6. **Rendimiento:** dashboard aún carga tablas completas por camporee; probar volúmenes altos y paginar o resumir desde SQL antes de abrir la plataforma masivamente.
7. **Consistencia:** los cambios conjuntos entre actividades, programa y participantes usan varias escrituras separadas; verificar fallos intermedios y considerar RPC transaccionales.

## Hallazgos del esquema real en Supabase (2026-10-11)

La base de producción **no tiene las tablas multiusuario**. Además difiere del esquema histórico del repositorio: `public.app_members` **no contiene** `directive_role`, `public.active_task_assignees()` **no existe**, y `camporee_activities.is_completed` **sí existe**. La migración se adaptó a estas diferencias y la CI ejecuta también `npm run test:db -- --production-legacy`.

El proyecto pertenece a una organización **Free**, sin copias automáticas de seguridad de la base de datos. Se requiere un respaldo externo comprobado de PostgreSQL y Storage antes de modificar políticas RLS o funciones de autenticación.

**No aplicar la migración solo para solucionar el error de inicio de sesión de la vista previa:** cambiaría los controles de acceso y el trigger de nuevos usuarios utilizados por la aplicación antigua que aún se ejecuta sobre la base de producción. El despliegue del frontend multiusuario, Edge Functions y las migraciones debe coordinarse, sin cambiar `main` antes de que el propietario lo autorice.

## Preflight obligatorio (solo staging aislado)

1. Crear proyecto Supabase independiente (sin secretos ni datos privados de producción).
2. Tomar copia restaurable de PostgreSQL y Storage y probar restauración ANTES del ensayo de producción.
3. Comparar esquema del entorno actual con migraciones versionadas, funciones Edge, triggers, políticas, buckets y tareas pg_cron. Revisar especialmente `is_completed`.
4. Ensayar todas las migraciones empezando por el esquema antiguo y registros de ejemplo; conservar recuentos, IDs y rutas de archivos.
5. Ejecutar `npm ci`, `npm test`, `npm run check`, `npm run build` y `npm run test:db`.
6. Verificar con SQL real que un usuario A no ve ni modifica datos de B, incluso si ambos acceden a distintos camporees y tienen permisos editor en algunos módulos.
7. Probar correo verificado, aceptación única de invitación, expiración, rechazo, revocación, propietario, último administrador y membresía cruzada.
8. Probar salida de sesión con escrituras pendientes, cambio de cuenta en un mismo navegador, conflicto 409 y reconexión.
9. Probar push de un dispositivo a dos camporees; luego cambiar usuario y confirmar que ya no recibe mensajes antiguos.
10. Revisar transferencias, formularios, canciones, archivos, presupuestos, programa y datos archivados; repetir con dos zonas horarias/monedas diferentes.

## Plan coordinado de puesta en producción (requiere aprobación expresa)

- Congelar nuevas escrituras temporalmente, respaldar DB + Storage y anotar versión actual.
- Desplegar de manera coordinada migraciones, aplicación y funciones Edge multiusuario; una PWA antigua conectada a DB nueva no es combinación respaldada.
- Verificar datos históricos y el administrador inicial antes de admitir nuevas organizaciones.
- Revisar registros, fallos RLS, push, almacenamiento y colas de sincronización.
- Mantener plan de reversión basado en una **restauración verificada de DB y Storage**; revertir solo el commit no revierte una migración de esquema.
- No fusionar la rama ni realizar ninguno de estos pasos hasta autorización explícita del usuario.

## Comandos y CI

- PR de revisión: https://github.com/thebuuba/camporee-app/pull/1
- Pruebas SQL: `supabase/tests/multi-tenant.sql` con contenedor Docker aislado.
- Guía del contenedor: `supabase/tests/README.md`.
- GitHub Actions: `.github/workflows/ci.yml`; comprobar que los jobs `verify` y `database` estén verdes en el **último commit**, no únicamente en commits anteriores.
