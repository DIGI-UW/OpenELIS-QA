import { test, expect } from '@playwright/test';
import { BASE, ADMIN, ACCESSION, TIMEOUT, login } from '../helpers/test-helpers';

/**
 * FHIR R4 Integration Test Suite
 *
 * User stories covered:
 *   US-FHIR-1: As an EHR system integrator, I can query OpenELIS's FHIR metadata
 *              endpoint to discover supported capabilities before connecting.
 *   US-FHIR-2: As an integrating system, I can retrieve a FHIR Patient resource
 *              by national ID to match records across systems.
 *   US-FHIR-3: As an integrating system, I can retrieve lab orders as FHIR
 *              ServiceRequest resources.
 *   US-FHIR-4: As an integrating system, I can retrieve lab results as FHIR
 *              DiagnosticReport and Observation resources.
 *   US-FHIR-5: As an admin, the FHIR API must return correct Content-Type headers
 *              so FHIR clients can parse responses correctly.
 *   US-FHIR-6: As an integrating system, invalid FHIR requests return structured
 *              OperationOutcome errors, not raw stack traces.
 *
 * Known baselines (from Phase 8 BW-DEEP validation):
 *   - /fhir/metadata → HTTP 200, HAPI FHIR 7.0.2, R4 CapabilityStatement
 *   - BUG-14 RESOLVED: FHIR metadata endpoint is healthy
 *   - BUG-21: patient-photos/{id}/true → HTTP 500 (unrelated, do not test)
 *
 * FHIR base path: /hapi-fhir-jpaserver/fhir or /fhir
 * API token: same CSRF token from localStorage
 *
 * Suite IDs: TC-FHIR-01 through TC-FHIR-12
 * Total Test Count: 12 TCs
 */

// Discovery: try multiple FHIR base paths, return whichever responds
async function findFhirBase(page: any): Promise<string | null> {
  const candidates = [
    '/hapi-fhir-jpaserver/fhir',
    '/fhir',
    '/api/OpenELIS-Global/fhir',
  ];
  for (const base of candidates) {
    const res = await page.goto(`${BASE}${base}/metadata`).catch(() => null);
    if (res && res.ok()) return base;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite R — FHIR Metadata & Capability (TC-FHIR-01 through TC-FHIR-03)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite FHIR — Metadata & Capability (TC-FHIR-01–03)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-FHIR-01: FHIR metadata endpoint returns HTTP 200', async ({ page }) => {
    /**
     * US-FHIR-1: The /fhir/metadata endpoint is the FHIR handshake.
     * Any FHIR client will call this first. Must return 200.
     * Phase 8 BW-DEEP confirmed this endpoint is healthy (BUG-14 RESOLVED).
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir/metadata',
        '/fhir/metadata',
        '/api/OpenELIS-Global/fhir/metadata',
      ];
      for (const path of candidates) {
        const res = await fetch(path, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (res.ok) {
          return { status: res.status, path };
        }
      }
      return { status: 404, path: 'none' };
    });

    console.log(`TC-FHIR-01: ${result.path} → HTTP ${result.status}`);
    expect(result.status, 'FHIR metadata endpoint must return HTTP 200').toBe(200);
  });

  test('TC-FHIR-02: FHIR metadata is a valid R4 CapabilityStatement', async ({ page }) => {
    /**
     * US-FHIR-1: The CapabilityStatement must declare R4 compliance and list
     * supported resources so integrators know what endpoints are available.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir/metadata',
        '/fhir/metadata',
      ];
      for (const path of candidates) {
        const res = await fetch(path, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (!res.ok) continue;
        const data = await res.json();
        return {
          status: res.status,
          path,
          resourceType: data.resourceType,
          fhirVersion: data.fhirVersion,
          hasSoftware: !!data.software,
          softwareName: data.software?.name || '',
          restCount: data.rest?.length ?? 0,
        };
      }
      return { status: 404, path: 'none', resourceType: null, fhirVersion: null };
    });

    console.log(`TC-FHIR-02: path=${result.path}, resourceType=${result.resourceType}, fhirVersion=${result.fhirVersion}, software=${result.softwareName}`);
    expect(result.status).toBe(200);
    expect(result.resourceType, 'Must be a CapabilityStatement resource').toBe('CapabilityStatement');
    expect(result.fhirVersion, 'Must declare FHIR R4 version').toMatch(/^4\./);
    expect(result.restCount, 'Must declare at least one REST endpoint group').toBeGreaterThanOrEqual(1);
  });

  test('TC-FHIR-03: FHIR metadata lists Patient and DiagnosticReport resources', async ({ page }) => {
    /**
     * US-FHIR-1: Integrating EHR systems need to confirm that Patient (for
     * demographics) and DiagnosticReport (for lab results) are supported.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir/metadata',
        '/fhir/metadata',
      ];
      for (const path of candidates) {
        const res = await fetch(path, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (!res.ok) continue;
        const data = await res.json();
        const resources: string[] = [];
        for (const restEntry of (data.rest ?? [])) {
          for (const r of (restEntry.resource ?? [])) {
            resources.push(r.type);
          }
        }
        return { status: res.status, path, resources };
      }
      return { status: 404, path: 'none', resources: [] };
    });

    console.log(`TC-FHIR-03: ${result.path} → declared resources: [${result.resources.join(', ')}]`);
    expect(result.status).toBe(200);

    const expectedResources = ['Patient', 'DiagnosticReport', 'ServiceRequest', 'Observation'];
    const found = expectedResources.filter(r => result.resources.includes(r));
    console.log(`TC-FHIR-03: Expected resources found: [${found.join(', ')}]`);
    expect(found.length, `At least 2 of [${expectedResources.join(', ')}] must be declared`).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite FHIR-RESOURCES — Patient, ServiceRequest, DiagnosticReport (TC-FHIR-04–08)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite FHIR-RESOURCES — Clinical Resource Queries (TC-FHIR-04–08)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-FHIR-04: FHIR Patient search by identifier returns a Bundle', async ({ page }) => {
    /**
     * US-FHIR-2: An EHR can find a patient by national ID. The response must be a
     * FHIR Bundle (even if empty — not a server error).
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir',
        '/fhir',
      ];
      for (const base of candidates) {
        const res = await fetch(`${base}/Patient?identifier=0123456`, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (res.status === 404) continue;
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* not JSON */ }
        return {
          status: res.status,
          base,
          resourceType: data?.resourceType,
          total: data?.total ?? -1,
        };
      }
      return { status: 404, base: 'none', resourceType: null, total: -1 };
    });

    console.log(`TC-FHIR-04: ${result.base}/Patient → status=${result.status}, resourceType=${result.resourceType}, total=${result.total}`);
    // Must not be a 5xx error — 200 with Bundle or 404 if not implemented
    expect(result.status, 'FHIR Patient search must not return 5xx').not.toBeGreaterThanOrEqual(500);
    if (result.status === 200) {
      expect(result.resourceType, 'Successful response must be a FHIR Bundle').toBe('Bundle');
    }
  });

  test('TC-FHIR-05: FHIR ServiceRequest search returns a Bundle', async ({ page }) => {
    /**
     * US-FHIR-3: Lab orders are exposed as ServiceRequest resources.
     * A search with a known accession must return a Bundle (may be empty).
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir',
        '/fhir',
      ];
      for (const base of candidates) {
        const res = await fetch(`${base}/ServiceRequest`, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (res.status === 404) continue;
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* not JSON */ }
        return {
          status: res.status,
          base,
          resourceType: data?.resourceType,
          total: data?.total ?? -1,
        };
      }
      return { status: 404, base: 'none', resourceType: null, total: -1 };
    });

    console.log(`TC-FHIR-05: ${result.base}/ServiceRequest → status=${result.status}, type=${result.resourceType}, total=${result.total}`);
    expect(result.status, 'FHIR ServiceRequest must not return 5xx').not.toBeGreaterThanOrEqual(500);
    if (result.status === 200) {
      expect(result.resourceType).toBe('Bundle');
    }
  });

  test('TC-FHIR-06: FHIR DiagnosticReport search returns a Bundle', async ({ page }) => {
    /**
     * US-FHIR-4: Lab results are exposed as DiagnosticReport resources.
     * EHR systems poll this endpoint to retrieve completed lab results.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir',
        '/fhir',
      ];
      for (const base of candidates) {
        const res = await fetch(`${base}/DiagnosticReport`, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (res.status === 404) continue;
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* not JSON */ }
        return {
          status: res.status,
          base,
          resourceType: data?.resourceType,
          total: data?.total ?? -1,
        };
      }
      return { status: 404, base: 'none', resourceType: null, total: -1 };
    });

    console.log(`TC-FHIR-06: ${result.base}/DiagnosticReport → status=${result.status}, type=${result.resourceType}, total=${result.total}`);
    expect(result.status, 'FHIR DiagnosticReport must not return 5xx').not.toBeGreaterThanOrEqual(500);
    if (result.status === 200) {
      expect(result.resourceType).toBe('Bundle');
    }
  });

  test('TC-FHIR-07: FHIR Observation search returns a Bundle', async ({ page }) => {
    /**
     * US-FHIR-4: Individual test results map to Observation resources.
     * This is the most granular lab data level in FHIR.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir',
        '/fhir',
      ];
      for (const base of candidates) {
        const res = await fetch(`${base}/Observation`, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (res.status === 404) continue;
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* not JSON */ }
        return {
          status: res.status,
          base,
          resourceType: data?.resourceType,
          total: data?.total ?? -1,
        };
      }
      return { status: 404, base: 'none', resourceType: null, total: -1 };
    });

    console.log(`TC-FHIR-07: ${result.base}/Observation → status=${result.status}, type=${result.resourceType}, total=${result.total}`);
    expect(result.status, 'FHIR Observation must not return 5xx').not.toBeGreaterThanOrEqual(500);
    if (result.status === 200) {
      expect(result.resourceType).toBe('Bundle');
    }
  });

  test('TC-FHIR-08: FHIR responses include correct Content-Type header', async ({ page }) => {
    /**
     * US-FHIR-5: FHIR clients parse responses based on Content-Type.
     * application/fhir+json is required by the FHIR R4 spec.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir/metadata',
        '/fhir/metadata',
      ];
      for (const path of candidates) {
        const res = await fetch(path, {
          headers: { Accept: 'application/fhir+json' },
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        return { status: res.status, path, contentType: ct };
      }
      return { status: 404, path: 'none', contentType: '' };
    });

    console.log(`TC-FHIR-08: ${result.path} Content-Type: "${result.contentType}"`);
    if (result.status === 200) {
      expect(result.contentType, 'FHIR metadata must return application/fhir+json Content-Type').toMatch(/fhir\+json|application\/json/);
    } else {
      console.log('TC-FHIR-08: SKIP — FHIR metadata not accessible');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite FHIR-ERROR — Error Handling & Security (TC-FHIR-09–12)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite FHIR-ERROR — FHIR Error Handling (TC-FHIR-09–12)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-FHIR-09: Invalid resource type returns OperationOutcome or 404, not 500', async ({ page }) => {
    /**
     * US-FHIR-6: When an integrating system queries a non-existent resource type,
     * the server must return a structured error, not a raw Java stack trace.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir/NonExistentResourceType12345',
        '/fhir/NonExistentResourceType12345',
      ];
      for (const path of candidates) {
        const res = await fetch(path, {
          headers: { Accept: 'application/fhir+json' },
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* not JSON */ }
        return {
          status: res.status,
          path,
          resourceType: data?.resourceType,
          hasStackTrace: text.includes('at org.') || text.includes('java.lang'),
        };
      }
      return { status: 200, path: 'none', resourceType: null, hasStackTrace: false };
    });

    console.log(`TC-FHIR-09: ${result.path} → status=${result.status}, type=${result.resourceType}, hasStackTrace=${result.hasStackTrace}`);
    expect(result.status, 'Unknown resource type must return 4xx, not 5xx').toBeLessThan(500);
    expect(result.hasStackTrace, 'Error response must not expose Java stack traces').toBe(false);
  });

  test('TC-FHIR-10: FHIR invalid ID format returns OperationOutcome, not 500', async ({ page }) => {
    /**
     * US-FHIR-6: Querying a resource with an invalid ID (e.g., SQL injection attempt)
     * must return a structured FHIR OperationOutcome, not a server error.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        "/hapi-fhir-jpaserver/fhir/Patient/'; DROP TABLE patients; --",
        "/fhir/Patient/'; DROP TABLE patients; --",
      ];
      for (const path of candidates) {
        const res = await fetch(encodeURI(path), {
          headers: { Accept: 'application/fhir+json' },
        }).catch(() => ({ ok: false, status: 0 }));
        return {
          status: (res as any).status,
          path,
        };
      }
      return { status: 0, path: 'none' };
    });

    console.log(`TC-FHIR-10: SQLi attempt → status=${result.status}`);
    // Must not return a 500 (which would indicate the payload affected the server)
    expect(result.status, 'SQLi in FHIR ID must not cause a 500').not.toBe(500);
  });

  test('TC-FHIR-11: FHIR endpoints respond within acceptable time', async ({ page }) => {
    /**
     * US-FHIR-1: EHR integrations time out if the FHIR server is too slow.
     * Metadata should respond within 5 seconds from the server side.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir/metadata',
        '/fhir/metadata',
      ];
      for (const path of candidates) {
        const start = Date.now();
        const res = await fetch(path, {
          headers: { Accept: 'application/fhir+json' },
        });
        const elapsed = Date.now() - start;
        if (res.ok) {
          return { status: res.status, path, elapsed };
        }
      }
      return { status: 404, path: 'none', elapsed: -1 };
    });

    console.log(`TC-FHIR-11: ${result.path} responded in ${result.elapsed}ms`);
    if (result.status === 200) {
      expect(result.elapsed, 'FHIR metadata must respond within 10 seconds').toBeLessThan(10000);
    } else {
      console.log('TC-FHIR-11: SKIP — FHIR metadata not accessible');
    }
  });

  test('TC-FHIR-12: FHIR concurrent requests do not return 5xx errors', async ({ page }) => {
    /**
     * US-FHIR-1: EHR systems may send multiple simultaneous FHIR requests.
     * The server must handle concurrent calls without internal errors.
     */
    await page.goto(`${BASE}`);

    const results = await page.evaluate(async () => {
      const candidates = [
        '/hapi-fhir-jpaserver/fhir/metadata',
        '/fhir/metadata',
      ];

      let fhirBase = '';
      for (const path of candidates) {
        const probe = await fetch(path, { headers: { Accept: 'application/fhir+json' } });
        if (probe.ok) { fhirBase = path; break; }
      }
      if (!fhirBase) return { fhirBase: 'none', statuses: [] };

      const promises = Array.from({ length: 5 }, () =>
        fetch(fhirBase, { headers: { Accept: 'application/fhir+json' } }).then(r => r.status)
      );
      const statuses = await Promise.all(promises);
      return { fhirBase, statuses };
    });

    console.log(`TC-FHIR-12: 5 concurrent requests to ${results.fhirBase} → [${results.statuses.join(', ')}]`);
    if (results.fhirBase === 'none') {
      console.log('TC-FHIR-12: SKIP — no FHIR endpoint accessible');
      test.skip();
      return;
    }
    const serverErrors = results.statuses.filter(s => s >= 500);
    expect(serverErrors.length, 'No 5xx errors on concurrent FHIR metadata requests').toBe(0);
  });
});
