# Programa oficial de Legado 2026

El programa general de la Asociación Dominicana del Norte se conserva en
`data/programa-legado-2026.json`. La fuente es el PDF aportado por el organizador,
revisado en sus cuatro páginas. El archivo de datos registra su nombre y SHA-256.

Son 45 bloques y 68 contenidos. Las avanzadas del 3 al 5 de noviembre tienen una
franja diaria de 17:00 a 23:00. El programa principal va del 6 al 9 de noviembre
de 2026, en Guazumal, Santiago. Todas las fechas usan `America/Santo_Domingo`.

Los contenidos de un bloque se conservan en su descripción. El PDF no indica
sus subhorarios y no se inventan horas finales. Cada bloque genera un aviso al
comenzar, con sus contenidos, hora local y lugar; tocarlo abre la actividad.
Los toques de queda de medianoche se almacenan en la fecha real siguiente y su
descripción indica la jornada que cierran. Los lugares combinados conservan
la ambigüedad del documento. No se asignan responsables que no figuran en él.

## Importación

El generador produce SQL para el camporee elegido, sin credenciales ni acceso
automático a una base de datos:

```sh
node scripts/import-legado-program.mjs --camporee-id <UUID> > /tmp/programa-legado.sql
```

Revisar el destino y ejecutar el SQL con una conexión autorizada. La transacción
comprueba fechas y zona horaria, conserva registros existentes y usa IDs
deterministas por camporee y fila fuente. Repetirla no duplica ni sobrescribe los
eventos importados, incluso si luego se editaron. También evita insertar un
evento existente con el mismo nombre e inicio. Añade Programa a la navegación
solo si queda una plaza libre; no reemplaza los paneles seleccionados.

La importación no modifica Competencias ni los menús de Comidas. Las
notificaciones usan el cron existente `camporee-activity-start-reminders` y
requieren que cada dispositivo esté suscrito a este camporee. Las actividades
históricas no generan avisos retroactivos fuera de la ventana normal de inicio.

## Comprobación

Comparar las 45 filas guardadas con los IDs, horarios, títulos, lugares y
descripciones del JSON. Comprobar que el cron por minuto está activo y sus
respuestas recientes son satisfactorias. No se necesitan avisos de prueba a
los participantes para validar la importación.
