// Logs into the ANALYZERS instance and saves a SEPARATE storage state, so it
// cannot overwrite .auth/user.json, which belongs to testing.

import { test as setup } from '@playwright/test';
import { performUiLogin, saveAuthState } from './tests/helpers/session';

setup('authenticate against the analyzers instance', async ({ page }) => {
  await performUiLogin(page);
  await saveAuthState(page, '.auth/analyzers.json');
});
