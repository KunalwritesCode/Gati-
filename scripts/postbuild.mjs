// Fills the service worker's precache list with every built file.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split(sep).join('/'));
  }
})(dist);

const precache = ['./', ...files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).map((f) => `./${f}`)];
const hash = createHash('sha256');
for (const f of files.filter((f) => f !== 'sw.js').sort()) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);

const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace("'__GATI_VERSION__'", JSON.stringify(version)).replace("'__GATI_PRECACHE__'", JSON.stringify(precache));
writeFileSync(swPath, sw);
console.log(`sw.js: version ${version}, ${precache.length} files precached`);
