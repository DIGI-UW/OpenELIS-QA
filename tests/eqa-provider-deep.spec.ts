/**
 * tests/eqa-provider-deep.spec.ts
 *
 * EQA provider lane, deep: a reference lab running a proficiency testing (PT) scheme for other
 * laboratories, end to end through the API the provider screens call, with the screens checked
 * where the ticket is about a screen. Catalogue: eqa-deep.md (TC-EQAP-*).
 *
 * What a PT provider actually does (ISO/IEC 17043, ISO 13528, CLIA 42 CFR 493 subpart I), and what
 * each case holds the system to:
 *   - a scheme plan before a round: who takes part, what is tested, how it is scored (01, 02, 03);
 *   - panel preparation with homogeneity checked before anything ships (04);
 *   - dispatch, delivery, and results only once a panel is out (05, 06);
 *   - scoring against an assigned value: z = (x - x_pt) / sigma_pt, |z| <= 2 satisfactory,
 *     2 < |z| < 3 questionable, |z| >= 3 unsatisfactory (ISO 13528 9.4) (07, 08);
 *   - a lab that does not report is scored, not forgotten (CLIA 493.823(b)) (09);
 *   - every unacceptable result followed up, and a round not closed with one open (10, 11);
 *   - participant identity kept confidential in what a participant receives (17043 4.2.5) (12);
 *   - scored results read-only (493.903(a)(3)) (13); provider acts limited to provider roles (14).
 *
 * Data: eight QA organizations "QA-EQA-DEEP Lab A..H <stamp>", one regional PT scheme on Glucose
 * (test 3) and Creatinine (test 4), one cycle for labs A to G. Lab G never reports. Nothing deleted.
 *
 * Written 2026-10-12 against local develop a4200e2d (images 10-12 06:09 UTC). Tripwires carry
 * test.fail() with the practice they hold the system to; each is a finding for Casey to rule on.
 */
import { test, expect } from '@playwright/test';
import { api, ready, db, day, fixtures, lists, typeId, createOrg, zScores, isoVerdict, parseCsv, getText, getPdf, pdfText, note } from './helpers/eqa-deep';
import { performUiLogin } from './helpers/session';
import { BASE } from '../helpers/test-helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

type Fx = {
  orgs: Record<string, string>; orgNames: Record<string, string>;
  schemeId: string; schemeName: string; enrollH: string;
  cycleId: string; panelId: string; samples: Record<string, string>;
  followups: Record<string, string>; emailD: string;
};
const { F, save } = fixtures<Fx>('provider');
const LABS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const; // on the cycle; G never reports
const GLUCOSE = '3';
const CREATININE = '4';
// Two levels of one test (peer statistics per level) and one sealed-target sample.
const L1 = [100, 101, 99, 100, 102, 1000]; // labs A..F; F reports ten times the others
const L2 = [50, 52, 48, 51, 49, 56];
const S3: Record<string, number> = { A: 80, B: 120, C: 79.99, D: 120.01, E: 100, F: 100 }; // range 80..120

function wizardBody(over: Record<string, unknown> = {}) {
  return {
    schemeId: F.schemeId,
    cycleName: `QA-EQA-DEEP Round ${F.S}`,
    plannedStartDate: day(0),
    plannedEndDate: day(21),
    panelName: `QA-EQA-DEEP Panel ${F.S}`,
    sourceType: 'IN_HOUSE_ALIQUOTED',
    lotNumber: `QADEEP-${F.S}`,
    distributionMethod: 'CSV',
    samples: [
      { sampleCode: 'GLU-L1', testId: GLUCOSE },
      { sampleCode: 'GLU-L2', testId: GLUCOSE },
      { sampleCode: 'CRE-S3', testId: CREATININE, targetValue: '100', targetUnit: 'umol/L', acceptanceRangeLow: '80', acceptanceRangeHigh: '120' },
    ],
    participantOrganizationIds: LABS.map((l) => F.orgs?.[l]),
    ...over,
  };
}

async function transition(page: any, newState: string) {
  return api(page, 'PATCH', `/eqa/cycles/${F.cycleId}/transition`, { newState, stateMachine: 'PROVIDER', reason: `QA-EQA-DEEP ${newState}` });
}

test.describe('EQA provider lane, deep (TC-EQAP)', () => {
  test.beforeEach(async ({ page }) => { await ready(page); });

  test('TC-EQAP-00 [setup]: eight QA laboratories and a regional PT scheme on Glucose and Creatinine', async ({ page }) => {
    if (!F.orgs) {
      const L = await lists(page);
      let t: string; let referral: Record<string, string> | undefined;
      // A referral lab needs an approval status before the Locations form will save it again (25).
      try { t = typeId(L, 'referral lab'); referral = { approvalStatus: 'Approved' }; } catch { t = typeId(L, 'referring clinic'); }
      F.orgs = {}; F.orgNames = {};
      for (const l of [...LABS, 'H']) {
        const name = `QA-EQA-DEEP Lab ${l} ${F.S}`;
        F.orgs[l] = await createOrg(page, { name, typeIds: [t], identifiers: [{ label: 'Code', value: `QED${l}${F.S}`, reporting: true }], ...(referral ? { referral } : {}) });
        F.orgNames[l] = name;
      }
      save();
    }
    if (!F.schemeId) {
      F.schemeName = `QA-EQA-DEEP PT ${F.S}`;
      const r = await api(page, 'POST', '/eqa/programs', { name: F.schemeName, provider: `QA-EQA-DEEP Provider ${F.S}`, schemeType: 'REGIONAL_PT', description: 'QA deep provider lane' });
      expect([200, 201], `create scheme: ${r.text}`).toContain(r.status);
      F.schemeId = String(r.json.id);
      save();
    }
    const t = await api(page, 'PUT', `/eqa/programs/${F.schemeId}/tests`, { testIds: [Number(GLUCOSE), Number(CREATININE)] });
    expect(t.status, `assign tests: ${t.text}`).toBe(200);
    const e = await api(page, 'GET', `/eqa/programs/${F.schemeId}/enrollments`);
    const enrolled = new Set((e.json ?? []).map((x: any) => String(x.organizationId)));
    const missing = [...LABS, 'H'].map((l) => F.orgs[l]).filter((id) => !enrolled.has(String(id)));
    if (missing.length) {
      const en = await api(page, 'POST', `/eqa/programs/${F.schemeId}/enrollments`, { organizationIds: missing });
      expect(en.status, `enroll: ${en.text}`).toBe(201);
    }
    const after = await api(page, 'GET', `/eqa/programs/${F.schemeId}/enrollments`);
    F.enrollH = String((after.json ?? []).find((x: any) => String(x.organizationId) === String(F.orgs.H))?.id);
    save();
    note('EQAP-00', { scheme: F.schemeId, orgs: F.orgs });
  });

  test('TC-EQAP-01: an external scheme needs a provider; an in-house one does not', async ({ page }) => {
    const ext = await api(page, 'POST', '/eqa/programs', { name: `QA-EQA-DEEP NoProv ${F.S}`, schemeType: 'INTERNATIONAL_PT' });
    expect(ext.status, `external scheme without a provider: ${ext.text}`).toBe(400);
    const ih = await api(page, 'POST', '/eqa/programs', { name: `QA-EQA-DEEP IH-NoProv ${F.S}`, schemeType: 'IN_HOUSE' });
    expect([200, 201], `in-house scheme without a provider: ${ih.text}`).toContain(ih.status);
    const bad = await api(page, 'POST', '/eqa/programs', { name: `QA-EQA-DEEP BadType ${F.S}`, schemeType: 'SOMETHING', provider: 'x' });
    expect(bad.status, 'unknown scheme type').toBe(400);
  });

  test('TC-EQAP-02: the roster: suspend, reinstate, withdraw for good; enrolling a lab twice is refused', async ({ page }) => {
    const put = (status: string) => api(page, 'PUT', `/eqa/programs/${F.schemeId}/enrollments/${F.enrollH}`, { status, reason: `QA ${status}` });
    expect((await put('Suspended')).status, 'Active to Suspended').toBe(200);
    expect((await put('Active')).status, 'Suspended to Active').toBe(200);
    expect((await put('Withdrawn')).status, 'Active to Withdrawn').toBe(200);
    const back = await put('Active');
    expect(back.status, `Withdrawn is final: ${back.text}`).toBe(400);
    const twice = await api(page, 'POST', `/eqa/programs/${F.schemeId}/enrollments`, { organizationIds: [F.orgs.A] });
    expect(twice.status, `enrolling lab A again: ${twice.text}`).toBe(409);
  });

  test.describe('cycle wizard refuses a round it cannot run', () => {
    test('TC-EQAP-15: duplicate sample codes', async ({ page }) => {
      const b = wizardBody({ samples: [{ sampleCode: 'DUP', testId: GLUCOSE }, { sampleCode: 'DUP', testId: GLUCOSE }] });
      const r = await api(page, 'POST', '/eqa/provider/cycles', b);
      expect(r.status, r.text).toBe(422);
    });
    test('TC-EQAP-16: an acceptance range whose low is above its high', async ({ page }) => {
      const b = wizardBody({ samples: [{ sampleCode: 'X1', testId: CREATININE, targetValue: '100', acceptanceRangeLow: '120', acceptanceRangeHigh: '80' }] });
      const r = await api(page, 'POST', '/eqa/provider/cycles', b);
      expect(r.status, r.text).toBe(422);
    });
    test('TC-EQAP-17: a laboratory that is not enrolled (H is withdrawn)', async ({ page }) => {
      const r = await api(page, 'POST', '/eqa/provider/cycles', wizardBody({ participantOrganizationIds: [F.orgs.A, F.orgs.H] }));
      expect(r.status, r.text).toBe(422);
    });
    test('TC-EQAP-18: a submission deadline before the distribution date [FLIP-WHEN-FIXED]', async ({ page }) => {
      // FLIP-WHEN-FIXED (found 2026-10-12). ISO/IEC 17043 7.3.5.2: the participant is told the last
      // date results are accepted; a deadline before dispatch cannot be met. The wizard endpoint
      // checks neither date against the other (EQACycleServiceImpl.createProviderCycle).
      test.fail();
      const r = await api(page, 'POST', '/eqa/provider/cycles', wizardBody({ cycleName: `QA-EQA-DEEP Backwards ${F.S}`, plannedStartDate: day(10), plannedEndDate: day(2) }));
      note('EQAP-18', { status: r.status, body: r.text.slice(0, 200) });
      expect(r.status, 'deadline before distribution is refused').toBe(422);
    });
    test('TC-EQAP-19: a panel sample for a test the scheme does not cover [FLIP-WHEN-FIXED]', async ({ page }) => {
      // FLIP-WHEN-FIXED (seen 2026-10-06 on OGC-1251, confirmed 2026-10-12). The scheme plan names
      // what is tested (17043 7.2.1.3); POST /panels refuses a test off the scheme, the provider
      // cycle wizard accepts it (Hemoglobin, test 15, on a Glucose/Creatinine scheme).
      test.fail();
      const r = await api(page, 'POST', '/eqa/provider/cycles', wizardBody({ cycleName: `QA-EQA-DEEP OffScheme ${F.S}`, samples: [{ sampleCode: 'HB-1', testId: '15' }] }));
      note('EQAP-19', { status: r.status, body: r.text.slice(0, 200) });
      expect(r.status, 'a test off the scheme is refused').toBe(422);
    });
  });

  test('TC-EQAP-03 [create]: the round is created with three samples and seven laboratories, in preparation', async ({ page }) => {
    if (!F.cycleId) {
      const r = await api(page, 'POST', '/eqa/provider/cycles', wizardBody());
      expect(r.status, `create cycle: ${r.text}`).toBe(201);
      F.cycleId = String(r.json.id);
      save();
    }
    const prep = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/prep`);
    expect(prep.status).toBe(200);
    expect(prep.json.cycleStatus).toBe('PREP_IN_PROGRESS');
    expect(prep.json.participantCount, 'seven laboratories on the round').toBe(7);
    F.panelId = String(prep.json.panels[0].panelId);
    expect(prep.json.panels[0].sampleCount).toBe(3);
    const grid = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/results?organizationId=${F.orgs.A}`);
    F.samples = Object.fromEntries((grid.json.tests ?? []).map((t: any) => [t.sampleCode, String(t.panelSampleId)]));
    expect(Object.keys(F.samples).sort()).toEqual(['CRE-S3', 'GLU-L1', 'GLU-L2']);
    save();
    // The scheme's type is part of the plan once a round is running.
    const retype = await api(page, 'PUT', `/eqa/programs/${F.schemeId}`, { schemeType: 'IN_HOUSE' });
    note('EQAP-03.retype', { status: retype.status, body: retype.text.slice(0, 200) });
    expect(retype.status, 'scheme type cannot change while a round is open').toBeGreaterThanOrEqual(400);
  });

  test('TC-EQAP-04: nothing ships before homogeneity QC passes and enough aliquots exist', async ({ page }) => {
    const early = await transition(page, 'READY_TO_SHIP');
    expect(early.status, `ready to ship with no prep: ${early.text}`).toBeGreaterThanOrEqual(400);
    const noQc = await api(page, 'PATCH', `/eqa/panels/${F.panelId}/prep`, { aliquotsProduced: 25, aliquotsReserved: 2, homogeneityQcPassed: false });
    expect(noQc.status).toBe(200);
    expect(noQc.json.readyToShipAllowed, `blockers: ${JSON.stringify(noQc.json.blockers)}`).toBe(false);
    expect((await transition(page, 'READY_TO_SHIP')).status, 'homogeneity not passed').toBeGreaterThanOrEqual(400);
    const short = await api(page, 'PATCH', `/eqa/panels/${F.panelId}/prep`, { aliquotsProduced: 10, aliquotsReserved: 2, homogeneityQcPassed: true, homogeneityQcNotes: 'QA homogeneity n=10 ok' });
    expect(short.json.readyToShipAllowed, '3 samples x 7 labs + 2 reserve need 23 aliquots').toBe(false);
    const ok = await api(page, 'PATCH', `/eqa/panels/${F.panelId}/prep`, { aliquotsProduced: 25, aliquotsReserved: 2, homogeneityQcPassed: true, homogeneityQcNotes: 'QA homogeneity n=10 ok' });
    expect(ok.json.readyToShipAllowed, `blockers: ${JSON.stringify(ok.json.blockers)}`).toBe(true);
    const go = await transition(page, 'READY_TO_SHIP');
    expect(go.status, go.text).toBe(200);
  });

  test('TC-EQAP-05: results are refused before dispatch; shipping and delivery to all seven open submissions', async ({ page }) => {
    const early = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/results`, { organizationId: F.orgs.A, results: [{ testId: CREATININE, value: '100' }] });
    expect(early.status, `results before dispatch: ${early.text}`).toBe(409);
    for (const l of LABS) {
      const s = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/shipments`, { organizationId: F.orgs[l], courier: 'QA Courier', trackingNumber: `QATRK${l}${F.S}`, estimatedDeliveryDate: day(3) });
      expect(s.status, `box for ${l}: ${s.text}`).toBe(200);
    }
    const ship = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/shipments/ship`, { organizationIds: LABS.map((l) => F.orgs[l]) });
    expect(ship.status, ship.text).toBe(200);
    for (const l of LABS) {
      const d = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/receipts/${F.orgs[l]}/delivered`);
      expect(d.status, `delivered ${l}: ${d.text}`).toBe(200);
    }
    const c = await api(page, 'GET', `/eqa/cycles/${F.cycleId}`);
    expect(c.json.status, 'every panel delivered opens submissions').toBe('SUBMISSIONS_OPEN');
  });

  test('TC-EQAP-06: result intake: two levels of one test need the sample named; labs A to F report, G does not', async ({ page }) => {
    const ambiguous = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/results`, { organizationId: F.orgs.A, results: [{ testId: GLUCOSE, value: '100' }] });
    expect(ambiguous.status, `Glucose without the level: ${ambiguous.text}`).toBe(422);
    const labs = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const [i, l] of labs.entries()) {
      const r = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/results`, {
        organizationId: F.orgs[l],
        results: [
          { testId: GLUCOSE, panelSampleId: F.samples['GLU-L1'], value: String(L1[i]) },
          { testId: GLUCOSE, panelSampleId: F.samples['GLU-L2'], value: String(L2[i]) },
          { testId: CREATININE, panelSampleId: F.samples['CRE-S3'], value: String(S3[l]) },
        ],
      });
      expect(r.status, `intake ${l}: ${r.text}`).toBe(200);
    }
    const g = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/results?organizationId=${F.orgs.F}`);
    const reported = Object.fromEntries((g.json.tests ?? []).map((t: any) => [t.sampleCode, t.reported]));
    expect(String(reported['GLU-L1'])).toMatch(/^1000(\.0+)?$/);
  });

  test('TC-EQAP-07: scoring: every z is (x - mean) / SD of the reported values, and the verdict follows it', async ({ page }) => {
    const s = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/score`);
    expect(s.status, s.text).toBe(200);
    note('EQAP-07.score', s.json);
    expect(s.json.cycleStatus).toBe('SCORED');
    const labs = ['A', 'B', 'C', 'D', 'E', 'F'];
    const zL1 = zScores(L1); const zL2 = zScores(L2);
    for (const [i, l] of labs.entries()) {
      const csv = await getText(page, `/eqa/cycles/${F.cycleId}/scores/${F.orgs[l]}/csv`);
      expect(csv.status).toBe(200);
      const rows = parseCsv(csv.text);
      const by = Object.fromEntries(rows.map((r) => [r.sample_code, r]));
      for (const [code, z] of [['GLU-L1', zL1[i]], ['GLU-L2', zL2[i]]] as const) {
        const row = by[code];
        expect(row, `${l} has a score for ${code}`).toBeTruthy();
        expect(Number(row.z_score), `${l} ${code} z`).toBeCloseTo(z, 3);
        // The code's bands: >= 3 unacceptable, >= 2 questionable. Identical to ISO except at exactly 2.
        const code_ = Math.abs(z) >= 3 ? 'UNACCEPTABLE' : Math.abs(z) >= 2 ? 'QUESTIONABLE' : 'ACCEPTABLE';
        expect(row.performance_status, `${l} ${code} verdict for z ${z.toFixed(3)}`).toBe(code_);
      }
    }
    note('EQAP-07.z', { L1: zL1.map((z) => z.toFixed(4)), L2: zL2.map((z) => z.toFixed(4)) });
  });

  test('TC-EQAP-20: a laboratory reporting ten times the others is unacceptable [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12). The assigned value is the plain mean of every result,
    // the outlier's own included, and sigma is the plain SD of the same values. With n results the
    // largest |z| any one lab can reach is (n - 1) / sqrt(n): 1.79 at the minimum of 5, 2.04 at 6,
    // and a lab can only become unacceptable from n = 11. Lab F reports 1000 against five labs at
    // about 100: z = 2.04, Questionable. ISO 13528 assigns the value robustly (Algorithm A, or a
    // reference value) so that one gross error cannot hide itself; CLIA uses a fixed limit.
    test.fail();
    const csv = parseCsv((await getText(page, `/eqa/cycles/${F.cycleId}/scores/${F.orgs.F}/csv`)).text);
    const row = csv.find((r) => r.sample_code === 'GLU-L1')!;
    note('EQAP-20', row);
    expect(row.performance_status, `lab F reported 1000 where five labs reported 99 to 102 (z ${row.z_score})`).toBe('UNACCEPTABLE');
  });

  test('TC-EQAP-21: |z| = 2.00 exactly is satisfactory [RULING]', async () => {
    // Not a defect until Casey rules: classifyPerformance treats |z| >= 2.0 as Questionable;
    // ISO 13528 9.4 and the Eurachem PT leaflet call |z| <= 2.0 satisfactory. A z of exactly 2 is
    // rare with real data; the boundary is pinned here from EQAStatisticsServiceImpl so the call
    // is visible. EQAStatisticsServiceTest asserts the code's current choice.
    test.skip(true, 'ruling pending (Casey): |z| = 2.0 Questionable (code) or satisfactory (ISO 13528 9.4)');
    expect(isoVerdict(2)).toBe('ACCEPTABLE');
  });

  test('TC-EQAP-08: a sealed acceptance range is inclusive: 80 and 120 pass, 79.99 and 120.01 fail', async ({ page }) => {
    const want: Record<string, string> = { A: 'ACCEPTABLE', B: 'ACCEPTABLE', C: 'UNACCEPTABLE', D: 'UNACCEPTABLE', E: 'ACCEPTABLE', F: 'ACCEPTABLE' };
    for (const l of Object.keys(want)) {
      const rows = parseCsv((await getText(page, `/eqa/cycles/${F.cycleId}/scores/${F.orgs[l]}/csv`)).text);
      const row = rows.find((r) => r.sample_code === 'CRE-S3');
      expect(row?.performance_status, `lab ${l} reported ${S3[l]} against 80..120`).toBe(want[l]);
      expect(Number(row?.target_value), 'the sealed target is reported back').toBe(100);
    }
  });

  test('TC-EQAP-09: a laboratory that never reports is scored as not submitted [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12). CLIA 493.823(b): failure to return results by the
    // deadline is a score of 0, unsatisfactory, unless excused. Lab G received its panel and
    // reported nothing; scoring gives it no row, no score and no follow-up, so the round reads as
    // if G had never been on it.
    test.fail();
    const rows = await api(page, 'GET', `/eqa/cycles/${F.cycleId}/scores`);
    const g = (rows.json ?? []).find((r: any) => String(r.organizationId) === String(F.orgs.G));
    const fu = await api(page, 'GET', '/eqa/provider/followups');
    const gFu = (fu.json ?? []).find((r: any) => String(r.cycleId) === String(F.cycleId) && String(r.participantOrgId) === String(F.orgs.G));
    note('EQAP-09', { scoreRow: g ?? null, followup: gFu ?? null });
    expect(g, 'lab G has a score row for the round').toBeTruthy();
    expect(gFu, 'lab G is followed up for not submitting').toBeTruthy();
  });

  test('TC-EQAP-10: one follow-up per laboratory with an unacceptable result; a response needs what the lab said (OGC-1256)', async ({ page }) => {
    const fu = await api(page, 'GET', '/eqa/provider/followups');
    expect(fu.status).toBe(200);
    const mine = (fu.json ?? []).filter((r: any) => String(r.cycleId) === String(F.cycleId));
    const orgs = mine.map((r: any) => String(r.participantOrgId)).sort();
    expect(orgs, 'labs C and D (Creatinine out of range) are followed up, no one else').toEqual([F.orgs.C, F.orgs.D].map(String).sort());
    F.followups = Object.fromEntries(mine.map((r: any) => [String(r.participantOrgId) === String(F.orgs.C) ? 'C' : 'D', String(r.id)]));
    save();
    const c = mine.find((r: any) => String(r.participantOrgId) === String(F.orgs.C));
    const row = (c.results ?? [])[0] ?? {};
    note('EQAP-10.row', row);
    expect(String(row.reported), 'the follow-up names what lab C reported').toContain('79.99');
    const blank = await api(page, 'POST', `/eqa/provider/followups/${F.followups.C}/status`, { target: 'RESPONSE_RECEIVED', notes: '  ' });
    expect(blank.status, `a response with no text: ${blank.text}`).toBe(400);
    const said = await api(page, 'POST', `/eqa/provider/followups/${F.followups.C}/status`, { target: 'RESPONSE_RECEIVED', notes: 'QA: Lab C found a pipette out of calibration; recalibrated, patient look-back 2 weeks, no change' });
    expect(said.status, said.text).toBe(200);
    const again = await api(page, 'GET', '/eqa/provider/followups');
    const c2 = (again.json ?? []).find((r: any) => String(r.id) === F.followups.C);
    expect(c2.followupStatus).toBe('RESPONSE_RECEIVED');
    expect(c2.responseNotes).toContain('pipette');
  });

  test('TC-EQAP-25: a laboratory\'s contact email is set on its organization record (OGC-1265)', async ({ page }) => {
    // OGC-1265 began as "the organization form has no email field". It is on the Locations form now.
    const email = `qa-eqa-deep-d-${F.S}@example.org`;
    await page.goto(`/MasterListsPage/locations?id=${F.orgs.D}`, { waitUntil: 'domcontentloaded' });
    const form = page.getByTestId(`locations-form-${F.orgs.D}`);
    await expect(form, 'lab D\'s record opens').toBeVisible({ timeout: 30_000 });
    const box = form.locator(`#email-${F.orgs.D}`);
    await expect(box, 'the record has an email field').toBeVisible();
    await box.fill(email);
    const saved = page.waitForResponse((r) => /\/rest\/locations\/organizations/.test(r.url()) && ['PUT', 'POST'].includes(r.request().method()));
    await form.getByTestId('locations-save').click();
    expect((await saved).status(), 'saved').toBeLessThan(300);
    // Read it back in a fresh page load.
    await page.goto(`/MasterListsPage/locations?id=${F.orgs.D}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`locations-form-${F.orgs.D}`).locator(`#email-${F.orgs.D}`)).toHaveValue(email, { timeout: 30_000 });
    F.emailD = email; save();
  });

  test('TC-EQAP-11: Notify lab says plainly when nothing was emailed (OGC-1265)', async ({ page }) => {
    // Lab C has no email; lab D has the one set on its record in 25. The local stack has no SMTP
    // connection, so no email can leave: the screen must not claim it did.
    const smtp = db(`select count(*) from clinlims.external_connection where programmed_connection ilike '%SMTP%' and active`);
    test.skip(!F.emailD, 'needs TC-EQAP-25');
    await page.goto('/qa/eqa/provider/follow-ups', { waitUntil: 'domcontentloaded' });
    for (const [l, expectText] of [['C', /No contact email on file/i], ['D', /Could not email|Notification emailed/i]] as const) {
      const row = page.getByRole('row').filter({ hasText: F.orgNames[l] }).first();
      await expect(row, `lab ${l} is on the register`).toBeVisible({ timeout: 30_000 });
      // The actions sit in the row's expanded panel.
      await row.getByRole('button', { name: /^Triage$/ }).click();
      const notify = page.getByTestId(`register-triage-${F.followups[l]}`).getByRole('button', { name: /^Notify lab$/ });
      await expect(notify).toBeVisible({ timeout: 10_000 });
      const post = page.waitForResponse((r) => /\/provider\/followups\/\d+\/notify$/.test(r.url()));
      await notify.click();
      const res = await post;
      const body = await res.json().catch(() => ({}));
      note(`EQAP-11.${l}`, { status: res.status(), emailed: body.emailed, recipient: body.recipient, smtpConnections: smtp });
      await expect(page.getByText(expectText).first(), `lab ${l}: what the screen says`).toBeVisible({ timeout: 15_000 });
      if (l === 'D') expect(body.recipient, 'Notify uses the email on the lab\'s record').toBe(F.emailD);
      if (l === 'D' && smtp === '0') {
        expect(body.emailed, 'with no mail server configured, nothing was emailed').toBe(false);
        await expect(page.getByText(/Notification emailed/i)).toHaveCount(0);
      }
      await row.getByRole('button', { name: /^Triage$/ }).click();
    }
  });

  test('TC-EQAP-23: Record response on the register asks for what the lab said and shows it after (OGC-1256)', async ({ page }) => {
    const said = `QA: Lab D re-ran the sample, calibrator lot ${F.S} was expired; replaced, look-back done`;
    await page.goto('/qa/eqa/provider/follow-ups', { waitUntil: 'domcontentloaded' });
    const row = page.getByRole('row').filter({ hasText: F.orgNames.D }).first();
    await expect(row, 'lab D is on the register').toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: /^Triage$/ }).click();
    const panel = page.getByTestId(`register-triage-${F.followups.D}`);
    await panel.getByRole('button', { name: /^Record response$/ }).click();
    const modal = page.locator('.cds--modal.is-visible');
    await expect(modal.getByLabel('What the laboratory said'), 'a field for the response').toBeVisible({ timeout: 10_000 });
    const confirm = modal.getByRole('button', { name: /^Confirm$/ });
    await expect(confirm, 'nothing to record yet').toBeDisabled();
    await modal.getByLabel('What the laboratory said').fill(said);
    const post = page.waitForResponse((r) => new RegExp(`/provider/followups/${F.followups.D}/status$`).test(r.url()));
    await confirm.click();
    expect((await post).status(), 'recorded').toBe(200);
    // After a reload the register still shows it.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const row2 = page.getByRole('row').filter({ hasText: F.orgNames.D }).first();
    await expect(row2).toBeVisible({ timeout: 30_000 });
    await row2.getByRole('button', { name: /^Triage$/ }).click();
    await expect(page.getByTestId(`register-triage-${F.followups.D}`), 'the response is kept with the follow-up').toContainText(said, { timeout: 15_000 });
  });

  test('TC-EQAP-24: resolving a follow-up needs a written reason [FLIP-WHEN-FIXED]', async ({ page }) => {
    // FLIP-WHEN-FIXED (found 2026-10-12, code review). ISO/IEC 17043 and SLIPTA 8.21: the provider
    // keeps a record of how each unsatisfactory result was closed. Record response refuses blank
    // notes; Resolve and Remove from scheme open the same notes prompt but accept it blank, client
    // and server (EQAParticipantFollowupServiceImpl, ProviderFollowupRegister.jsx). Remove from
    // scheme also withdraws the lab's enrollment, so it is not tried here.
    test.fail();
    const r = await api(page, 'POST', `/eqa/provider/followups/${F.followups.C}/status`, { target: 'RESOLVED', notes: '  ' });
    note('EQAP-24', { status: r.status, body: r.text.slice(0, 160) });
    expect(r.status >= 400 && r.status < 500, `Resolve with no reason is refused (got ${r.status})`).toBe(true);
  });

  test('TC-EQAP-22: the round cannot close while a follow-up is open; it closes once both are resolved', async ({ page }) => {
    const early = await transition(page, 'CLOSED');
    expect(early.status, `close with open follow-ups: ${early.text}`).toBe(409);
    const now = (await api(page, 'GET', '/eqa/provider/followups')).json ?? [];
    for (const l of ['C', 'D']) {
      // 24 may already have resolved C (with no reason) while that defect stands.
      if (now.find((x: any) => String(x.id) === F.followups[l])?.followupStatus === 'RESOLVED') continue;
      const r = await api(page, 'POST', `/eqa/provider/followups/${F.followups[l]}/status`, { target: 'RESOLVED', notes: `QA: corrective action verified for lab ${l}` });
      expect(r.status, `resolve ${l}: ${r.text}`).toBe(200);
    }
    const late = await transition(page, 'CLOSED');
    expect(late.status, late.text).toBe(200);
  });

  test('TC-EQAP-12: what a participant receives does not name the other laboratories', async ({ page }) => {
    // ISO/IEC 17043 4.2.5: participant identity is confidential; reports use codes.
    const pdf = await getPdf(page, `/eqa/cycles/${F.cycleId}/participants/${F.orgs.A}/performance-report`);
    expect(pdf.status).toBe(200);
    const text = pdfText(pdf.bytes);
    note('EQAP-12', { chars: text.length, sample: text.slice(0, 300) });
    expect(text.length, 'the report text could be read').toBeGreaterThan(50);
    // Positive control: the decoder reads the report's own words, so an absent name means absent.
    expect(text, 'lab A\'s report names lab A').toContain(`Lab A ${F.S}`);
    for (const l of ['B', 'C', 'D', 'E', 'F', 'G']) {
      expect(text, `lab A's report names lab ${l}`).not.toContain(`Lab ${l} ${F.S}`);
    }
    const csv = await getText(page, `/eqa/cycles/${F.cycleId}/scores/${F.orgs.A}/csv`);
    for (const l of ['B', 'C', 'D', 'E', 'F', 'G']) expect(csv.text).not.toContain(`Lab ${l} ${F.S}`);
  });

  test('TC-EQAP-13: once scored, results and scores are read-only', async ({ page }) => {
    const intake = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/results`, { organizationId: F.orgs.A, results: [{ testId: CREATININE, panelSampleId: F.samples['CRE-S3'], value: '100' }] });
    expect(intake.status, `intake after scoring: ${intake.text}`).toBe(409);
    const rescore = await api(page, 'POST', `/eqa/cycles/${F.cycleId}/score`);
    expect(rescore.status, `scoring twice: ${rescore.text}`).toBe(409);
    const rows = parseCsv((await getText(page, `/eqa/cycles/${F.cycleId}/scores/${F.orgs.C}/csv`)).text);
    expect(rows.find((r) => r.sample_code === 'CRE-S3')?.result_value, 'lab C still reads 79.99').toMatch(/^79\.99/);
  });

  test('TC-EQAP-14: a Reception user cannot act as the provider', async ({ browser }) => {
    // Own context and own login: nothing here touches the shared admin session.
    const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    try {
      await performUiLogin(p, process.env.OE_RECEPT_USER ?? 'qa_recept', process.env.OE_RECEPT_PASS ?? 'QArecept1!');
      const r = await api(p, 'POST', '/eqa/programs', { name: `QA-EQA-DEEP Recept ${F.S}`, schemeType: 'IN_HOUSE' });
      expect(r.status, `scheme create as Reception: ${r.text}`).toBe(403);
      const sc = await api(p, 'POST', `/eqa/cycles/${F.cycleId}/score`);
      expect(sc.status, 'scoring as Reception').toBe(403);
      // The screen itself opens for Reception (route guard RECEPTION|RESULTS|GLOBAL_ADMIN or
      // qa.view.eqa); recorded, not asserted.
      await p.goto('/qa/eqa/provider/schemes', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(3000);
      const opened = await p.getByText(/EQA schemes we provide/i).first().isVisible();
      note('EQAP-14.screen', { receptionSeesProviderScreen: opened });
    } finally {
      await ctx.close();
    }
  });
});
