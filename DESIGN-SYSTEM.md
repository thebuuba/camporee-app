# Camporee App — Design System

Este archivo es la referencia obligatoria para cualquier cambio visual futuro, incluyendo cambios realizados por IA.

## Objetivo visual

La app debe sentirse como una aplicación móvil editorial y amigable, no como un dashboard SaaS. El diseño toma como referencia interfaces con fondo cálido, tarjetas redondeadas, grandes bloques pastel, pocos bordes visibles y jerarquía tipográfica fuerte.

## Fuente de verdad

Los tokens y reglas globales viven en `app/design-system.css`, que se importa al final de los estilos globales desde `app/layout.tsx`. Esto es intencional: debe prevalecer sobre estilos heredados cuando exista conflicto.

Antes de crear CSS nuevo, reutilizar primero las variables y clases existentes de `design-system.css`.

## Reglas obligatorias

1. Fondo general: gris cálido/off-white, nunca blanco puro como fondo principal.
2. Tarjetas: radios grandes, entre 22 y 28 px.
3. Sombras: mínimas. Preferir bloques planos y contraste por color antes que sombras fuertes.
4. Tarjetas de resumen y accesos: usar la rotación pastel existente: peach, lilac, sage y yellow-soft.
5. No introducir colores nuevos sin una razón funcional clara. Usar variables `--ds-*`.
6. Botón primario: amarillo `--ds-yellow` con texto oscuro.
7. Las acciones no deben parecer botones corporativos o paneles administrativos. Deben sentirse táctiles, simples y móviles.
8. Evitar exceso de degradados, glassmorphism y transparencias.
9. Mantener iconografía simple con `lucide-react` y contenedores redondeados.
10. La barra inferior es fija y no debe flotar ni incluir botón central `+`.
11. Cada pantalla debe tener máximo un bloque visual dominante/hero.
12. Las listas deben usar filas limpias, planas y redondeadas, con chevron discreto cuando corresponda.
13. No cambiar la estructura funcional ni la lógica de datos solo para conseguir un efecto visual.
14. Todos los cambios del rediseño deben desarrollarse primero en la rama `redesign-v2` hasta aprobación.

## Tokens principales

- `--ds-bg`: fondo principal.
- `--ds-surface`: superficie neutra.
- `--ds-ink`: texto principal.
- `--ds-muted`: texto secundario.
- `--ds-yellow`: CTA principal.
- `--ds-peach`, `--ds-lilac`, `--ds-sage`, `--ds-yellow-soft`: tarjetas/accesos.
- `--ds-radius-card`: radio estándar de tarjeta.
- `--ds-radius-card-lg`: tarjeta o sección grande.
- `--ds-radius-control`: inputs y botones.

## Clases existentes que forman parte del sistema

- `.ios-card`: tarjeta neutra base.
- `.stat`: tarjeta de resumen pastel.
- `.section-card`: sección grande blanca.
- `.more-card`: tarjeta de módulo pastel.
- `.panel-row`: fila/lista.
- `.action`: acción rápida pastel.
- `.primary-btn`: CTA amarillo.

## Criterio para futuras IA

Si una instrucción visual es ambigua, preservar este sistema antes que improvisar un estilo nuevo. Cuando se agregue una pantalla nueva, debe parecer parte de la misma app incluso sin ver ninguna captura de referencia.
