type PermissionMap = Record<string, boolean>;
type ReminderMessage = { title: string; body: string; url: string };
type PermissionMeta = { label: string; url: string; weight: number };

const permissionMeta: Record<string, PermissionMeta> = {
  tasks: { label: "tareas", url: "/tasks", weight: 100 },
  schedule: { label: "programa", url: "/program", weight: 95 },
  participants: { label: "participantes", url: "/more/participants", weight: 90 },
  inventory: { label: "inventario", url: "/more/inventory", weight: 85 },
  meals: { label: "comidas", url: "/more/meals", weight: 80 },
  finances: { label: "presupuesto", url: "/more/budget", weight: 75 },
  lists: { label: "listas y compras", url: "/more/lists", weight: 70 },
  notes: { label: "notas", url: "/more/notes", weight: 30 },
};

export function editorResponsibilities(permissions: PermissionMap | null | undefined) {
  return Object.entries(permissions ?? {}).filter(([key, enabled]) => enabled === true && permissionMeta[key]).map(([key]) => ({ key, ...permissionMeta[key] })).sort((a, b) => b.weight - a.weight);
}

function naturalList(items: string[]) {
  if (!items.length) return "tus responsabilidades";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function editorMessage(milestone: string, camporeeName: string, permissions: PermissionMap | null | undefined): ReminderMessage {
  const responsibilities = editorResponsibilities(permissions);
  const labels = responsibilities.slice(0, 3).map((item) => item.label);
  const focus = naturalList(labels);
  const extra = responsibilities.length > 3 ? " y otras áreas asignadas" : "";
  const url = responsibilities[0]?.url ?? "/tasks";
  if (milestone === "d10") return { title: "🏕️ Faltan 10 días", body: `Faltan 10 días para ${camporeeName}. Revisa ${focus}${extra} y detecta lo que todavía falta preparar.`, url };
  if (milestone === "d5") return { title: "🔥 Ya casi estamos", body: `Quedan 5 días. Confirma ${focus}${extra} y deja resueltos los pendientes de tus áreas.`, url };
  if (milestone === "d1") return { title: "⛺ Mañana comenzamos", body: `Mañana comienza ${camporeeName}. Deja listos ${focus}${extra} antes de salir.`, url };
  return { title: "🎉 ¡Llegó el día!", body: `¿Estás listo? Hoy comienza ${camporeeName}. Mantén al día ${focus}${extra} durante la operación.`, url };
}

export function messageFor(role: string, milestone: string, camporeeName: string, permissions?: PermissionMap | null, directiveRole?: string | null): ReminderMessage {
  if (directiveRole?.trim()) {
    const cargo = directiveRole.trim();
    const responsibilities: Record<string, { focus: string; url: string }> = {
      'Director/a': { focus: 'la coordinación general, los responsables y el avance del equipo', url: '/' },
      'Subdirector/a': { focus: 'la logística, las tareas pendientes y el apoyo al equipo', url: '/tasks' },
      'Secretario/a': { focus: 'los participantes, la asistencia y la documentación', url: '/more/participants' },
      'Tesorero/a': { focus: 'el presupuesto, los ingresos, los gastos y los pagos pendientes', url: '/more/budget' },
      'Consejero/a': { focus: 'tu unidad, sus participantes y las tareas asignadas', url: '/more/participants' },
    };
    const assigned = editorResponsibilities(permissions);
    const responsibility = Object.hasOwn(responsibilities, cargo) ? responsibilities[cargo] : {
      focus: naturalList(assigned.map((item) => item.label)),
      url: assigned[0]?.url ?? '/tasks',
    };
    const timing: Record<string, { title: string; intro: string }> = {
      d10: { title: '🏕️ Faltan 10 días', intro: `Faltan 10 días para ${camporeeName}.` },
      d5: { title: '🔥 Faltan 5 días', intro: `Quedan 5 días para ${camporeeName}.` },
      d1: { title: '⛺ Mañana comenzamos', intro: `Mañana comienza ${camporeeName}.` },
      d0: { title: '🎉 ¡Llegó el día!', intro: `Hoy comienza ${camporeeName}.` },
    };
    const { title, intro } = timing[milestone] ?? timing.d0;
    return { title, body: `${intro} Como ${cargo}, revisa ${responsibility.focus}.`, url: responsibility.url };
  }
  if (role === "editor") return editorMessage(milestone, camporeeName, permissions);
  if (role === "viewer") {
    if (milestone === "d10") return { title: "🏕️ Faltan 10 días", body: `Cada vez falta menos para ${camporeeName}. Consulta el programa y los avisos para mantenerte al día.`, url: "/program" };
    if (milestone === "d5") return { title: "🔥 Ya casi estamos", body: `Solo faltan 5 días para ${camporeeName}. Revisa el programa y cualquier aviso importante.`, url: "/program" };
    if (milestone === "d1") return { title: "⛺ Mañana es el camporee", body: `Mañana comienza ${camporeeName}. Revisa el programa, la hora de salida y los últimos avisos.`, url: "/program" };
    return { title: "🎉 ¡Llegó el día!", body: `¿Estás listo? ${camporeeName} comienza hoy. Abre la app para ver el programa y los avisos del día.`, url: "/program" };
  }
  if (milestone === "d10") return { title: "🏕️ Faltan 10 días", body: `Faltan 10 días para ${camporeeName}. Revisa responsables, tareas, presupuesto y logística general.`, url: "/" };
  if (milestone === "d5") return { title: "🔥 Faltan 5 días", body: "Haz una revisión general: programa, transporte, comidas, inventario, participantes y pendientes.", url: "/" };
  if (milestone === "d1") return { title: "⛺ Falta 1 día", body: `Mañana comienza ${camporeeName}. Confirma que logística, participantes, programa, presupuesto e inventario estén listos.`, url: "/" };
  return { title: "🎉 ¡Llegó el día!", body: `¿Están listos? ${camporeeName} comienza hoy. Abre Inicio y coordina la operación del camporee.`, url: "/" };
}
