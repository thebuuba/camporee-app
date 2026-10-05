export function camporeePhase(status: string): "before" | "during" | "after" {
  return status === "active" ? "during" : status === "finished" || status === "archived" ? "after" : "before";
}

export function preparationProgress(tasks: { phase: string; status: string }[]) {
  const preparation = tasks.filter(task => task.phase === "before" && task.status !== "cancelled");
  const completed = preparation.filter(task => task.status === "done").length;
  return { completed, total: preparation.length, percent: preparation.length ? Math.round(completed / preparation.length * 100) : 0 };
}

export function preparationCountdown(startsOn: string, now: number) {
  // El camporee usa fechas civiles de República Dominicana (UTC−4, sin horario de verano).
  const remaining = Math.max(0, Math.floor((Date.parse(`${startsOn}T00:00:00-04:00`) - now) / 60_000));
  return { days: Math.floor(remaining / 1440), hours: Math.floor(remaining / 60) % 24, minutes: remaining % 60 };
}
