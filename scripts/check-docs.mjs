import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name);
    if (entry.isDirectory()) {
      if (!['raw', 'history', 'generated', 'node_modules', 'dist'].includes(entry.name)) await visit(file);
    } else if (entry.name.endsWith('.md')) {
      const content = await readFile(file, 'utf8');
      for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1];
        if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
        try { await stat(resolve(dirname(file), target.split('#')[0])); }
        catch { failures.push(`${file}: missing ${target}`); }
      }
    }
  }
}
await visit(resolve(root, 'docs'));
// Original archived research contains historical machine paths, not current links.
const register = await readFile(resolve(root, 'docs/research/solar/sources/source-register.csv'), 'utf8');
const copies = [...new Set(register.match(/raw\/[a-z0-9-]+\.(?:pdf|html)/g) ?? [])];
for (const copy of copies) {
  try { await stat(resolve(root, 'docs/research/solar/sources', copy)); }
  catch { failures.push(`Missing source copy: ${copy}`); }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Current documentation links and ${copies.length} registered source copies verified.`);
}
