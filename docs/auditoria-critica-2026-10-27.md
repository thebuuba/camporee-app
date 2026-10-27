# Auditoría crítica de Camporee — 27 de octubre de 2026

Base inspeccionada: `648c2d1`, rama `main`.

Este documento conserva los hallazgos originales. El estado posterior y los
límites de las correcciones están en [Correcciones de la auditoría](correcciones-auditoria-2026-10-27.md).
El script `audit-critical-flows.mjs` ahora exige el comportamiento corregido;
las cifras de reproducciones que siguen pertenecen al ensayo original.

## Dictamen

La aplicación tiene una base funcional y controles de aislamiento deliberados,
pero presenta defectos de consistencia, recuperación y verificación que impiden
tratarla como una herramienta de operación plenamente fiable. Los problemas
más costosos están en guardar y recuperar información, no en agregar pantallas.

La suite existente pasa **286 pruebas**. Se añadieron **7 reproducciones de
defectos** que ejecutan código real con servicios simulados. Las siete confirman
los comportamientos descritos; su resultado verde significa que el defecto fue
observado, no que esté corregido. No se modificó código de producto durante esta
auditoría ni se escribieron datos en Supabase.

## Hallazgos por prioridad

### 1. P1 — El esquema versionado no soporta la asignación actual de tareas

**Dónde:** `app/tasks/page.tsx:14`, `app/tasks/task-manager.tsx:54`,
`supabase/migrations/20260907165552_initial_camporee_schema.sql:30`.

Tareas selecciona y escribe `assigned_participant_id`. La búsqueda en todas las
migraciones y pruebas SQL del repositorio no encuentra la creación de esa columna.
Una base reconstruida exclusivamente desde estas migraciones no satisface la
consulta de Tareas. No se verificó si la base desplegada la tiene por un cambio
manual: la consulta de lectura sin sesión recibió permiso denegado.

**Mejora:** agregar y probar la migración, incluyendo relación del participante
con el mismo camporee, comportamiento al eliminarlo y datos existentes. Generar
tipos desde el esquema y comprobar consultas reales en CI.

**Aceptación:** crear una base vacía con las migraciones y poder abrir, guardar
y editar tareas asignadas a participantes sin cambios manuales de esquema.

### 2. P1 — Editar participantes de una actividad puede borrar las asignaciones anteriores

**Dónde:** `app/more/activities/activity-manager.tsx:130`, `:141`.

Se elimina la lista anterior y luego se inserta la nueva mediante otra petición.
La reproducción hace que el borrado termine y que falle la inserción. El resultado
persistido queda vacío y el estado local todavía muestra los participantes nuevos.
El mensaje de error no restaura los datos anteriores. Guardar actividad, evento de
Programa y vínculo también usa varias escrituras independientes.

**Mejora:** una operación transaccional de base de datos para el cambio conjunto,
con validación de permisos y ámbito. Conservar el formulario ante fallo.

**Aceptación:** inyectar fallo en cada escritura y demostrar que se conserva el
estado anterior o se guarda íntegramente el nuevo.

### 3. P1 — La asistencia admite respuestas fuera de orden

**Dónde:** `app/more/attendance/attendance-manager.tsx:52`.

Dos toques rápidos generan dos `upsert` de la misma persona sin bloqueo por fila
ni versión. En la reproducción se envía `presente=true`, luego `false`; al
completar primero la segunda petición, la primera termina imponiendo `true`.
La última intención del usuario se pierde y la UI adopta el resultado antiguo.

**Mejora:** serializar o agrupar cambios por persona; rechazar respuestas obsoletas.
Para varios dispositivos, definir una política de concurrencia en el servidor.

**Aceptación:** demorar y reordenar respuestas manteniendo siempre el último
cambio confirmado; incluir el caso de dos administradores.

### 4. P1 — Los resúmenes pueden calcularse sobre datos truncados sin avisar

**Dónde:** `lib/home-data.ts:31`, `:51`; `app/more/budget/page.tsx:13`.

Se descargan filas y se cuentan o suman en JavaScript, sin paginación ni total
servidor. Una respuesta REST limitada puede ser exitosa y estar incompleta.
La reproducción simula 1.200 tareas y gastos con un máximo de 1.000 filas por
respuesta: Inicio muestra 1.000 tareas y suma 1.000, aunque existen 1.200.
El límite efectivo del proyecto desplegado no se verificó.

**Mejora:** conteos y sumas autorizados en SQL para los resúmenes, paginación
estable para listados y filtros en servidor cuando el volumen lo justifique.

**Aceptación:** comparar contra SQL con 1.200 y 10.000 registros. Mostrar totales
exactos independientemente del límite de filas de la API.

### 5. P1 — Un conflicto offline persistente bloquea las escrituras siguientes

**Dónde:** `lib/offline-fetch.ts:135`, `:206`; `app/components/connection-status.tsx:98`.

Ante un 409 se conserva la operación y se detiene la cola; las nuevas ediciones
del mismo ámbito se agregan detrás. La interfaz permite reintentar, pero no
inspeccionar la operación, reconciliarla con el servidor o recuperarla/exportarla.
También un POST que sí se guardó y perdió su respuesta puede terminar en conflicto
al reintentarse. Las pruebas existentes ya reproducen la conservación de ambas
operaciones detrás del conflicto.

Conservar el orden y no descartar datos protege al usuario. El problema es que
falta un camino para salir de ese estado.

**Mejora:** resolución explícita por operación y recuperación segura. Confirmar
identidad, ámbito y contenido antes de resolver duplicados; nunca interpretar
cualquier 409 como éxito ni vaciar la cola automáticamente.

**Aceptación:** crear un conflicto real, recuperar/exportar los cambios afectados
y reanudar la cola sin perder información ni mezclar cuentas.

### 6. P1 — Los avisos creados offline no tienen entrega push al reconectar

**Dónde:** `app/more/announcements/announcement-manager.tsx:63`, `:72`;
`lib/offline-fetch.ts:132`.

El aviso se presenta como «publicado» al aceptar la respuesta optimista. El envío
push se solicita únicamente en el cliente si `navigator.onLine` es verdadero.
El replay posterior hace la escritura REST y no ejecuta ese envío; las migraciones
revisadas no contienen un trigger de entrega para estos avisos. La reproducción
confirma el mensaje de éxito sin ninguna solicitud push estando offline.

**Mejora:** crear una entrega durable junto con el aviso y procesarla en el
servidor. Diferenciar visualmente «pendiente», «publicado» y «envío solicitado».

**Aceptación:** crear un aviso urgente sin red, reconectar y comprobar tanto la
persistencia como la solicitud de push, incluyendo reintentos.

### 7. P1 — Un recordatorio reclamado puede perderse si la ejecución se interrumpe

**Dónde:** `supabase/functions/camporee-reminders/schedule.ts:29`;
patrón equivalente en `index.ts` y `tasks.ts`.

Se crea la fila única del registro antes de enviar. Si el proceso termina
después de reclamarla y antes de completar la entrega, el siguiente cron encuentra
el duplicado y omite el aviso. No hay estado pendiente ni vencimiento de reclamo.
La reproducción deja la entrega sin completar y ejecuta otro cron con el registro
persistido: no ocurre ningún reintento de entrega.

**Mejora:** estado de entrega, reclamos recuperables y reintentos limitados. Definir
cómo tratar un resultado incierto del proveedor y cómo reducir duplicados.

**Aceptación:** interrumpir el worker tras el reclamo, reanudarlo y verificar
recuperación. La hora correcta del recordatorio no sustituye esta garantía.

### 8. P2 — Algunas mutaciones anuncian éxito aunque afecten cero filas

**Dónde:** `app/more/participants/participant-manager.tsx:83`; patrón en Tareas e
Inventario y otras escrituras que solo inspeccionan `error`.

La reproducción devuelve `{error:null, count:0, data:[]}` a un borrado: la UI
elimina la persona localmente y muestra «Participante eliminado». Una fila puede
haber cambiado, desaparecido o quedar filtrada por RLS. La ausencia de error no
demuestra que se haya modificado la fila esperada. PostgreSQL filtra las filas
que una política no permite procesar: [documentación oficial](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

**Mejora:** confirmar filas afectadas o usar operaciones que devuelvan un resultado
explícito. Reconciliar estado y permisos antes de anunciar éxito.

### 9. P2 — El cálculo de faltantes reutiliza existencias para varias comidas

**Dónde:** `app/more/meals/meal-manager.tsx:42`.

Cada ingrediente compara su demanda con todo el inventario. En la reproducción,
almuerzo y cena necesitan 4 kg de arroz cada uno y hay 5 kg: ninguna comida muestra
faltantes, aunque la demanda conjunta es 8 kg. Tampoco se comprueba la conversión
de unidades antes de restar cantidades.

**Mejora:** definir consumo/reservas y unidades compatibles; calcular demanda
conjunta por producto y fecha. No prometer disponibilidad que se cuenta dos veces.

### 10. P2 — Contraste insuficiente y restricción de zoom

**Dónde:** `app/login.css:20`, `app/layout.tsx:66`.

Se inspeccionó el login real en Chrome. «Iniciar sesión» tiene color calculado
`rgb(255,255,255)` sobre `rgb(247,134,69)`, texto de 16 px y peso 600. El contraste
es **2,48:1**, inferior al **4,5:1** requerido para texto normal por
[WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
El viewport solicita `maximum-scale=1, user-scalable=no`; restringe el zoom en
navegadores que respetan esas opciones. Algunos navegadores las ignoran.
La ampliación del texto debe conservar uso y contenido:
[WCAG 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

«Crear cuenta» y recuperación tienen áreas observadas de 20 px de alto; requieren
revisión de separación y tamaño táctil. Esto no se presenta como una evaluación
completa de conformidad WCAG.

**Mejora:** verificar colores calculados de cada estado real, permitir zoom y
probar 320 px, ampliación y teclado. Los tests de constantes de paleta no bastan.

### 11. P2 — La experiencia offline y su mensaje se contradicen

**Dónde:** `app/components/connection-status.tsx:96`, `public/sw.js:104`,
`app/offline/page.tsx:3`.

El aviso de conexión promete usar pantallas ya visitadas. El service worker envía
las navegaciones privadas sin red a la pantalla offline porque deliberadamente
no conserva HTML privado en caché compartida. Se puede usar una pantalla que siga
abierta, pero no abrir de nuevo una previamente visitada.

**Mejora:** corregir primero la promesa del producto. Para un modo campamento útil,
definir datos necesarios offline, almacenamiento segregado por cuenta, recuperación
y revocación. No restaurar la caché HTML compartida que comprometía privacidad.

### 12. P2 — La estrategia de pruebas deja huecos de contrato

**Dónde:** `tests/tenant-pages.test.mjs:23`, `.github/workflows/ci.yml:19`.

31 de los 49 archivos de pruebas compilan componentes con SWC y usan VM/dobles.
Hay verificaciones útiles, pero varios builders aceptan cualquier `select` y no
validan columnas. Eso permite que el problema de `assigned_participant_id` pase
las pruebas de páginas. CI incluye pruebas SQL, pero falta comprobar que las
consultas actuales de la app funcionan contra ese esquema. No hay suite de
navegador real en el flujo CI revisado.

**Mejora:** conservar pruebas unitarias útiles y agregar pocos recorridos críticos
con navegador y base reales: dos cuentas, dos clubes, roles, pérdida de conexión,
concurrencia y entrega. Convertir estas reproducciones en regresiones que exijan
el comportamiento corregido al implementar cada arreglo.

### 13. P2 — La cascada visual dificulta mantener y verificar la interfaz

**Dónde:** `app/layout.tsx:2`, `app/dark-theme.css`, `app/polymet-theme.css`.

Se contaron **41 archivos CSS**, **40 imports CSS globales** en el layout,
**468.991 bytes de CSS fuente** y **3.373 apariciones de `!important`**.
`dark-theme.css` aporta 213.415 bytes y 1.806 `!important`.
Son métricas de fuente, no bytes transferidos por la red. No se atribuye una
latencia concreta sin medirla. La cascada acumulada sí hace difícil saber qué
regla gana y permite regresiones como el contraste medido en el login.

**Mejora:** consolidar por componente y tokens manteniendo pruebas visuales de
claro/oscuro, estados y móvil. Retirar capas reemplazadas de forma gradual.

## Simplificaciones con retorno claro

- `delete:` `app/home-setup.tsx` (139 líneas) y `app/setup-form.tsx` (80 líneas)
  forman un flujo antiguo sin referencia desde las rutas activas encontradas.
  Retirarlo junto con pruebas obsoletas tras confirmar el flujo vigente.
- `shrink:` registro de push y conversión de claves duplicados entre
  `notification-controls.tsx` y `announcement-manager.tsx`. Compartir ese flujo
  existente para corregir sus dos consumidores a la vez.
- `shrink:` agrupar CSS vigente por componente y eliminar capas sustituidas,
  midiendo regresiones. No hay una cifra de borrado segura sin verificar selectores.

Potencial comprobable de código legado: 219 líneas de producto candidatas a
retirar; no se identificó una dependencia completa eliminable con evidencia.

## Decisiones de producto y operación pendientes

- Definir quién puede leer teléfonos, contactos de emergencia y notas médicas.
  La política `tenant_read` revisada concede lectura de las filas del camporee a
  sus miembros activos; los permisos de módulo controlan escritura. Esto requiere
  una decisión explícita de privacidad, no prueba de acceso entre clubes.
- Comprobar recuperación de respaldos de base y archivos en un entorno aislado.
  Un repositorio Git no recupera los registros operativos borrados.
- Definir el recorrido principal del campamento: programa de hoy, asistencia,
  pendientes, emergencias y cambios recientes, con las condiciones sin red claras.
- Definir seguimiento de errores y entrega: correlación por operación, fallos de
  sincronización y avisos no entregados, evitando registrar datos sensibles.

## Orden para mejorar la app

1. **Integridad:** migración de tareas, transacción de actividades y concurrencia
   de asistencia. Salida: ningún fallo inyectado pierde el estado anterior.
2. **Recuperación:** cola offline resoluble y entregas push durables. Salida:
   recuperar conflicto, pérdida de respuesta e interrupción de worker.
3. **Exactitud:** resúmenes SQL y consumo de inventario definido. Salida: cifras
   verificadas con volúmenes altos y productos compartidos entre comidas.
4. **Uso real:** zoom, contraste, áreas táctiles y promesas offline coherentes.
   Salida: recorridos críticos completos en Android, iPhone y teclado.
5. **Mantenimiento:** tipos de base, pruebas de contrato/navegador y consolidación
   visual gradual. Salida: una modificación de esquema o estilo incorrecta falla
   en CI antes de llegar al usuario.

## Evidencia y límites

```sh
npm test
npm run check
npm audit
node --experimental-strip-types --test scripts/audit-critical-flows.mjs
```

- Suite existente: 286 aprobadas. TypeScript correcto. `npm audit`: cero avisos.
- Reproducciones: 7 de 7 observaron los defectos esperados. Usan código real y
  controlan las respuestas de servicios externos; no son ensayos de producción.
- Navegador: login real, árbol accesible, viewport, colores y tamaños calculados.
  No había una sesión de prueba para recorrer las pantallas privadas en navegador.
- SQL real: Docker no respondió. El conector Supabase requirió una conexión no
  disponible; la API con clave pública devolvió permiso denegado a consultas con
  `limit=0`. No se obtuvieron datos de personas ni se probó la base con privilegios.
- No se ejecutó un ataque contra usuarios reales ni una prueba de carga del servicio.
  Las conclusiones de concurrencia y límites de filas corresponden a los escenarios
  controlados indicados. No hay evidencia en este ensayo para declarar una fuga
  entre organizaciones o certificar la seguridad del entorno desplegado.
