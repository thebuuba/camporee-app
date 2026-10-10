export type ThemePreference = 'light' | 'dark' | 'warm' | 'system';
export const themeStorageKey = 'camporee-theme';

export function resolveTheme(preference: string | null, systemDark: boolean): 'light' | 'dark' | 'warm' {
  if (preference === 'warm') return 'warm';
  return preference === 'dark' || (preference !== 'light' && systemDark) ? 'dark' : 'light';
}

// Runs in the head before the first paint, independently of React hydration.
export const themeInitScript = `(()=>{
  let saved=null;
  try{saved=localStorage.getItem('${themeStorageKey}')}catch{}
  const dark=saved==='warm'||saved==='dark'||(saved!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme=dark?'dark':'light';
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.themeTone=saved==='warm'?'warm':theme;
  document.documentElement.style.colorScheme=theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.setAttribute('content',saved==='warm'?'#171412':dark?'#000000':'#fdf8f5'));
})();`;
