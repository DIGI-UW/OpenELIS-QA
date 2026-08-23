// Measure the vector/environmental reference-data vocabularies on whatever instance BASE points at.
//
// WHY: every one of these is populated on indonesiademo and empty on testing (3.2.2.0 predates
// liquibase 3.4.x.x/023-vector-dictionary-entries.xml, which loads
// configuration/dictionaries/vector-dictionaries.csv). An empty dropdown in the env/vector wizard
// is therefore reference-data absence, not a wizard defect — but only a measurement can tell those
// apart, and a spec that guesses gets it backwards. See VECTOR-ENV-REFERENCE-DATA.md.
//
// This spec fails on a BROKEN ROUTE (non-200, or a 404 slug) and merely reports population counts,
// because an unseeded instance is a legitimate deployment state.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/vector-env-dictionaries.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go } from './capture';

const API = '/api/OpenELIS-Global/rest';

// Bespoke routes in VectorDictionaryRestController. Each maps to one categoryName.
const ROUTES: Array<[string, string]> = [
  ['sampling-site-types', 'Sampling Site Type'],
  ['environmental-zones', 'Environmental Zone'],
  ['sample-containers', 'Sample Container'],
  ['env-collection-methods', 'Env Collection Method'],
  ['env-weather', 'Env Weather'],
  ['lifecycle-stages', 'vecLifecycleStages'],
  ['pathogens', 'vecPathogens'],
];

// Categories with NO bespoke route — reachable only through the generic categories endpoint.
// vecTrapType is the notable one: the vector wizard has a Trap Type select, but there is no
// /rest/vector/dictionary/trap-types (probed: 404). Do not re-guess that slug.
const GENERIC_ONLY = [
  'vecTrapType', 'vecRestingContext', 'vecCollectionTimeOfDay', 'vecPathogenResult',
  'vecPlasmodiumSpecies', 'vecPhysiologicalState', 'vecBloodmealHostSpecies',
  'vecInsecticideResistanceGenotype', 'vecWhoInsecticideSusceptibilityClass',
  'vecVirusIsolationResult',
];

type Probe = { label: string; status: number; count: number; sample: string };

async function probe(page: any, label: string, url: string): Promise<Probe> {
  return await page.evaluate(async (args: { label: string; url: string }) => {
    try {
      const r = await fetch(args.url, { headers: { Accept: 'application/json' } });
      if (!r.ok) return { label: args.label, status: r.status, count: -1, sample: '' };
      const j = await r.json();
      const arr = Array.isArray(j) ? j : [];
      const names = arr.map((x: any) => String(x.dictEntry || x.label || x.value || x.categoryName || '')).filter(Boolean);
      return { label: args.label, status: r.status, count: arr.length, sample: names.slice(0, 4).join(', ') };
    } catch (e) {
      return { label: args.label, status: 0, count: -1, sample: String(e).slice(0, 60) };
    }
  }, { label, url });
}

test('Vector/env reference data — population census', async ({ page }) => {
  test.setTimeout(150000);
  await go(page, '/');

  const rows: Probe[] = [];
  for (const [slug, category] of ROUTES) {
    rows.push(await probe(page, `route ${slug}`, `${API}/vector/dictionary/${slug}`));
    rows.push(await probe(page, `cat  ${category}`, `${API}/dictionary/categories/${encodeURIComponent(category)}/entries`));
  }
  for (const c of GENERIC_ONLY) {
    rows.push(await probe(page, `cat  ${c}`, `${API}/dictionary/categories/${encodeURIComponent(c)}/entries`));
  }
  // Suffix-filtered category lists. Note lifecycle-categories matches ANY name ending in "Stages",
  // so a clinical category (AIDS Stages) shows up here on an unseeded instance.
  rows.push(await probe(page, 'route pathogen-categories', `${API}/vector/dictionary/pathogen-categories`));
  rows.push(await probe(page, 'route lifecycle-categories', `${API}/vector/dictionary/lifecycle-categories`));

  for (const r of rows) console.log(`[refdata] ${r.label.padEnd(42)} HTTP=${r.status} n=${r.count} ${r.sample}`);

  const broken = rows.filter((r) => r.status !== 200);
  const populated = rows.filter((r) => r.count > 0).length;
  console.log(`[refdata] SUMMARY populated=${populated}/${rows.length} broken=${broken.length}`);
  if (populated === 0) {
    test.info().annotations.push({
      type: 'data-gap',
      description: 'No vector/env vocabulary is seeded on this instance — the dictionary categories do not exist. There is no REST route that creates a dictionary category; load configuration/dictionaries/vector-dictionaries.csv via liquibase. Empty env/vector dropdowns here are expected, not defects.',
    });
  }

  // The routes themselves must answer. A gap is data; a non-200 is a product problem.
  expect(broken.map((b) => `${b.label} -> ${b.status}`), 'every reference-data route must return 200').toEqual([]);
});
