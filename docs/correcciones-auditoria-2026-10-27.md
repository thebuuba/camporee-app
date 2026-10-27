# Correcciones de la auditoría crítica

Implementación en `fix/critical-audit`, basada en `main`. Pendiente de aplicar a producción.
La [auditoría original](auditoria-critica-2026-10-27.md) describe el estado anterior.

La reparación posterior del despliegue está aislada en `main`, commit `21f0a0b`:
OpenNext 1.20.13 incluye el manifiesto de Next 16.4 y pnpm 9 tiene un workspace
válido. Se añadió una comprobación real del Worker en CI; una compilación
correcta por sí sola había dejado pasar la excepción 1101. Ver
[diagnóstico del runtime](cloudflare-runtime.md). Los demás cambios de esta
auditoría se conservan en su rama, sin desplegar.

## Cambios

| Hallazgo | Resultado |
|---|---|
| 1. Columna de tareas ausente | Migración de `assigned_participant_id`, FK por camporee y borrado de participante que desvincula la asignación. |
| 2. Actividades con escrituras parciales | Guardado y eliminación mediante transacciones RPC; fallos de participantes o Programa restauran todo. |
| 3. Respuestas de asistencia desordenadas | Cola compartida para cambios individuales y masivos; revisiones por persona conservan la última intención local. |
| 4. Totales truncados | Resumen SQL completo y finanzas mediante agregados JSON escalares; pruebas con 10.000 registros. |
| 5. Conflictos offline sin salida | Revisar, exportar sin credenciales, reintentar y descartar individualmente dentro de cuenta/camporee. Descartar y sincronizar comparten exclusión. |
| 6–7. Push perdido | Aviso y trabajos se guardan juntos; worker con reclamos recuperables, confirmación por dispositivo y reintentos limitados. |
| 8. Éxito sin filas modificadas | Identidad devuelta obligatoria en las mutaciones revisadas y en replay; respuesta vacía conserva el pendiente. |
| 9. Inventario duplicado | Asignación de planificación por fecha/ID; conversión kg/g y l/ml; unidades incompatibles visibles. |
| 10. Accesibilidad | Login con texto oscuro sobre naranja, zoom permitido, controles de 44 px y foco visible. |
| 11. Promesa offline | Mensaje limitado a la pantalla abierta; 202 significa pendiente; los refrescos automáticos esperan los cambios pendientes del ámbito actual. |
| 12. Contratos y navegador | Pruebas SQL reales de esquema, aislamiento, rollback y entrega; Playwright móvil incorporado a CI. |
| 13. Mantenimiento visual | 291 reglas adyacentes idénticas consolidadas; 27.865 bytes CSS fuente retirados sin alterar valores ni orden. Eliminadas 219 líneas de setup sin rutas activas. |

## Publicación coordinada

1. Aplicar `20261027170858_critical_data_integrity.sql` y `20261027171816_durable_delivery.sql` después de las migraciones previas. Ensayar primero en un entorno aislado con respaldo restaurable.
2. Desplegar `camporee-reminders` con `delivery.ts`, `index.ts`, `messages.ts`, `schedule.ts` y `tasks.ts`. Mantener su autenticación por secreto del cron y `verify_jwt=false`.
3. Desplegar `camporee-push` y el frontend coordinadamente. La acción antigua `send` responde 410 para evitar duplicados desde clientes anteriores; la publicación actual crea trabajos mediante trigger.
4. Comprobar que el cron existente por minuto sigue activo. El aviso del primer día se crea desde las **08:00 de la zona horaria del camporee**, con reintentos hasta las 09:00. El cron diario conserva los avisos de 10, 5 y 1 días antes.
5. Verificar con dispositivos de prueba una publicación offline, reconexión, entrega push, recuperación de reclamos y aislamiento entre clubes. La aceptación del proveedor no demuestra recepción o lectura en el teléfono.

La migración conserva los registros históricos como entregados. Los trabajos nuevos usan hasta ocho intentos, backoff de 30 segundos a una hora y vencimiento acotado. El payload caduca a los 30 días; las claves de deduplicación se conservan.

## Verificación reproducible

```sh
npm test
npm run check
npm audit
npm run build
npm run test:browser
node scripts/audit-critical-flows.mjs
npm run test:db
npm run test:db -- --production-legacy
npx opennextjs-cloudflare build
```

Las pruebas SQL solo aceptan el contenedor documentado con imagen fijada y `--network none`. Puede elegirse otro nombre local mediante `CAMPOREE_TEST_CONTAINER`. Se ejecutan dentro de una transacción que se revierte.

Resultado local: **364 pruebas Node**, **186 comprobaciones SQL por variante**
(normal y esquema heredado de producción), TypeScript sin errores, cero avisos
de `npm audit`, y compilaciones Next/OpenNext correctas. Las 47 regresiones
seleccionadas del script de auditoría también pasan. Playwright verifica el
login y la carga inicial en anchos de 320 y 390 px; no sustituye pruebas con
sesiones reales en teléfonos físicos.

## Límites que permanecen

- Entre dos administradores gana la última escritura que confirma PostgreSQL; la cola garantiza orden dentro de una instancia, sin prometer precedencia global entre dispositivos desconectados.
- Una interrupción entre aceptación push y confirmación en base puede causar reentrega. Web Push no ofrece una transacción común con PostgreSQL.
- Actividades usan RPC transaccional y requieren conexión; ante fallo el formulario conserva sus datos. El modo offline sigue limitado a la pantalla abierta y las operaciones compatibles.
- Finanzas devuelve la historia completa de cada lista en un snapshot; su tamaño crece con el historial. Gastos e ingresos son consultas separadas, sin snapshot compartido entre ambas.
- Inventario calcula disponibilidad de planificación; no introduce reservas ni descuenta consumos persistidos.
- Ante una respuesta incierta o una eliminación pendiente se conservan archivos. Puede haber archivos huérfanos; se prioriza no romper referencias válidas.
- La consolidación CSS es parcial. Quedan capas globales y tipos de base amplios que conviene migrar gradualmente, con cobertura por pantalla.
- OpenNext avisa que el middleware Node en Cloudflare sigue siendo experimental; la compilación correcta no sustituye un ensayo del despliegue.
- No se ha ensayado el recorrido privado en Android/iPhone físicos ni la recuperación de respaldos reales. La política de lectura de datos médicos/contactos requiere una decisión de privacidad; no fue ampliada ni restringida en este cambio.
