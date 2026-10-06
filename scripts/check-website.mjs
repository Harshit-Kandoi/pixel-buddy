import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const site = resolve(dirname(fileURLToPath(import.meta.url)), '../website/dist');
const html = readFileSync(resolve(site, 'index.html'), 'utf8');
for (const [, attribute, path] of html.matchAll(/\b(href|src)="([^"#]+)"/g)) {
  if (/^https?:/.test(path)) continue;
  if (!existsSync(resolve(site, path))) throw new Error(`Missing ${attribute} target: ${path}`);
}
for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
  if (!html.includes(`id="${anchor}"`)) throw new Error(`Missing section: ${anchor}`);
}
if (/data-platform="android"/.test(html)) throw new Error('This giveaway supports desktop installers only');
console.log('Website assets and section links are valid.');
