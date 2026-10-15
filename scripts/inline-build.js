// Baut aus dist/ eine einzelne HTML-Datei (CSS und JS eingebettet),
// z. B. zum Teilen als Claude-Artifact oder zum Öffnen ohne Server.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assets = join('dist', 'assets');
const files = readdirSync(assets);
const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');

const html = `<title>Hanse Padel Cup</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

mkdirSync('dist-artifact', { recursive: true });
writeFileSync(join('dist-artifact', 'padel-turnier.html'), html);
console.log(`dist-artifact/padel-turnier.html (${(html.length / 1024).toFixed(0)} KB)`);
