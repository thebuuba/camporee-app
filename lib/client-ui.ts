export function confirmRemoval(label = "este elemento") {
  return window.confirm(`¿Eliminar ${label}? Esta acción se sincronizará con todo el equipo.`);
}

type MutationError = { message?: string; details?: string; hint?: string; code?: string } | null | undefined;

export function mutationErrorMessage(error: unknown, fallback = "No se pudo guardar el cambio.") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const value = error as MutationError;
    if (value?.message) return value.message;
    if (value?.details) return value.details;
  }
  return fallback;
}

export function reportMutationError(error: unknown, fallback = "No se pudo guardar el cambio. Inténtalo otra vez.") {
  const message = mutationErrorMessage(error, fallback);
  console.error("Camporee mutation failed", error);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("camporee:mutation-error", { detail: { message } }));
  }
  return message;
}

export function reportMutationSuccess(message = "Cambio guardado.") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("camporee:mutation-success", { detail: { message } }));
  }
}
