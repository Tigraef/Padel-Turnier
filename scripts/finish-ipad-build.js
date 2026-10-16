// Benennt dist/ipad/ipad.html in index.html um (Adresse …/Padel-Turnier/ipad/)
// und prüft, dass alle Skripte ES5 sind (sonst bliebe die Seite auf alten iPads leer).
import { renameSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';

renameSync(join('dist', 'ipad', 'ipad.html'), join('dist', 'ipad', 'index.html'));

const assets = join('dist', 'ipad', 'assets');
for (const file of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  parse(readFileSync(join(assets, file), 'utf8'), { ecmaVersion: 5 });
}
const html = readFileSync(join('dist', 'ipad', 'index.html'), 'utf8');
for (const [, code] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  if (code.trim()) parse(code, { ecmaVersion: 5 });
}
console.log('iPad-Version: dist/ipad/index.html – alle Skripte ES5-kompatibel');
