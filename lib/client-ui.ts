export function confirmRemoval(label = "este elemento") {
  return window.confirm(`¿Eliminar ${label}? Esta acción se sincronizará con todo el equipo.`);
}
