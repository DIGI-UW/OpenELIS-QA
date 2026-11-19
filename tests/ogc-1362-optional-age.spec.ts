import { Page, test, expect } from "@playwright/test";
import { isSettingOn, setSetting } from "../helpers/dev-vendor/esig-admin";
import { createSampleOrder } from "../helpers/dev-vendor/seed-tat-data";
import { NAV_TIMEOUT, UI_TIMEOUT } from "../helpers/dev-vendor/timeouts";

// Setup helpers follow the dev team's ogc-1362-optional-patient-sex-age.spec.ts (age-only ranges here).

const API = "/api/OpenELIS-Global";
const CATALOG = `${API}/rest/test-catalog`;
const SERUM_SAMPLE_TYPE_ID = "2";
const ESIG_SETTING = "electronicSignatureEnabled";

async function createAgeSpecificTest(page: Page): Promise<string> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const stamp = Date.now().toString().slice(-8);
  const name = `OGC1362 Age ${stamp}`;
  const result = await page.evaluate(
    async ({ catalog, name, stamp, sampleTypeId }) => {
      const headers = {
        "Content-Type": "application/json",
        "X-CSRF-Token": localStorage.getItem("CSRF") || "",
      };
      const call = async (path: string, method: string, body: unknown) => {
        const res = await fetch(`${catalog}${path}`, {
          method,
          credentials: "include",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      };
      const labUnits = JSON.parse(
        (await call("/lab-units", "GET", undefined)).text,
      );
      const created = await call("/tests", "POST", {
        name,
        reportingName: name,
        code: `A1362${stamp}`,
        labUnitId: Array.isArray(labUnits) && labUnits[0]?.id,
        sampleTypeIds: [sampleTypeId],
        domain: "CLINICAL",
        orderable: true,
      });
      if (!created.ok) {
        return { error: `create ${created.status}: ${created.text}` };
      }
      const testId = JSON.parse(created.text).testId as string;
      const configured = await call(`/tests/${testId}/sample-results`, "PUT", {
        testId,
        components: [
          {
            code: "PRIMARY",
            label: name,
            displayOrder: 0,
            resultType: "N",
            isPrimary: true,
            showOnReport: true,
            interpretations: [],
            options: [],
          },
        ],
      });
      if (!configured.ok) {
        return { error: `sample-results ${configured.status}` };
      }
      const componentId = JSON.parse(configured.text).components[0].id;
      const range = (minAge: number, maxAge: number | null, low: number, high: number) => ({
        componentId,
        gender: "",
        minAge,
        maxAge,
        lowNormal: low,
        highNormal: high,
        lowValid: 0,
        highValid: 1000,
      });
      const ranges = await call(`/tests/${testId}/ranges`, "PUT", {
        testId,
        ranges: [range(0, 18, 11, 14), range(18, null, 13, 17)],
      });
      if (!ranges.ok) {
        return { error: `ranges ${ranges.status}: ${ranges.text}` };
      }
      const activated = await call(`/tests/${testId}/activate`, "POST", {});
      if (!activated.ok) {
        return { error: `activate ${activated.status}: ${activated.text}` };
      }
      return { testId };
    },
    { catalog: CATALOG, name, stamp, sampleTypeId: SERUM_SAMPLE_TYPE_ID },
  );
  expect(result.error, "sex-specific test setup must succeed").toBeUndefined();
  return result.testId as string;
}

/** A referring site and provider that exist on whichever stack runs the spec. */
async function existingSiteAndProvider(
  page: Page,
): Promise<{ referringSiteId?: string; providerPersonId?: string }> {
  const response = await page.request.get(`${API}/rest/SamplePatientEntry`);
  const form = await response.json();
  const items = form?.sampleOrderItems || {};
  return {
    referringSiteId: items.referringSiteList?.[0]?.id,
    providerPersonId: items.providersList?.[0]?.id,
  };
}


const AGE_SETTING = "Patient age required";
const AGE_REASON = "Reference range not applied: patient age not recorded";
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * OGC-1362 (Done 19 Nov 2026): patient age optional. Guards the age path QA verified on
 * testing: the Date of Birth marker follows "Patient age required", a patient with no birth
 * date gets no borrowed age range and says why in Results, Validation and the order save
 * response. Restores the setting it changes.
 */
test.describe("OGC-1362 optional patient age", () => {
  test("TC-1362-AGE-01: no birth date means no age range, with the reason shown", async ({ page }) => {
    test.setTimeout(300_000);
    const ageWas = await isSettingOn(page, AGE_SETTING);
    const esigWas = await isSettingOn(page, ESIG_SETTING);
    if (esigWas) await setSetting(page, ESIG_SETTING, false);
    try {
      const dobLegend = page.locator("label, legend").filter({ hasText: /^Date of Birth/ }).first();

      if (!ageWas) await setSetting(page, AGE_SETTING, true);
      await page.goto("/SamplePatientEntry", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "New Patient" }).click();
      await expect(dobLegend, "age required: Date of Birth is starred").toContainText("*", { timeout: NAV_TIMEOUT });

      await setSetting(page, AGE_SETTING, false);
      await page.goto("/SamplePatientEntry", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "New Patient" }).click();
      await expect(dobLegend).toBeVisible({ timeout: NAV_TIMEOUT });
      await expect(dobLegend, "age optional: Date of Birth not starred").not.toContainText("*");

      const testId = await createAgeSpecificTest(page);
      const saves: string[] = [];
      page.on("response", async (r) => {
        if (/\/rest\/SamplePatientEntry$/.test(new URL(r.url()).pathname) && r.request().method() === "POST") {
          try { saves.push(await r.text()); } catch { /* body gone */ }
        }
      });
      const now = new Date();
      const accession = await createSampleOrder(page, {
        labNo: "",
        receivedDate: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
        receivedTime: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`,
        sampleTypeId: SERUM_SAMPLE_TYPE_ID,
        testIds: testId,
        ...(await existingSiteAndProvider(page)),
        patient: { gender: "F", birthDateForDisplay: "" },
      });
      expect(accession, "order without a birth date must save").toBeTruthy();
      await expect.poll(() => saves.join(" ")).toContain("rangeNotAppliedTests");
      expect(saves.join(" "), "save lists the affected test").toMatch(/"rangeNotAppliedTests":\["OGC1362 Age/);

      await page.goto(`/Results?accessionNumber=${encodeURIComponent(accession)}`, { waitUntil: "domcontentloaded" });
      const row = page.getByRole("main").getByRole("row").filter({ hasText: "OGC1362 Age" }).first();
      await expect(row).toContainText(AGE_REASON, { timeout: NAV_TIMEOUT });
      await row.locator('input[id^="unifiedResultValue-"]').fill("16");
      await row.getByRole("button", { name: /^save$/i }).click();
      await expect(row.getByRole("button", { name: /^edit$/i })).toBeVisible({ timeout: UI_TIMEOUT });

      await page.goto(`/validation?type=order&accessionNumber=${encodeURIComponent(accession)}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(AGE_REASON).first()).toBeVisible({ timeout: NAV_TIMEOUT });
      await expect(page.getByText("Range not applied").first()).toBeVisible({ timeout: UI_TIMEOUT });
      await expect(page.getByRole("button", { name: /Needs review \(1\)/ })).toBeVisible({ timeout: UI_TIMEOUT });
    } finally {
      if ((await isSettingOn(page, AGE_SETTING)) !== ageWas) await setSetting(page, AGE_SETTING, ageWas);
      if (esigWas) await setSetting(page, ESIG_SETTING, true);
    }
  });
});
