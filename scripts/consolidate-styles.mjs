// Combine only adjacent rules with identical bodies, preserving cascade order.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Resolve Next's pinned parser under both npm and pnpm dependency layouts.
const postcss = createRequire(createRequire(import.meta.url).resolve('next/package.json'))('postcss');

export function consolidateCss(source) {
  const root = postcss.parse(source);
  let merged = 0;
  function visit(parent) {
    for (const node of [...parent.nodes]) if (node.type === 'atrule' && node.nodes) visit(node);
    for (let index = 1; index < parent.nodes.length; index++) {
      const previous = parent.nodes[index - 1], current = parent.nodes[index];
      if (previous.type !== 'rule' || current.type !== 'rule') continue;
      const body = node => node.nodes.map(item => item.toString()).join(';');
      if (body(previous) !== body(current)) continue;
      previous.selector = [...new Set([...previous.selectors, ...current.selectors])].join(',\n');
      current.remove(); merged++; index--;
    }
  }
  visit(root);
  return { css: root.toString(), merged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const filename of process.argv.slice(2)) {
    const source = await readFile(filename, 'utf8');
    const result = consolidateCss(source);
    if (result.merged) await writeFile(filename, result.css);
    console.log(`${filename}: ${result.merged} adjacent rules consolidated, ${Buffer.byteLength(source) - Buffer.byteLength(result.css)} bytes removed`);
  }
}
