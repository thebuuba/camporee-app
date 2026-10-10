import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('los textos de la paleta oscura mantienen contraste legible', async () => {
  const css = await readFile(new URL('../app/dark-theme.css', import.meta.url), 'utf8');
  const palette = block => Object.fromEntries([...block.matchAll(/(--dark-[\w-]+):(#\w{6})/g)].map(match => [match[1], match[2]]));
  const base = palette(css.slice(0, css.indexOf('}')));
  const warm = palette(css.match(/:root\[data-theme="dark"\]\[data-theme-tone="warm"\]\{([^}]+)\}/)[1]);
  for (const colors of [base, { ...base, ...warm }]) {
    for (const background of ['bg', 'surface', 'surface-soft']) {
      assert.ok(contrast(colors[`--dark-${background}`], colors['--dark-line']) >= 3, `borde de campo sobre ${background}`);
      for (const foreground of ['text', 'muted', 'orange-text', 'green-text', 'blue-text', 'red-text', 'gold-text', 'purple-text']) {
        assert.ok(contrast(colors[`--dark-${background}`], colors[`--dark-${foreground}`]) >= 4.5, `${foreground} sobre ${background}`);
      }
    }
    for (const accent of ['orange', 'green', 'blue', 'red', 'gold', 'purple']) {
      assert.ok(contrast(colors[`--dark-${accent}`], colors['--dark-text']) >= 4.5, `texto sobre ${accent}`);
    }
  }
});

test('el tema respeta la elección guardada y usa el sistema como valor inicial', async () => {
  const { resolveTheme } = await import('../lib/theme.ts');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('warm', false), 'warm');
  assert.equal(resolveTheme('warm', true), 'warm');
  assert.equal(resolveTheme('light', true), 'light');
  for (const preference of [null, 'system', 'invalid']) {
    assert.equal(resolveTheme(preference, true), 'dark');
    assert.equal(resolveTheme(preference, false), 'light');
  }
});

test('el proveedor sincroniza el perfil, los ajustes, el sistema y otras pestañas', async () => {
  const theme = await import('../lib/theme.ts');
  const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
  await loadBindings();
  const { code } = await transform(await readFile(new URL('../app/components/theme-provider.tsx', import.meta.url), 'utf8'), {
    filename: 'theme-provider.tsx', jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const states = [], effects = [], listeners = new Map();
  let cursor = 0, saved = null, savedPalette = null, mediaListener;
  const root = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
  const media = { matches: false, addEventListener: (_name, callback) => { mediaListener = callback; }, removeEventListener: () => { mediaListener = undefined; } };
  const modules = {
    '@/lib/theme': theme,
    react: { createContext: () => ({ Provider: 'provider' }), useContext: () => {}, useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; }, useEffect: callback => effects.push(callback) },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => modules[name],
    document: { documentElement: root, querySelectorAll: () => [] },
    localStorage: { getItem: key => key === theme.paletteStorageKey ? savedPalette : saved, setItem: (key, value) => { if (key === theme.paletteStorageKey) savedPalette = value; else saved = value; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { matchMedia: () => media, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name), dispatchEvent: event => listeners.get(event.type)?.(event) },
  });
  const render = () => { cursor = 0; return module.exports.default({ children: 'app' }).props.value; };
  render(); const cleanup = effects[0]();
  assert.equal(root.dataset.theme, 'light');
  media.matches = true; mediaListener();
  assert.equal(root.dataset.theme, 'dark');
  render().setPreference('light');
  assert.equal(saved, 'light');
  assert.equal(render().dark, false);
  mediaListener();
  assert.equal(root.dataset.theme, 'light', 'el sistema no debe sustituir una elección explícita');
  saved = 'dark'; listeners.get('storage')({ key: theme.themeStorageKey });
  assert.equal(render().dark, true);
  assert.equal(render().preference, 'dark');
  render().setPreference('warm');
  assert.equal(saved, 'warm');
  assert.equal(render().dark, true);
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.themeTone, 'warm');
  assert.equal(root.style.colorScheme, 'dark');
  mediaListener();
  assert.equal(root.dataset.themeTone, 'warm');
  saved = 'warm'; listeners.get('storage')({ key: theme.themeStorageKey });
  assert.equal(render().preference, 'warm');
  render().setPreference('system');
  media.matches = false; mediaListener();
  assert.equal(root.dataset.theme, 'light');
  render().setPalette('pink');
  assert.equal(savedPalette, 'pink');
  assert.equal(render().palette, 'pink');
  assert.equal(root.dataset.palette, 'pink');
  assert.equal(root.dataset.theme, 'light');
  savedPalette = 'green'; listeners.get('storage')({ key: theme.paletteStorageKey });
  assert.equal(render().palette, 'green');
  media.matches = true; mediaListener();
  assert.equal(root.dataset.palette, 'green');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style['--palette-accent'], theme.themePalettes.green.dark.accent);
  savedPalette = 'invalid'; listeners.get('storage')({ key: theme.paletteStorageKey });
  assert.equal(render().palette, 'original');
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(mediaListener, undefined);
});

test('el tema se aplica antes de hidratar incluso si el almacenamiento está bloqueado', async () => {
  const { themeInitScript } = await import('../lib/theme.ts');
  for (const [saved, systemDark, blocked, expected] of [
    ['warm', false, false, 'warm'], ['warm', true, false, 'warm'],
    ['dark', false, false, 'dark'], ['light', true, false, 'light'],
    [null, true, false, 'dark'], [null, false, false, 'light'],
    [null, true, true, 'dark'], ['invalid', true, false, 'dark'],
  ]) {
    const root = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
    const meta = { setAttribute: (_name, value) => { meta.content = value; } };
    vm.runInNewContext(themeInitScript, {
      document: { documentElement: root, querySelectorAll: () => [meta] },
      window: { matchMedia: () => ({ matches: systemDark }) },
      localStorage: { getItem: () => { if (blocked) throw new Error('blocked'); return saved; } },
    });
    assert.equal(root.dataset.theme, expected === 'warm' ? 'dark' : expected);
    assert.equal(root.dataset.themeTone, expected);
    assert.equal(root.style.colorScheme, expected === 'warm' ? 'dark' : expected);
    assert.equal(meta.content, expected === 'warm' ? '#171412' : expected === 'dark' ? '#000000' : '#fdf8f5');
  }
});


test('cada color se restaura antes de pintar en claro, negro, calido y sistema', async () => {
  const { themeInitScript, themePalettes, themeStorageKey, paletteStorageKey } = await import('../lib/theme.ts');
  for (const palette of Object.keys(themePalettes)) {
    for (const mode of ['light', 'dark', 'warm', 'system']) {
      for (const systemDark of [true, false]) {
        const root = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
        const meta = { setAttribute: (_name, value) => { meta.content = value; } };
        vm.runInNewContext(themeInitScript, {
          document: { documentElement: root, querySelectorAll: () => [meta] },
          window: { matchMedia: () => ({ matches: systemDark }) },
          localStorage: { getItem: key => key === themeStorageKey ? mode : key === paletteStorageKey ? palette : null },
        });
        const dark = mode === 'warm' || mode === 'dark' || (mode === 'system' && systemDark);
        assert.equal(root.dataset.theme, dark ? 'dark' : 'light');
        assert.equal(root.dataset.palette, palette);
        assert.equal(root.style.colorScheme, dark ? 'dark' : 'light');
        assert.equal(root.style['--palette-accent'], themePalettes[palette][dark ? 'dark' : 'light'].accent);
        assert.equal(meta.content, dark ? mode === 'warm' ? '#171412' : '#000000' : themePalettes[palette].light.bg);
      }
    }
  }
});


test('todas las paletas mantienen contraste en textos, botones y campos', async () => {
  const { themePalettes } = await import('../lib/theme.ts');
  const css = await readFile(new URL('../app/color-theme.css', import.meta.url), 'utf8');
  const colors = Object.fromEntries([...css.matchAll(/(--dark-[\w-]+):(#\w{6})/g)].map(match => [match[1], match[2]]));
  for (const [name, palette] of Object.entries(themePalettes)) {
    const lightText = ['text', 'muted', 'green-text', 'red-text', 'blue-text', 'gold-text', 'purple-text'].map(key => colors[`--dark-${key}`]);
    for (const background of [palette.light.bg, palette.light.soft, '#ffffff']) {
      for (const foreground of [...lightText, palette.light.text]) assert.ok(contrast(background, foreground) >= 4.5, `${name}: texto claro`);
      assert.ok(contrast(background, colors['--dark-line']) >= 3, `${name}: borde claro`);
    }
    for (const background of ['#000000', '#121212', '#1e1e1e', '#171412', '#231e1b', '#2e2723', palette.dark.soft]) {
      for (const foreground of ['#f5ece6', '#bdbdbd', palette.dark.text]) assert.ok(contrast(background, foreground) >= 4.5, `${name}: texto oscuro`);
    }
    assert.ok(contrast(palette.light.accent, '#ffffff') >= 4.5, `${name}: bot?n claro`);
    assert.ok(contrast(palette.dark.accent, '#f5ece6') >= 4.5, `${name}: bot?n oscuro`);
  }
});
