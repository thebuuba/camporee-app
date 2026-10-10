'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { resolveTheme, resolvePalette, themePalettes, themeStorageKey, paletteStorageKey, type ThemePreference, type ThemePalette } from '@/lib/theme';

const ThemeContext = createContext({
  preference: 'system' as ThemePreference,
  dark: false,
  palette: 'original' as ThemePalette,
  setPreference: (_preference: ThemePreference) => {},
  setPalette: (_palette: ThemePalette) => {},
});

export function useTheme() { return useContext(ThemeContext); }

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [dark, setDark] = useState(false);
  const [palette, setPaletteState] = useState<ThemePalette>('original');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let current: ThemePreference = 'system';
    let currentPalette: ThemePalette = 'original';
    const read = () => {
      try {
        const saved = localStorage.getItem(themeStorageKey);
        current = saved === 'dark' || saved === 'warm' || saved === 'light' ? saved : 'system';
        currentPalette = resolvePalette(localStorage.getItem(paletteStorageKey));
      } catch {}
      setPreferenceState(current);
      setPaletteState(currentPalette);
      apply(current);
    };
    const apply = (value: ThemePreference) => {
      const theme = resolveTheme(value, media.matches);
      document.documentElement.dataset.theme = theme === 'warm' ? 'dark' : theme;
      document.documentElement.dataset.themeTone = theme;
      document.documentElement.dataset.palette = currentPalette;
      document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
      const colors = themePalettes[currentPalette][theme === 'light' ? 'light' : 'dark'];
      Object.entries(colors).forEach(([key, value]) => document.documentElement.style.setProperty(`--palette-${key}`, value));
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', theme === 'warm' ? '#171412' : theme === 'dark' ? '#000000' : colors.bg));
      setDark(theme !== 'light');
    };
    const onSystemChange = () => apply(current);
    const onStorage = (event: StorageEvent) => { if (event.key === themeStorageKey || event.key === paletteStorageKey || event.key === null) read(); };
    const onPreference = (event: Event) => {
      current = (event as CustomEvent<ThemePreference>).detail;
      setPreferenceState(current);
      apply(current);
    };
    const onPalette = (event: Event) => {
      currentPalette = resolvePalette((event as CustomEvent<ThemePalette>).detail);
      setPaletteState(currentPalette);
      apply(current);
    };
    read();
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('camporee-theme-change', onPreference);
    window.addEventListener('camporee-palette-change', onPalette);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('camporee-theme-change', onPreference);
      window.removeEventListener('camporee-palette-change', onPalette);
    };
  }, []);

  function setPreference(value: ThemePreference) {
    try { localStorage.setItem(themeStorageKey, value); } catch {}
    window.dispatchEvent(new CustomEvent('camporee-theme-change', { detail: value }));
  }

  function setPalette(value: ThemePalette) {
    try { localStorage.setItem(paletteStorageKey, value); } catch {}
    window.dispatchEvent(new CustomEvent('camporee-palette-change', { detail: value }));
  }

  return <ThemeContext.Provider value={{ preference, dark, palette, setPreference, setPalette }}>{children}</ThemeContext.Provider>;
}
