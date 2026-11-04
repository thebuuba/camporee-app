/** Reuse Poppins already declared by the app, without external resources in srcDoc.
 * Keep print available offline or when a font host is slow/unreachable.
 */
export async function prepareMealMenuFonts(source: Document, target: Document, timeoutMs = 1500): Promise<void> {
  if (!source.fonts || !target.fonts) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([400, 500, 600].map(weight => source.fonts.load(`${weight} 12px Poppins`))),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, timeoutMs); }),
    ]);
  } catch {
    // The system-font fallback must not disable the print button.
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  source.fonts.forEach(face => {
    if (face.family.replace(/["']/g, '').toLowerCase() !== 'poppins' || face.status !== 'loaded') return;
    try { target.fonts.add(face); } catch { /* Some engines restrict sharing CSS-connected faces. */ }
  });
}
