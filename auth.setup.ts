// Logs into the target OpenELIS instance once and saves storage state to .auth/user.json.
// Credentials default to the published demo admin; override with OE_USER / OE_PASS env vars.
// Handles the periodic ChangePasswordLogin redirect (per the openelis-test-catalog-qa skill).
//
// The actual form-driving lives in tests/helpers/session.ts so the mid-run re-auth guard
// (tests/helpers/api-json.ts) reuses THIS login path instead of inventing a second one.
import { test as setup } from '@playwright/test';
import { performUiLogin, saveAuthState } from './tests/helpers/session';

setup('authenticate', async ({ page }) => {
  await performUiLogin(page);
  await saveAuthState(page);
});
