export const NAVIGATION_PANELS = [
  {id:'inventory',label:'Inventario',href:'/more/inventory'},
  {id:'tasks',label:'Tareas',href:'/tasks'},
  {id:'program',label:'Programa',href:'/program'},
  {id:'activities',label:'Competencias',href:'/more/activities'},
  {id:'announcements',label:'Avisos',href:'/more/announcements'},
  {id:'attendance',label:'Asistencia',href:'/more/attendance'},
  {id:'meals',label:'Comidas',href:'/more/meals'},
  {id:'participants',label:'Personas',href:'/more/participants'},
  {id:'lists',label:'Listas',href:'/more/lists'},
  {id:'budget',label:'Presupuesto',href:'/more/budget'},
  {id:'documents',label:'Documentos',href:'/more/documents'},
  {id:'emergency',label:'Emergencia',href:'/more/emergency'},
  {id:'notes',label:'Apuntes',href:'/more/notes'},
  {id:'songs',label:'Canciones',href:'/more/songs'},
] as const;
export type NavigationPanelId = typeof NAVIGATION_PANELS[number]['id'];
export const DEFAULT_NAVIGATION_PANELS: NavigationPanelId[] = ['inventory','tasks'];
export const MAX_NAVIGATION_PANELS = 3;

export function normalizeNavigationPanels(value: unknown): NavigationPanelId[] {
  return Array.isArray(value) && value.length <= MAX_NAVIGATION_PANELS
    && new Set(value).size === value.length
    && value.every(id => NAVIGATION_PANELS.some(panel => panel.id === id))
    ? [...value] : [...DEFAULT_NAVIGATION_PANELS];
}
