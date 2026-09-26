// Tras `vite build`: el service worker no debe llevar URLs repetidas en la precache.
// Con dos revisiones de la misma URL, Workbox lanza «add-to-cache-list-conflicting-entries» al
// evaluar el worker y la app se queda sin actualizaciones ni avisos (pasó el 27/09/2026).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? '../server/Viajes.Api/wwwroot/sw.js');
const source = readFileSync(file, 'utf8');
const urls = [...source.matchAll(/"url":"([^"]+)"/g)].map((m) => m[1]);
const seen = new Set();
const duplicates = new Set();
for (const url of urls) {
  if (seen.has(url)) {
    duplicates.add(url);
  }
  seen.add(url);
}
if (urls.length === 0) {
  console.error(`check-sw: no se encontró la precache en ${file}`);
  process.exit(1);
}
if (duplicates.size > 0) {
  console.error(`check-sw: URLs repetidas en la precache: ${[...duplicates].join(', ')}`);
  process.exit(1);
}
console.log(`check-sw: ${urls.length} entradas en la precache, sin repetidas.`);
