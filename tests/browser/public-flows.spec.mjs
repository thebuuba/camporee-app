import { test, expect } from '@playwright/test';

async function observeLaunches(page, installed = false) {
  await page.addInitScript(({ installed }) => {
    window.__launchCount = 0;
    if (installed) Object.defineProperty(navigator, 'standalone', { value: true });
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element) window.__launchCount += (node.matches('.pm-launch-screen') ? 1 : 0) + node.querySelectorAll('.pm-launch-screen').length;
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }, { installed });
}

test('login supports zoom, readable contrast and narrow mobile screens', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  const measured = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Iniciar sesión');
    const style = getComputedStyle(button);
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), viewport: document.querySelector('meta[name="viewport"]').content,
      targets: [...document.querySelectorAll('.pm-login-register a,.pm-login-password-toggle,.pm-login-options>button')].map(node => ({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),
      width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
  });
  expect(measured.contrast).toBeGreaterThanOrEqual(4.5);
  expect(measured.viewport).not.toMatch(/user-scalable=no|maximum-scale=1(?:,|$)/);
  expect(measured.scroll).toBeLessThanOrEqual(measured.width);
  expect(measured.targets).toHaveLength(3);
  for (const target of measured.targets) { expect(target.height).toBeGreaterThanOrEqual(44); expect(target.width).toBeGreaterThanOrEqual(44); }
  await page.locator('input[name=password]').focus();
  await page.keyboard.press('Tab');
  const toggle = page.getByRole('button', { name:'Mostrar contraseña', exact:true });
  await expect(toggle).toBeFocused();
  expect(await toggle.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: info.outputPath('login.png'), fullPage: true });
});

test('registration and reload do not replay the startup screen when storage is blocked', async ({ page }) => {
  await observeLaunches(page);
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
  await page.goto('/login'); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__launchCount)).toBeLessThanOrEqual(1);
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Crear|cuenta|Registro/i }).first()).toBeVisible();
  await expect(page.locator('.pm-launch-screen')).toHaveCount(0);
  await page.reload(); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__launchCount)).toBe(0);
});

test('installed PWA relies on system startup without an extra application cover', async ({ page }) => {
  await observeLaunches(page, true);
  await page.goto('/login'); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__launchCount)).toBe(0);
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
});

test('the installed app opens its styled offline fallback after losing connection', async ({ page, context }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await context.setOffline(true);
  try {
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Seguimos en campamento' })).toBeVisible();
    await expect(page).toHaveURL(/\/offline\?from=%2Ftasks$/);
    expect(await page.locator('.polymet-panel-heading h1').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(20);
  } finally {
    await context.setOffline(false);
  }
});

test('offline panels show only the prepared account and queue a task change', async ({ page, context }) => {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.evaluate(async () => {
    const owner='10000000-0000-4000-8000-000000000001';
    const organization='50000000-0000-4000-8000-000000000001';
    const camporee='60000000-0000-4000-8000-000000000001';
    localStorage.setItem('camporee-offline-identity-v1',owner);
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('camporee-snapshots-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('snapshots',{keyPath:'key'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('snapshots','readwrite');
      tx.objectStore('snapshots').put({key:`${owner}:${organization}:${camporee}`,ownerId:owner,organizationId:organization,camporeeId:camporee,camporeeName:'Legado',timeZone:'America/Santo_Domingo',savedAt:Date.now(),canEditTasks:true,canEditLists:true,canEditRules:true,rules:['Respetar al equipo.'],
        program:[{id:'70000000-0000-4000-8000-000000000001',title:'Apertura',starts_at:'2026-11-06T12:00:00Z',ends_at:null,description:null,location:null}],
        meals:[{id:'80000000-0000-4000-8000-000000000001',meal_date:'2026-11-06',meal_type:'breakfast',meal_time:'08:00:00',menu:'Arroz de prueba',notes:null}],
        tasks:[{id:'90000000-0000-4000-8000-000000000001',title:'Preparar carpas',description:null,status:'pending',due_at:null,phase:null}],
        lists:[{id:'a0000000-0000-4000-8000-000000000001',title:'Equipaje',category:null,list_items:[{id:'b0000000-0000-4000-8000-000000000001',label:'Linterna',is_done:false,quantity:null,unit:null}]}]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await context.setOffline(true);
  try {
    await page.goto('/tasks',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Legado'})).toBeVisible();
    await page.getByRole('button',{name:'Comidas'}).click();
    await expect(page.getByText('Arroz de prueba')).toBeVisible();
    await page.getByRole('button',{name:'Tareas'}).click();
    await page.getByRole('checkbox').first().click();
    await expect(page.getByRole('checkbox').first()).toBeChecked();
    await expect(page.getByRole('checkbox').first()).toBeEnabled();
    const queued=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('camporee-offline',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      const rows=await new Promise((resolve,reject)=>{const request=db.transaction('requests').objectStore('requests').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      db.close();return rows;
    });
    expect(queued).toHaveLength(1);
    expect(queued[0].ownerId).toBe('10000000-0000-4000-8000-000000000001');
    expect(queued[0].body).toBe('{"status":"done"}');
    await page.getByRole('button',{name:'Reglas'}).click();
    await expect(page.getByRole('link',{name:'Compartir por WhatsApp'})).toHaveAttribute('href',/wa\.me\/\?text=.*Respetar%20al%20equipo/);
    await page.getByRole('button',{name:'Agregar regla'}).click();
    await page.getByRole('textbox',{name:'Texto de la regla'}).fill('Cuidar el agua.');
    await page.getByRole('button',{name:'Guardar regla'}).click();
    await expect(page.getByRole('list',{name:'Reglas del camporee'}).getByText('Cuidar el agua.')).toBeVisible();
    await page.getByRole('button',{name:'Editar reglas'}).click();
    await page.getByRole('textbox',{name:'Texto de la regla'}).fill('Respetar a todos.');
    await page.getByRole('button',{name:'Guardar regla'}).click();
    await expect(page.getByRole('list',{name:'Reglas del camporee'}).getByText('Respetar a todos.')).toBeVisible();
    await expect(page.getByRole('link',{name:'Compartir por WhatsApp'})).toHaveAttribute('href',/Respetar%20a%20todos/);
    const saved=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('camporee-offline',1);request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
      const rows=await new Promise((resolve,reject)=>{const request=db.transaction('requests').objectStore('requests').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
      db.close();return rows;
    });
    expect(saved).toHaveLength(3);
    expect(saved.filter(row=>row.url.includes('camporee_rule_sets')).map(row=>JSON.parse(row.body).rules)).toEqual(expect.arrayContaining([
      ['Respetar al equipo.','Cuidar el agua.'],['Respetar a todos.','Cuidar el agua.']]));
    await page.evaluate(()=>localStorage.setItem('camporee-offline-identity-v1','10000000-0000-4000-8000-000000000002'));
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Sin copia disponible'})).toBeVisible();
    await expect(page.getByText('Preparar carpas')).toHaveCount(0);
  } finally {await context.setOffline(false);}
});
