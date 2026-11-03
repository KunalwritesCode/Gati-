// Fails the build if src/data and public/data disagree or the build report did not pass.
import { readFileSync } from 'node:fs';

const names = ['busRoutes.json', 'messMenu.json', 'scheduleMetadata.json'];
let ok = true;
for (const n of names) {
  const a = readFileSync(new URL(`../src/data/${n}`, import.meta.url), 'utf8');
  const b = readFileSync(new URL(`../public/data/${n}`, import.meta.url), 'utf8');
  if (a !== b) {
    console.error(`✗ ${n}: src/data and public/data differ. Run npm run data:build.`);
    ok = false;
  }
}
const meta = JSON.parse(readFileSync(new URL('../src/data/scheduleMetadata.json', import.meta.url), 'utf8'));
if (meta.validation?.status !== 'passed') {
  console.error('✗ scheduleMetadata.json reports failed validation');
  ok = false;
}
const bus = JSON.parse(readFileSync(new URL('../src/data/busRoutes.json', import.meta.url), 'utf8'));
const mess = JSON.parse(readFileSync(new URL('../src/data/messMenu.json', import.meta.url), 'utf8'));
if (bus.dataVersion !== meta.dataVersion || mess.dataVersion !== meta.dataVersion) {
  console.error('✗ dataVersion mismatch between data files');
  ok = false;
}
if (!ok) process.exit(1);
console.log(`✓ data ${meta.dataVersion}: ${meta.validation.checksRun} checks passed, ${bus.trips.length} trips, ${Object.keys(mess.days).length} menu days`);
