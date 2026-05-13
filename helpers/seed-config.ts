/**
 * OpenELIS Global QA — Bulk Seed Configuration
 *
 * Defines targets and fixed-name data for the E1 seed script. All names
 * use the `QA_AUTO_` prefix so seeded records are easy to identify and
 * bulk-delete after a test cycle.
 *
 * Adjust the TARGETS to match your test scenario. The seed script reads
 * these as defaults; CLI flags override per-run.
 *
 * Consumers:
 *   - seed-data.ts (the CLI entry)
 *   - helpers/seed-factory.ts (the bulk operations)
 *   - SKILL.md Step 0.6 Data Census (the "fix when census returns zero" path)
 */

export const QA_PREFIX = 'QA_AUTO';

/**
 * Default targets per SKILL.md Phase E1 — these match what the workplan
 * asks for: 50 patients, 100 orders, 20 in-progress, 10 ready-for-validation,
 * 5 rejected. The seed script will create only the *delta* between the
 * census and these targets, so re-runs are idempotent.
 */
export const TARGETS = {
  patients: 50,
  orders: 100,
  inProgress: 20,
  readyForValidation: 10,
  rejected: 5,
} as const;

/**
 * Lab sections we want orders spread across. Each section gets ~targets/5
 * orders by default. The factory will look up the testSectionId for each
 * name at runtime via the GET /rest/TestSectionRest endpoint (or fall back
 * to the legacy /test-section endpoint).
 */
export const LAB_SECTIONS = [
  'Hematology',
  'Biochemistry',
  'Immunology',
  'Molecular Biology',
  'Microbiology',
] as const;

/**
 * Pool of realistic patient names. Each seeded patient gets a unique
 * national ID like `QA_AUTO_P0001` through `QA_AUTO_P0050` and a name
 * drawn from this pool (cycling if pool is smaller than target). Names
 * are deliberately unremarkable so test screenshots don't accidentally
 * leak into real publications.
 */
export const PATIENT_NAMES: Array<{ first: string; last: string }> = [
  { first: 'Alice', last: 'Anderson' },
  { first: 'Bob', last: 'Brown' },
  { first: 'Carol', last: 'Carter' },
  { first: 'David', last: 'Davis' },
  { first: 'Eve', last: 'Edwards' },
  { first: 'Frank', last: 'Foster' },
  { first: 'Grace', last: 'Garcia' },
  { first: 'Henry', last: 'Hill' },
  { first: 'Iris', last: 'Irving' },
  { first: 'Jack', last: 'Johnson' },
  { first: 'Kate', last: 'King' },
  { first: 'Leo', last: 'Lopez' },
  { first: 'Mia', last: 'Miller' },
  { first: 'Noah', last: 'Nelson' },
  { first: 'Olivia', last: 'Owens' },
  { first: 'Peter', last: 'Patel' },
  { first: 'Quinn', last: 'Quigley' },
  { first: 'Ruth', last: 'Roberts' },
  { first: 'Sam', last: 'Smith' },
  { first: 'Tara', last: 'Thomas' },
  { first: 'Uma', last: 'Underwood' },
  { first: 'Victor', last: 'Vasquez' },
  { first: 'Wendy', last: 'Wong' },
  { first: 'Xavier', last: 'Xiu' },
  { first: 'Yara', last: 'Young' },
];

/**
 * Test catalog — the seed script needs to know which tests exist and
 * their `sampleTypeId` / `testSectionId` to construct valid order
 * payloads. This is populated at runtime by calling `discoverTestCatalog()`
 * in seed-factory.ts. The structure here is the SHAPE we expect; do not
 * hard-code IDs because they vary between instances.
 */
export interface TestCatalogEntry {
  testId: string;
  testName: string;
  sampleType: string;
  sampleTypeId: string;
  testSection: string;
  testSectionId: string;
}

/**
 * Outcome categories that the orders should land in. The seed script
 * targets these as final states; not every order will transit every step
 * because BUG-31 (Carbon Accept checkbox) currently blocks the UI path
 * for entering results. The factory will attempt API substitution where
 * available and document failures per SKILL §11.5 Blocking-Bug Etiquette.
 */
export type OrderTargetStatus =
  | 'CREATED'           // order exists, no sample collected
  | 'IN_PROGRESS'       // sample received, awaiting result entry
  | 'READY_FOR_VALIDATION' // result entered, awaiting biologist review
  | 'VALIDATED'         // validated, ready for reporting
  | 'REJECTED';         // sample rejected at receipt

/**
 * Helpers to construct prefixed identifiers. Idempotency depends on these
 * — the seed script searches existing data for these patterns before
 * creating new records.
 */
export function patientNationalId(index: number): string {
  return `${QA_PREFIX}_P${String(index).padStart(4, '0')}`;
}

export function patientLastName(index: number): string {
  // The actual last name on the patient record. Combined with QA_PREFIX
  // so patient search by lastName=QA_AUTO surfaces all seeded patients.
  return `${QA_PREFIX}_${PATIENT_NAMES[index % PATIENT_NAMES.length].last}`;
}

export function patientFirstName(index: number): string {
  return PATIENT_NAMES[index % PATIENT_NAMES.length].first;
}

export function patientDOB(index: number): string {
  // Stable DOB per index. Returns ISO YYYY-MM-DD; convert to dd/mm/yyyy
  // in the form-fill helper. Spread across decades so age-based queries
  // surface realistic distributions.
  const year = 1950 + (index * 7) % 60;
  const month = ((index * 3) % 12) + 1;
  const day = ((index * 17) % 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function patientGender(index: number): 'M' | 'F' {
  return index % 2 === 0 ? 'F' : 'M';
}
