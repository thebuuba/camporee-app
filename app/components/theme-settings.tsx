'use client';

import { useTheme } from './theme-provider';
import { themePalettes, type ThemePreference, type ThemePalette } from '@/lib/theme';

export default function ThemeSettings() {
  const { preference, palette, setPreference, setPalette } = useTheme();
  return <section className="polymet-settings-card theme-settings">
    <h2>Apariencia</h2>
    <label htmlFor="theme-preference">Tema de la aplicación</label>
    <select id="theme-preference" value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
      <option value="system">Según el dispositivo</option>
      <option value="light">Claro</option>
      <option value="warm">Oscuro cálido</option>
      <option value="dark">Negro</option>
    </select>
    <fieldset className="theme-palette-picker">
      <legend>Color de la aplicación</legend>
      <div className="theme-palette-grid">
        {(Object.entries(themePalettes) as [ThemePalette, typeof themePalettes[ThemePalette]][]).map(([key, color]) =>
          <label className="theme-palette-option" key={key}>
            <input type="radio" name="theme-palette" value={key} checked={palette === key} onChange={() => setPalette(key)} />
            <span className="theme-palette-tile"><span className="theme-palette-dot" style={{ background: color.swatch }} aria-hidden="true" /><span>{color.label}</span></span>
          </label>
        )}
      </div>
    </fieldset>
    <p>Se guarda en este dispositivo y se aplica a todas las pantallas.</p>
  </section>;
}
