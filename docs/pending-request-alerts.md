# Avisos de solicitudes por código

Una membresía nueva con `access_pending: true` e `is_active: false` encola
un aviso push mediante `pg_net`. Repetir el código no inserta otra membresía.
El registro global de Auth no envía avisos.

`admin-signup-alert` valida el secreto privado `signup_alerts`, comprueba que
la solicitud siga pendiente y envía el nombre del solicitante únicamente a
administradores activos del mismo club con una suscripción al camporee.
El aviso abre `/o/{organizationId}/members`. El administrador debe haber
activado las notificaciones en su dispositivo.

Para desplegar la función desde CLI:

```powershell
supabase functions deploy admin-signup-alert --project-ref fmfmebbblqvcbdnukryf --no-verify-jwt
```

Esta función autentica el webhook con `x-cron-secret`; el trigger no envía
un JWT de usuario. Aplicar también la migración
`20261012001015_notify_pending_camporee_requests.sql`.

Verificación: `npm test`, `npm run check`, `npm run build`, `npm run test:db`
y `npm run test:db -- --production-legacy`. Las pruebas SQL inspeccionan la
cola dentro de una transacción que se revierte, sin enviar avisos reales.
