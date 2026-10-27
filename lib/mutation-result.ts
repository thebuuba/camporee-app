type MutationResult = { data?: unknown; error?: unknown; status?: number };

// A successful HTTP response alone does not prove that RLS allowed the expected row.
export function mutationProblem(result: MutationResult, expectedIds?: string[], identityKey = 'id') {
  if (result.error) return result.error;
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  const ids = rows.map((row: any) => row?.[identityKey]);
  if (!ids.length || ids.some(id => !id) || (expectedIds && (ids.length !== expectedIds.length || expectedIds.some(id => !ids.includes(id))))) {
    return new Error('No se confirmó el cambio esperado. Actualiza la pantalla y revisa tus permisos.');
  }
  return null;
}

export function mutationNotice(status: number | undefined, confirmedMessage: string) {
  return status === 202 ? 'Cambio pendiente de sincronización.' : confirmedMessage;
}
