export function closingProgress(tasks: { phase: string; status: string }[], inventory: { returned: boolean }[]) {
  const closing = tasks.filter(task => task.phase === "after" && task.status !== "cancelled");
  const returned = inventory.filter(item => item.returned).length;
  const inventoryComplete = inventory.length > 0 && returned === inventory.length;
  return {
    completed: closing.filter(task => task.status === "done").length,
    total: closing.length,
    inventoryPercent: inventory.length ? Math.min(inventoryComplete ? 100 : 99, Math.round(returned / inventory.length * 100)) : 0,
    inventoryTotal: inventory.length,
    inventoryComplete,
  };
}
