export type ThemePreference = 'light' | 'dark' | 'warm' | 'system';
export const themeStorageKey = 'camporee-theme';
export const paletteStorageKey = 'camporee-palette';

export const themePalettes = {
  original: { label: 'Original', swatch: '#fa8943', light: { bg: '#fdf8f5', soft: '#fde9dd', accent: '#a33d13', text: '#a33d13' }, dark: { bg: '#000000', soft: '#3b281e', accent: '#b44718', text: '#ffad7a' } },
  pink: { label: 'Rosado', swatch: '#de4f99', light: { bg: '#fff7fb', soft: '#fbe4ef', accent: '#ae2468', text: '#ae2468' }, dark: { bg: '#000000', soft: '#38202e', accent: '#a42b66', text: '#ffaad3' } },
  green: { label: 'Verde', swatch: '#32976a', light: { bg: '#f5fbf6', soft: '#e1f2e7', accent: '#176b48', text: '#176b48' }, dark: { bg: '#000000', soft: '#203329', accent: '#246645', text: '#96d7ab' } },
  yellow: { label: 'Amarillo', swatch: '#e9b82f', light: { bg: '#fffdf2', soft: '#fff1bd', accent: '#765600', text: '#765600' }, dark: { bg: '#000000', soft: '#352f20', accent: '#6e5519', text: '#f2d779' } },
  blue: { label: 'Azul', swatch: '#4b85d9', light: { bg: '#f5f8ff', soft: '#e3edfc', accent: '#225cb3', text: '#225cb3' }, dark: { bg: '#000000', soft: '#20303e', accent: '#285eae', text: '#a9cfff' } },
  purple: { label: 'Violeta', swatch: '#9862d1', light: { bg: '#faf6ff', soft: '#eee4fa', accent: '#7340b0', text: '#7340b0' }, dark: { bg: '#000000', soft: '#32273a', accent: '#713fac', text: '#d7b2ed' } },
} as const;
export type ThemePalette = keyof typeof themePalettes;

export function resolvePalette(value: string | null): ThemePalette {
  return value && Object.hasOwn(themePalettes, value) ? value as ThemePalette : 'original';
}

export function resolveTheme(preference: string | null, systemDark: boolean): 'light' | 'dark' | 'warm' {
  if (preference === 'warm') return 'warm';
  return preference === 'dark' || (preference !== 'light' && systemDark) ? 'dark' : 'light';
}

// Runs in the head before the first paint, independently of React hydration.
export const themeInitScript = `(()=>{
  let saved=null,palette='original';
  const palettes=${JSON.stringify(themePalettes)};
  try{saved=localStorage.getItem('${themeStorageKey}');const color=localStorage.getItem('${paletteStorageKey}');if(Object.hasOwn(palettes,color))palette=color}catch{}
  const dark=saved==='warm'||saved==='dark'||(saved!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme=dark?'dark':'light';
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.themeTone=saved==='warm'?'warm':theme;
  document.documentElement.dataset.palette=palette;
  document.documentElement.style.colorScheme=theme;
  const colors=palettes[palette][theme];
  Object.entries(colors).forEach(([key,value])=>document.documentElement.style.setProperty('--palette-'+key,value));
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.setAttribute('content',saved==='warm'?'#171412':dark?'#000000':colors.bg));
})();`;
