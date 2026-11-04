import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildMealMenuDocument } from '../lib/meal-menu.ts';
import { buildMealPrintPage, mealPrintPolicy } from '../lib/meal-print-page.ts';

const nonce = '1234567890abcdef1234567890abcdef';
const back = '/o/00000000-0000-4000-8000-000000000001/c/57ad4342-8b3f-4735-a467-7e04c318a705/more/meals';
const base = buildMealMenuDocument([{ meal_date: '2026-11-07', meal_type: 'breakfast', menu: 'Avena con pan' }], 'Legado');
const html = buildMealPrintPage(base, back, nonce);

function browser(printMode = 'native') {
  const elements = new Map();
  for (const id of ['menu-print-button', 'menu-print-status', 'menu-copy-link', 'menu-print-address']) {
    elements.set(id, { hidden: true, textContent: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, focus() {}, select() {} });
  }
  const events = new Map();
  const timers = new Map();
  let calls = 0, sequence = 0;
  const window = { location: { href: 'https://camporee.test/print/meals' }, addEventListener(name, fn) { events.set(name, fn); } };
  if (printMode !== 'missing') window.print = () => {
    calls++;
    if (printMode === 'throws') throw new Error('Not available');
    if (printMode === 'native') { events.get('beforeprint')?.(); events.get('afterprint')?.(); }
  };
  const document = { getElementById: id => elements.get(id), createElement: () => ({}), head: { appendChild() {} } };
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    document, window, navigator: {},
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    elements, events, timers,
    calls: () => calls,
    click: () => elements.get('menu-print-button').handlers.click(),
    flush: () => { for (const callback of [...timers.values()]) callback(); },
    status: elements.get('menu-print-status'),
  };
}

test('top-level print page preserves the exact approved menu and styles', () => {
  assert.equal(html.match(/<main[\s\S]*?<\/main>/)[0], base.match(/<main[\s\S]*?<\/main>/)[0]);
  assert.equal(html.match(/<style>[\s\S]*?<\/style>/)[0], base.match(/<style>[\s\S]*?<\/style>/)[0]);
  assert.equal((html.match(/Content-Security-Policy/g) ?? []).length, 1);
  assert.equal((html.match(/<script /g) ?? []).length, 1);
  assert.ok(!html.includes('<iframe'));
  assert.ok(html.includes('@media print { .print-controls { display: none !important; } }'));
});

test('script permission is nonce-based, not unsafe-inline or user-controlled', () => {
  assert.ok(mealPrintPolicy(nonce).includes(`script-src 'nonce-${nonce}'`));
  assert.ok(!mealPrintPolicy(nonce).includes("script-src 'unsafe-inline'"));
  for (const value of ['', 'bad" onload="alert(1)', '<script>']) assert.throws(() => mealPrintPolicy(value));
  for (const path of ['//evil.test', 'https://evil.test', '/login', back + '" onclick="alert(1)']) {
    assert.throws(() => buildMealPrintPage(base, path, nonce));
  }
});

test('untrusted names and menus cannot inject scripts into the print page', () => {
  const malicious = buildMealMenuDocument([{ meal_date: '2026-11-07', meal_type: 'breakfast', menu: '</dd><script>window.pwned=1</script>' }], '</title><img src=x onerror=alert(1)>');
  const result = buildMealPrintPage(malicious, back, nonce);
  assert.equal((result.match(/<script /g) ?? []).length, 1);
  assert.ok(!result.includes('<script>window.pwned'));
  assert.ok(!result.includes('<img'));
});

test('print is synchronous in the click and does not auto-print or wait for fonts', () => {
  const page = browser();
  assert.equal(page.calls(), 0);
  page.click();
  assert.equal(page.calls(), 1);
  assert.equal(page.timers.size, 0);
  assert.equal(page.status.hidden, true);
});

test('a silently ignored print call gives visible recovery without disabling retry', () => {
  const page = browser('silent');
  page.click(); page.flush();
  assert.equal(page.status.hidden, false);
  assert.match(page.status.textContent, /no abrió la impresión/);
  page.click();
  assert.equal(page.calls(), 2);
});

test('missing or throwing native print is handled without false success', () => {
  for (const mode of ['missing', 'throws']) {
    const page = browser(mode);
    assert.doesNotThrow(page.click);
    assert.equal(page.status.hidden, false);
    assert.match(page.status.textContent, /Safari/);
    assert.equal(page.timers.size, 0);
  }
});

test('empty menus disable only their print button', () => {
  const result = buildMealPrintPage(buildMealMenuDocument([], 'Legado'), back, nonce, false);
  assert.match(result, /id="menu-print-button"[^>]* disabled/);
  assert.ok(result.includes('Todavía no hay comidas planificadas.'));
});

test('screen control is no longer gated on a hidden iframe loading', () => {
  const source = readFileSync(new URL('../app/more/meals/meal-menu-print.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('href="/print/meals"'));
  assert.ok(source.includes('target="_blank"'));
  assert.ok(source.includes('prefetch={false}'));
  assert.ok(!source.includes('loadedDocument'));
  assert.ok(!source.includes('contentWindow'));
  assert.ok(!source.includes('printFrame'));
});

test('print endpoint uses tenant authorization, scoped RLS and no shared caching', () => {
  const source = readFileSync(new URL('../app/o/[organizationId]/c/[camporeeId]/print/meals/route.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('await requireCamporeeContext(params)'));
  assert.ok(source.includes(".eq('camporee_id', context.camporeeId)"));
  assert.ok(source.includes('private, no-store'));
  assert.ok(!source.includes('service_role'));
  assert.ok(source.includes("'X-Frame-Options': 'DENY'"));
});
