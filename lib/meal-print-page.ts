/** A top-level print document, never a hidden/sandboxed print frame. */
export function mealPrintPolicy(nonce: string): string {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid print nonce');
  return `default-src 'none'; img-src data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'`;
}

// Fixed application code only. Never interpolate meals, names, URLs or other
// user input into JavaScript. Menu content is escaped by buildMealMenuDocument.
const PRINT_SCRIPT = `(() => {
  const button = document.getElementById('menu-print-button');
  const status = document.getElementById('menu-print-status');
  const copy = document.getElementById('menu-copy-link');
  const address = document.getElementById('menu-print-address');
  let timer;
  const explain = (message) => { status.hidden = false; status.textContent = message; };
  const recovery = 'El navegador no abrió la impresión. En iPhone, abre esta página en Safari y usa Compartir → Imprimir. En computadora, usa Ctrl+P o ⌘P.';
  window.addEventListener('beforeprint', () => {
    clearTimeout(timer);
    status.hidden = true;
  });
  window.addEventListener('afterprint', () => {
    clearTimeout(timer);
    status.hidden = true;
  });
  window.addEventListener('pagehide', () => clearTimeout(timer));
  button.addEventListener('click', () => {
    clearTimeout(timer);
    status.hidden = true;
    try {
      if (typeof window.print !== 'function') throw new Error('Printing unavailable');
      // Some webviews silently ignore print() instead of throwing. Give the
      // user a recovery path, not an endless spinner or a false success toast.
      timer = setTimeout(() => explain(recovery), 1800);
      // Keep this synchronous and in the top-level user's click. No font,
      // iframe-load, popup, network request or promise gates the native call.
      window.print();
    } catch {
      clearTimeout(timer);
      explain(recovery);
    }
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      explain('Enlace copiado. Puedes abrirlo en Safari; necesitarás iniciar sesión con tu cuenta.');
    } catch {
      address.hidden = false;
      address.value = window.location.href;
      address.focus();
      address.select();
      explain('Mantén pulsado el enlace para copiarlo y abrirlo en Safari.');
    }
  });
  // Match the app's Poppins font, but never hold printing hostage to a CDN.
  // Inserting after load keeps a stalled font request out of document loading.
  window.addEventListener('load', () => {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap';
    document.head.appendChild(font);
  }, { once: true });
})();`;

/** Enhance only the trusted, escaped menu template. The preview stays script-free. */
export function buildMealPrintPage(menuDocument: string, backHref: string, nonce: string, hasMeals = true): string {
  if (!/^\/o\/[a-zA-Z0-9-]+\/c\/[a-zA-Z0-9-]+\/more\/meals$/.test(backHref)) {
    throw new Error('Invalid scoped meals path');
  }
  const policy = mealPrintPolicy(nonce);
  if (!menuDocument.includes('<body>') || !menuDocument.includes('</head>') || !menuDocument.includes('</body>')) {
    throw new Error('Invalid menu document');
  }
  const styles = `<style>
    .print-controls { max-width: 186mm; margin: 18px auto 0; padding: 16px 20px; border: 1px solid #f0e9e3; border-radius: 24px; background: #fff; }
    .print-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; }
    .print-actions button, .print-actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border: 0; border-radius: 999px; padding: 11px 16px; font: 500 12px Poppins, system-ui, sans-serif; text-decoration: none; cursor: pointer; background: #f6f2ee; color: #2b211c; }
    .print-actions .print-primary { background: #fa8943; color: #2b211c; font-weight: 600; }
    .print-actions button:disabled { opacity: .5; cursor: not-allowed; }
    .print-actions :focus-visible { outline: 3px solid #a14f23; outline-offset: 3px; }
    .print-help, .print-status { font-size: 12px; line-height: 1.6; margin: 12px 0 0; color: #6c625b; }
    .print-status { padding: 10px 12px; background: #fff3c5; color: #5e471e; border-radius: 14px; }
    .print-address { width: 100%; margin-top: 10px; padding: 10px; font: inherit; }
    @media screen and (max-width: 540px) { .print-controls { margin: 10px 12px; padding: 14px; border-radius: 22px; } .print-actions { gap: 7px; } .print-actions .print-primary { flex-basis: 100%; } }
    @media print { .print-controls { display: none !important; } }
  </style>`;
  const controls = `<section class="print-controls" aria-label="Opciones de impresión">
    <nav class="print-actions" aria-label="Acciones del menú">
      <button id="menu-print-button" class="print-primary" type="button"${hasMeals ? '' : ' disabled'}>Imprimir / Guardar PDF</button>
      <a href="${backHref}">Volver a Comidas</a>
      <button id="menu-copy-link" type="button">Copiar enlace</button>
    </nav>
    <p class="print-help">Usa papel Carta, orientación vertical y escala 100 %. Desactiva los encabezados y pies de página del navegador. En iPhone, también puedes usar Compartir → Imprimir desde Safari.</p>
    <p id="menu-print-status" class="print-status" role="status" aria-live="polite" hidden></p>
    <input id="menu-print-address" class="print-address" aria-label="Enlace del menú" readonly hidden>
    <noscript><p class="print-help">Usa la opción Imprimir de tu navegador, Ctrl+P o ⌘P.</p></noscript>
  </section>`;
  return menuDocument
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="${policy}">`)
    .replace('</head>', `${styles}</head>`)
    .replace('<body>', `<body>${controls}`)
    .replace('</body>', `<script nonce="${nonce}">${PRINT_SCRIPT}</script></body>`);
}
