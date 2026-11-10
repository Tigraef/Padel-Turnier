// Benennt dist/americano/americano.html in index.html um (Adresse …/Padel-Turnier/americano/)
// und prüft, dass alle Skripte ES5 sind (damit es auch auf alten iPads läuft).
import { renameSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';

const dir = join('dist', 'americano');
renameSync(join(dir, 'americano.html'), join(dir, 'index.html'));
for (const file of readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.js'))) {
  parse(readFileSync(join(dir, 'assets', file), 'utf8'), { ecmaVersion: 5 });
}
const html = readFileSync(join(dir, 'index.html'), 'utf8');
for (const [, code] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  if (code.trim()) parse(code, { ecmaVersion: 5 });
}
console.log('Americano-App: dist/americano/index.html – alle Skripte ES5-kompatibel');
