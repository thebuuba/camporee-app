'use client';

import { useTheme } from './theme-provider';
import type { ThemePreference } from '@/lib/theme';

export default function ThemeSettings() {
  const { preference, setPreference } = useTheme();
  return <section className="polymet-settings-card theme-settings">
    <h2>Apariencia</h2>
    <label htmlFor="theme-preference">Tema de la aplicación</label>
    <select id="theme-preference" value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
      <option value="system">Según el dispositivo</option>
      <option value="light">Claro</option>
      <option value="warm">Oscuro cálido</option>
      <option value="dark">Negro</option>
    </select>
    <p>Se guarda en este dispositivo y se aplica a todas las pantallas.</p>
  </section>;
}
