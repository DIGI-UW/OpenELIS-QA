// Generate per-capability docs-capture spec stubs from the inventory worklist.
// Input: docs-capture-worklist.json (produced by features-inventory/render.py).
//   Default path: ./docs-capture-worklist.json  (override: node scripts/gen-doc-specs.mjs <path>)
// Writes tests/docs/<id>.docs.spec.ts for any worklist capability that has no spec yet.
import fs from 'fs';
import path from 'path';

const worklistPath = process.argv[2] || 'docs-capture-worklist.json';
if (!fs.existsSync(worklistPath)) {
  console.error(`Worklist not found: ${worklistPath}\n` +
    `Copy it from features-inventory/generated/docs-capture-worklist.json or pass a path.`);
  process.exit(1);
}
const { capabilities } = JSON.parse(fs.readFileSync(worklistPath, 'utf8'));
const dir = 'tests/docs';
fs.mkdirSync(dir, { recursive: true });

let created = 0;
for (const c of capabilities) {
  const file = path.join(dir, `${c.id}.docs.spec.ts`);
  if (fs.existsSync(file)) continue;
  const mockup = c.reference_mockup ? `\n  // Reference mockup: ${c.reference_mockup}` : '';
  fs.writeFileSync(file, `// Docs-capture flow for capability \`${c.id}\` — ${c.name} (${c.maturity}).
// Manual page: ${c.manual_page}${mockup}
// TODO: fill in the real navigation + steps, then capture key screens.
import { test } from '@playwright/test';
import { shot, saveWalkthrough, sidebar } from './capture';

test('User manual — ${c.name} walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: '${c.id}' });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'Starting point');

  // await sidebar(page, 'Menu', 'Sub-menu');
  // await shot(page, info, 'Feature screen', { fullPage: true, maskPii: [] });

  await saveWalkthrough(page, info);
});
`);
  created++;
}
console.log(`Generated ${created} new spec stub(s) into ${dir} (skipped existing).`);
