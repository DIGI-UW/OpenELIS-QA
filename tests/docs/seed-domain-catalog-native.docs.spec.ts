// Create ENVIRONMENTAL and VECTOR sample types AND tests natively, through the new test catalog,
// then place a real order on each — no repurposing of clinical rows.
//
// WHY THIS EXISTS / WHAT IT CORRECTS
// seed-domain-catalog.docs.spec.ts got into the domain lanes by flipping a QA-junk sample type's
// domain with PUT /rest/sample-types/{id}, because POST /rest/sample-types and
// POST /rest/test-catalog/sample-types both answer 405. Those two 405s are real, but the
// conclusion drawn from them — "sample types cannot be created" — was wrong: the insert route is
// POST /rest/SampleTypeCreate (SampleTypeCreateRestController), and it writes the domain through
// Domain.normalize(), so ENVIRONMENTAL and VECTOR rows can be created outright. This spec does it
// the intended way and proves the whole chain, catalog through to a persisted sample.
//
// Endpoint facts, read from the controllers (not inferred from a diff) and then measured live:
//   POST /rest/SampleTypeCreate                 body binds ONLY sampleTypeEnglishName,
//                                               sampleTypeFrenchName, domain, whonetCode, active.
//                                               Returns the submitted form, NOT the new id, and a
//                                               validation failure comes back HTTP 200 with errors
//                                               — so existence must be confirmed by re-reading.
//                                               A duplicate description throws (500): check first.
//   POST /rest/test-catalog/tests               requires name, reportingName, code, domain (exact
//                                               enum name) and >=1 sample type; each sample type
//                                               must match the test's domain (D-030 guard, 422).
//                                               Creates the test INACTIVE and pre-seeds one
//                                               component code=PRIMARY with resultType NULL.
//   PUT  .../tests/{id}/sample-results          give that component a resultType, else activation
//                                               fails FR-57 NO_PRIMARY_RESULT_TYPE.
//   PUT  .../tests/{id}/ranges                  a finite top band always leaves a tail gap, so the
//                                               top band's maxAge must be null. Zero ranges = EMPTY
//                                               = a 0..inf gap, which is NOT a pass.
//   POST .../tests/{id}/activate                200 sets is_active=Y AND orderable=true. 422 =
//                                               completeness, 409 = range-coverage gaps (re-POST
//                                               with gapsAcknowledged to override).
//   PUT  .../tests/{id}/basic-info              can set orderable but NOT active:true (409). Also
//                                               the only way to attach a lab unit after creation.
//
// A LAB UNIT IS NOT OPTIONAL IN PRACTICE — this is the trap this spec exists to hold shut.
// CreateTestRequest.labUnitId is optional, and the FR-57 completeness gate checks only the name, a
// typed PRIMARY component and dictionary options — never the test section. So a test activates
// happily with test_section_id NULL. But the order-entry catalogue endpoint filters the sample
// type's tests by section id, so ONE such test makes
//     GET /rest/sample-type-tests?sampleType=<thatType>  ->  HTTP 500
// for the whole sample type, and the order picker for it dies. Measured on 3.2.2.0: with
// labUnitId null -> 500; the same call for legacy types whose tests carry labUnitId 56 -> 200; and
// a NONEXISTENT sample type id -> 200 with empty lists. So always send labUnitId, and assert the
// read-back's STATUS, not just its length — a null-guarded `|| []` silently turns this 500 into a
// plausible-looking "0 tests" and reads as a data gap instead of a defect.
//
// Read-back is on DIFFERENT endpoints from the writes (harness rule 7.5): the new type must appear
// in /rest/{environmental|vector}-sample-types (what the new order wizard reads) and the new test
// in /rest/sample-type-tests?sampleType=<id> (what the picker reads).
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/seed-domain-catalog-native.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import {
  generateLabNumber, selectOrAddSite, fillRequestor, completeQaChecklist, clickButton,
  trackWrites, selectSampleTypeAgnostic, pickTestAgnostic, fillUnsetSelects, checkByLabel,
} from './order-helpers';

test.describe.configure({ retries: 0, mode: 'serial' });
const API = '/api/OpenELIS-Global/rest';

type Lane = {
  domain: 'ENVIRONMENTAL' | 'VECTOR';
  wizard: 'environmental' | 'vector';
  typeName: string;
  testName: string;
  testCode: string;
};

const LANES: Lane[] = [
  { domain: 'ENVIRONMENTAL', wizard: 'environmental', typeName: 'QA Native Env Matrix', testName: 'QA Native Env Assay', testCode: 'QANENV' },
  { domain: 'VECTOR', wizard: 'vector', typeName: 'QA Native Vector Pool', testName: 'QA Native Vector Assay', testCode: 'QANVEC' },
];

// Carries state from the catalog test to the order test.
const seeded: Record<string, { typeId: string; testId: string; typeName: string; testName: string }> = {};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const lane of LANES) {
  test(`${lane.domain} — create sample type + test natively via the test catalog`, async ({ page }) => {
    test.setTimeout(180000);
    await go(page, '/');

    const out: any = await page.evaluate(async (args: { api: string; lane: Lane }) => {
      const { api, lane } = args;
      const log: string[] = [];
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf };
      const getJson = async (u: string) => {
        const r = await fetch(api + u, { headers: { Accept: 'application/json' } });
        if (!r.ok) return null;
        return await r.json().catch(() => null);
      };
      const rawGet = async (u: string) => {
        const r = await fetch(api + u, { headers: { Accept: 'application/json' } });
        let body: any = null;
        try { body = await r.json(); } catch (e) { body = null; }
        return { status: r.status, body };
      };
      const findType = async () => {
        const sts: any[] = (await getJson('/test-catalog/sample-types')) || [];
        return sts.find((s: any) => String(s.name || '').trim() === lane.typeName) || null;
      };

      // 1) Sample type — create only if it is not already there (duplicate description throws 500).
      let st: any = await findType();
      if (st) {
        log.push('sample type exists: ' + st.id + ' [' + st.name + '] domain=' + st.domain);
      } else {
        const r = await fetch(api + '/SampleTypeCreate', {
          method: 'POST', headers: H,
          body: JSON.stringify({
            sampleTypeEnglishName: lane.typeName,
            sampleTypeFrenchName: lane.typeName,
            domain: lane.domain,
            active: true,
          }),
        });
        log.push('POST /SampleTypeCreate ' + lane.typeName + ' [' + lane.domain + '] -> HTTP ' + r.status);
        st = await findType();
        if (!st) { log.push('sample type did NOT appear after create - aborting lane'); return { log, typeId: '', testId: '', domainSeen: '' }; }
        log.push('created sample type ' + st.id + ' domain=' + st.domain);
      }

      // 1b) A lab unit (test_section) is mandatory in practice — see the header note.
      const units: any[] = (await getJson('/test-catalog/lab-units')) || [];
      const labUnitId = units.length ? String(units[0].id) : '';
      log.push('lab units available: ' + units.length + ' -> using labUnitId=' + (labUnitId || 'NONE'));
      if (!labUnitId) { log.push('no lab unit to attach - a test without one 500s /sample-type-tests; aborting lane'); return { log, typeId: String(st.id), testId: '', domainSeen: String(st.domain || '') }; }

      // 2) Test — reuse if a previous run made it.
      // The list projection decorates the name with its sample type — "QA Native Env Assay(QA
      // Native Env Matrix)" — so an equality match on `name` never fires and the reuse path silently
      // falls through to a create that 409s on the code. Strip a trailing parenthetical, and match
      // on `code` too.
      const bare = (n: any) => String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const findTest = async () => {
        const listed: any = await getJson('/test-catalog/tests?domain=' + lane.domain + '&page=1&pageSize=200');
        const rows: any[] = (listed && (listed.rows || listed.content || [])) || [];
        const m = rows.find((t: any) => bare(t.name) === lane.testName
          || String(t.code || '').toUpperCase() === lane.testCode.toUpperCase());
        return m ? String(m.testId || m.id) : '';
      };
      let testId = await findTest();
      if (testId) {
        log.push('test exists: ' + testId + ' [' + lane.testName + ']');
      } else {
        const r = await fetch(api + '/test-catalog/tests', {
          method: 'POST', headers: H,
          body: JSON.stringify({
            name: lane.testName,
            reportingName: lane.testName,
            code: lane.testCode,
            domain: lane.domain,
            sampleTypeIds: [String(st.id)],
            labUnitId,
            orderable: true,
          }),
        });
        const txt = await r.text();
        log.push('POST /test-catalog/tests ' + lane.testName + ' -> HTTP ' + r.status + ' ' + txt.slice(0, 120).replace(/\s+/g, ' '));
        try { testId = String((JSON.parse(txt) || {}).testId || ''); } catch (e) { /* status already logged */ }
        if (!testId && r.status === 409) {
          // 409 = the code is already in use, i.e. a previous run made it. Recover by lookup.
          testId = await findTest();
          log.push('409 code-in-use -> recovered existing test ' + (testId || 'NOT FOUND'));
        }
        if (!testId) { log.push('no testId returned - aborting lane'); return { log, typeId: String(st.id), testId: '', domainSeen: String(st.domain || '') }; }
      }

      // 2b) Repair a test from an earlier run that was created without a lab unit.
      const bi: any = await getJson('/test-catalog/tests/' + testId + '/basic-info');
      if (!bi || !bi.labUnitId) {
        const rb = await fetch(api + '/test-catalog/tests/' + testId + '/basic-info', {
          method: 'PUT', headers: H, body: JSON.stringify({ labUnitId }),
        });
        log.push('test had no lab unit (would 500 /sample-type-tests) - PUT basic-info labUnitId=' + labUnitId + ' -> HTTP ' + rb.status);
      } else {
        log.push('test lab unit already set: ' + bi.labUnitId);
      }

      // 3) Give the pre-seeded PRIMARY component a result type (FR-57 gate).
      const sr: any = await getJson('/test-catalog/tests/' + testId + '/sample-results');
      const comps: any[] = (sr && sr.components) || [];
      const primary = comps.find((c: any) => c.isPrimary) || comps[0];
      const rc = await fetch(api + '/test-catalog/tests/' + testId + '/sample-results', {
        method: 'PUT', headers: H,
        body: JSON.stringify({
          testId,
          components: [{
            id: primary ? primary.id : undefined,
            code: primary && primary.code ? primary.code : 'PRIMARY',
            label: lane.testName,
            displayOrder: 0,
            isPrimary: true,
            showOnReport: true,
            resultType: 'N',
            significantDigits: 2,
          }],
        }),
      });
      log.push('PUT sample-results (resultType=N on ' + (primary ? 'existing' : 'new') + ' component) -> HTTP ' + rc.status);

      // 4) Reference ranges. Top band must have maxAge null or coverage reports a tail gap.
      const rr = await fetch(api + '/test-catalog/tests/' + testId + '/ranges', {
        method: 'PUT', headers: H,
        body: JSON.stringify({ ranges: [{ minAge: 0, maxAge: null, lowNormal: 0, highNormal: 100 }] }),
      });
      log.push('PUT ranges (0..inf, both sexes) -> HTTP ' + rr.status);

      // 5) Completeness, then activate. 409 = coverage gaps; acknowledge and retry.
      const comp: any = await getJson('/test-catalog/tests/' + testId + '/completeness');
      log.push('completeness: complete=' + (comp && comp.complete) + ' missing=' + JSON.stringify((comp && comp.missing) || []));
      let act = await fetch(api + '/test-catalog/tests/' + testId + '/activate', { method: 'POST', headers: H });
      log.push('POST activate -> HTTP ' + act.status);
      if (act.status === 409) {
        act = await fetch(api + '/test-catalog/tests/' + testId + '/activate', {
          method: 'POST', headers: H,
          body: JSON.stringify({ gapsAcknowledged: 'QA harness: synthetic range band, coverage gaps accepted' }),
        });
        log.push('POST activate (gapsAcknowledged) -> HTTP ' + act.status);
      }
      const actBody = await act.text();
      log.push('activation result: ' + actBody.slice(0, 160).replace(/\s+/g, ' '));

      // 6) Read back on DIFFERENT endpoints than the ones written.
      const wiz = await rawGet('/' + lane.wizard + '-sample-types');
      const wizardList: any[] = Array.isArray(wiz.body) ? wiz.body : [];
      const inWizard = wizardList.some((s: any) => String(s.id) === String(st.id));
      // Keep the STATUS: a 500 here is a defect, and swallowing it into [] reads as a data gap.
      const stt = await rawGet('/sample-type-tests?sampleType=' + st.id);
      const testNames = ((((stt.body || {}) as any).tests || []) as any[]).map((t: any) => String(t.name || t.value || ''));
      log.push('READBACK /' + lane.wizard + '-sample-types HTTP ' + wiz.status + ' contains ' + st.id + ': ' + inWizard + ' (n=' + wizardList.length + ')');
      log.push('READBACK /sample-type-tests?sampleType=' + st.id + ' HTTP ' + stt.status + ': ' + testNames.length + ' tests [' + testNames.join(' | ') + ']');

      return { log, typeId: String(st.id), testId, domainSeen: String(st.domain || ''), inWizard, testNames, sttStatus: stt.status };
    }, { api: API, lane });

    for (const l of out.log) console.log('[native ' + lane.domain + '] ' + l);

    expect(out.typeId, 'a sample type must exist for this domain').not.toBe('');
    expect(out.domainSeen, 'the created sample type must carry the requested domain').toBe(lane.domain);
    expect(out.testId, 'a test must exist for this domain').not.toBe('');
    expect(out.inWizard, 'the new sample type must appear in /rest/' + lane.wizard + '-sample-types (what the wizard reads)').toBe(true);
    expect(out.sttStatus, 'the order-entry catalogue endpoint must not error for this sample type (500 here means a linked test has no test_section)').toBe(200);
    expect(out.testNames, 'the activated test must be orderable for its own sample type').toContain(lane.testName);

    seeded[lane.domain] = { typeId: out.typeId, testId: out.testId, typeName: lane.typeName, testName: lane.testName };
  });

  test(`${lane.domain} — place a sample on the natively created catalog entry`, async ({ page }, info) => {
    test.setTimeout(180000);
    const s = seeded[lane.domain];
    test.skip(!s, lane.domain + ': catalog step did not complete');
    const writes = trackWrites(page);
    await go(page, '/order/' + lane.wizard + '/enter');

    await generateLabNumber(page);
    await selectOrAddSite(page, 'QA_AUTO ' + lane.wizard + ' Site');
    // Target the NEW type by exact name — the point is that THIS row is orderable, not that some
    // row is. prefer still degrades to any workable option, so the assertion below is what binds.
    const picked = await selectSampleTypeAgnostic(page, lane.wizard, { prefer: new RegExp('^\\s*' + esc(s.typeName) + '\\s*$', 'i') });
    expect(picked, 'the new sample type must be selectable in the wizard').not.toBeNull();
    expect(picked!.label.trim(), 'the wizard must offer the natively created type by name').toBe(s.typeName);
    await fillUnsetSelects(page, /^sampleType/i);
    const tickedTest = await pickTestAgnostic(page, s.typeId, new RegExp('^\\s*' + esc(s.testName) + '\\s*$', 'i'));
    expect(tickedTest, 'the natively created test must be tickable on the order form').toBe(s.testName);
    await fillRequestor(page);
    await page.waitForTimeout(500);
    await shot(page, info, lane.domain + ' — order on native catalog entry', { fullPage: false });

    await clickButton(page, /save & next|save and next/i, 2400);
    await clickButton(page, /print all labels|print labels/i, 1200);
    await checkByLabel(page, /skip storage|skip this step|no storage/i).catch(() => false);
    await clickButton(page, /save & next|save and next/i, 2400);
    await completeQaChecklist(page);
    await clickButton(page, /save & next|save and next|^submit$/i, 3000);
    await shot(page, info, lane.domain + ' — after submit', { fullPage: false });

    console.log('[native ' + lane.domain + '] WRITES=' + JSON.stringify(writes));
    const saved = writes.filter((w) => /SamplePatientEntry|SampleEntry/i.test(w.url) && w.status >= 200 && w.status < 300);
    expect(saved.length, 'the order must persist a sample through the entry endpoint').toBeGreaterThan(0);
    await saveWalkthrough(page, info);
  });
}
