/** Published defaults for every new camporee and older offline copies. */
export const CAMPOREE_RULES = [
  'Respetar a los directores, consejeros, dirigentes y compañeros.',
  'No decir palabras obscenas.',
  'No pelear ni discutir.',
  'Respetar las pertenencias ajenas.',
  'Cumplir los horarios establecidos.',
  'Mantener su carpa organizada.',
  'No abandonar el área de campamento.',
  'Mantener una actitud reverente durante los cultos.',
  'Evitar las burlas durante las actividades.',
  'No alejarse del grupo.',
  'Bañarse y mantener una buena higiene.',
  'No salir a comer mientras estemos en la capilla.',
  'Respetar las opiniones de los demás.',
  'Respetar el toque de queda.',
] as const;

export const MAX_CAMPOREE_RULES = 60;
export const MAX_RULE_LENGTH = 500;

export function cleanCamporeeRule(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function formatCamporeeRulesForShare(camporeeName: string, rules: readonly string[]): string {
  return `*Reglas del camporee · ${camporeeName}*\n\n${rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')}\n\nCaro y Juan Daniel`;
}
