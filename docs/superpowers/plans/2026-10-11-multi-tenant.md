# Implementación multi-tenant

**Goal:** organizaciones independientes con varios camporees, preservando íntegramente el evento actual.
**Architecture:** membresías por organización; camporee como raíz de datos; RLS y claves compuestas; contexto explícito compartido por servidor/cliente/offline.
**Tech Stack:** Next.js instalado, React, Supabase/PostgreSQL, IndexedDB y service worker nativos.
**Spec:** `docs/superpowers/specs/2026-10-11-multi-tenant.md` (aprobación explícita en conversación).

## Global Constraints

No desplegar ni modificar datos del Supabase remoto. Conservar IDs y estados; no dar permisos implícitos nuevos. No duplicar gestores. Trabajar en la rama dedicada `cambio-a-multiusuario`. Probar fallos de autorización con PostgreSQL real y no solamente con mocks. Registrar progreso recuperable en `.superpowers/sdd/2026-10-11-multi-tenant/progress.md`.

## Task 1: Base de datos y autorización

**Interfaces:** produce organizations, organization_members, organization_invitations, camporees.organization_id; RPC create_organization, create_camporee, create_organization_invitation, accept_organization_invitation, update_organization_member, remove_organization_member, organization_task_assignees; helpers privados de autorización. Mantiene tablas antiguas históricas.

1. Escribir fixtures y pruebas SQL de preservación, RLS, múltiples organizaciones, roles, referencias cruzadas, invitados y último admin. Ejecutarlas sobre esquema antiguo: Expected: fallan por funcionalidad ausente.
2. Migración aditiva, backfill, restricciones, RLS y RPCs. Ejecutar pruebas SQL: Expected: todas pasan; fixture antiguo intacto.
3. Guardar comandos/resultados y commit de la base verificada.

## Task 2: Contexto, registro y administración

**Interfaces:** consume Task 1; produce resolver de contexto autorizado, rutas explícitas, administración org/invitaciones/camporees y enlaces compartidos. Gestores reciben camporeeId/userId/canEdit existentes.

1. Pruebas RED de selección explícita, URL ajena, roles por organización e invitaciones preservadas al autenticar.
2. Implementar resolver, selección y páginas de organización; adaptar todas las páginas y enlaces reutilizando los gestores. Quitar registro pendiente global y eliminación Auth.
3. Scope de mutaciones, archivado, asignados y perfiles privados. Expected: pruebas pasan, TypeScript pasa; commit.

## Task 3: Offline y almacenamiento

**Interfaces:** consume contexto Task 2 y RLS Task 1; produce identidad estable por operación/cliente SW, cola conservadora y cachés aisladas.

1. Pruebas RED de cambio de usuario/organización durante fetch/sync, dos pestañas, conflicto409, cola antigua y logout pendiente.
2. Aislar IndexedDB, sincronización, snapshots SW, descarga/música, URLs firmadas y subida de archivos. Expected: pruebas de aislamiento y regresión pasan; commit.

## Task 4: Realtime y notificaciones

**Interfaces:** consume membresía/contexto; produce suscripciones de dispositivo con destinos múltiples, invalidación limitada y avisos persistidos deduplicados.

1. Pruebas RED de miembro revocado, otra organización, endpoint de otra cuenta, envío offline y alerta de organización.
2. Adaptar funciones Edge, cron, push, realtime y SW. Validar identidad real en servidor y membresía actual en cada envío. Expected: pruebas pasan; commit.

## Task 5: Ensayo y entrega

**Interfaces:** consume todas las tareas. Produce guía preflight/rollback, CI SQL, informe verificado y revisión independiente final.

1. Ensayar migración completa en DB local desde historial y fixture legado. Expected: cantidades y IDs coinciden; accesos cruzados denegados.
2. Ejecutar `npm test`, `npm run check`, `npm run build` y pruebas DB. Expected: todas verdes. Revisar UI local y rutas antigua/nueva.
3. Revisión independiente de la rama; corregir hallazgos importantes con RED/GREEN. Documentar preparación de despliegue y limitaciones comprobadas; commit final.

## Review Focus

Políticas antiguas que sobreviven con OR; grants públicos de RPC; SECURITY DEFINER con identidad manipulable; referencias cruzadas y reparenting; revocación durante sync/realtime/push; invitaciones reutilizables o email no verificado; propietario/último admin concurrentes; pérdida silenciosa de cola o historia; snapshots con sesiones ajenas; campo is_completed y diferencias del esquema remoto; despliegue con PWA antigua.
