# Auditoría de carga y navegación — 5 de octubre de 2026

## Resultado y alcance

Revisión en Chrome de localhost:3002, con la sesión de administrador existente y los datos disponibles. Los 19 destinos recorridos abrieron sin mostrar la pantalla de error: Programa, Tareas, Más, Competencias, Avisos, Pases de lista, Comidas, Participantes, Listas, Inventario, Presupuesto, Documentos, Emergencia, Apuntes, Ajustes, Usuarios y permisos, Perfil, Buscar y Sin conexión. Inicio también se inspeccionó.

Se comprobó la apertura y el cierre de 13 formularios: actividades del programa, tareas, competencias, avisos, pases de lista, comidas, participantes, listas, inventario, movimientos de presupuesto, documentos, contactos de emergencia y apuntes. Se conservaron los registros existentes; esta revisión no prueba todas las operaciones de escritura contra Supabase ni todos los roles de usuario.

## Tiempos observados

- Las visitas completas a los destinos tardaron aproximadamente entre 1 y 2,6 segundos en desarrollo. Parte de ese tiempo corresponde al arranque, la compilación y la herramienta de inspección; no son métricas de producción.
- Desde Más, la apertura de Competencias hasta disponer de «Agregar actividad» tardó aproximadamente 0,8 segundos.
- La comprobación de apertura de formularios tardó aproximadamente entre 0,55 y 1,22 segundos, incluida la interacción y la inspección automatizadas.
- En una ventana de 390 × 844, Nueva actividad no produjo desplazamiento horizontal y la acción Guardar permaneció dentro de la pantalla.

## Problemas corregidos

1. **Datos lentos convertidos en ceros:** Inicio descartaba las consultas después de 1,4 segundos y usaba listas vacías. Ahora espera las consultas paralelas, permite reintentos y comunica los errores de carga mediante la pantalla de recuperación.
2. **Refrescos innecesarios:** sincronizar una cola vacía emitía el mismo evento que sincronizar cambios reales. Ahora solo se emite cuando una cola con cambios termina de vaciarse.
3. **Respuesta durante la carga:** se añadió un estado de carga general reutilizando el panel existente, para que las rutas sin su propio indicador muestren progreso mientras esperan datos.
4. **Nueva actividad:** se quitó Lugar del formulario de creación en Competencias y Programa. Se comprobó en Chrome el formulario de Programa mostrado en la captura del usuario. Al editar se mantiene el campo y, si se omite, la ubicación anterior se conserva.

## Internet y recuperación

Las pruebas simulan consultas lentas, errores del servidor, la sincronización de cambios pendientes, la apertura de una página guardada sin internet y la recuperación de ilustraciones desde caché. También comprueban que un error de sincronización conserve la cola para reintentar. El guardado de Nueva actividad sin Lugar y la conservación de una ubicación existente al editar se verificaron ejecutando el formulario con un cliente Supabase simulado.

El service worker se desactiva deliberadamente en desarrollo. No se realizó una desconexión física ni una emulación de red en Chrome; el control disponible no permite esa emulación. Estas pruebas no equivalen a una validación offline completa en un teléfono. En producción, la apertura sin internet depende de las copias almacenadas; una pantalla nunca guardada necesita conexión. Los cambios de autenticación, las cargas de archivos y los avisos push reales tampoco se validaron en esta revisión.

## Verificación

- `npm.cmd test`: 51 pruebas correctas.
- `npm.cmd run check`: correcto.
- `npm.cmd run build`: correcto.
- Revisión de código: sin fallos importantes en los cambios de esta auditoría.
