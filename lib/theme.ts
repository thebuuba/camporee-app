export type ThemePreference = 'light' | 'dark' | 'system';
export const themeStorageKey = 'camporee-theme';

export function resolveTheme(preference: string | null, systemDark: boolean): 'light' | 'dark' {
  return preference === 'dark' || (preference !== 'light' && systemDark) ? 'dark' : 'light';
}

// Runs in the head before the first paint, independently of React hydration.
export const themeInitScript = `(()=>{
  let saved=null;
  try{saved=localStorage.getItem('${themeStorageKey}')}catch{}
  const dark=saved==='dark'||(saved!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme=dark?'dark':'light';
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.setAttribute('content',dark?'#171412':'#fdf8f5'));
})();`;
