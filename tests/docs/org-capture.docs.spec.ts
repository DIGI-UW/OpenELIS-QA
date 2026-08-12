// Discover + capture Organization Management: list, add form, edit.
import { test } from '@playwright/test';
import { go, shot, settle, DEFAULT_PII } from './capture';

test('org mgmt discover', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'org-mgmt' });
  await go(page, '/MasterListsPage');
  await page.getByText('Organization Management', { exact: true }).first().click().catch(() => {});
  await settle(page);
  console.log('LIST_URL', page.url());
  await shot(page, info, 'Organization list', { maskPii: DEFAULT_PII });
  const ctrls = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 30);
    const ths = [...document.querySelectorAll('th')].map(t => (t.textContent || '').trim()).filter(Boolean);
    const rows = document.querySelectorAll('table tbody tr').length;
    const inputs = [...document.querySelectorAll('input,select')].map(i => i.getAttribute('name') || i.getAttribute('id') || i.getAttribute('placeholder')).filter(Boolean).slice(0, 20);
    return { btns, ths, rows, inputs };
  });
  console.log('LIST_CTRLS', JSON.stringify(ctrls));

  // open the Add / Create form
  const addBtn = page.getByRole('button', { name: /add|new|create/i }).first();
  if (await addBtn.count()) {
    await addBtn.click().catch(() => {});
    await settle(page);
    console.log('ADD_URL', page.url());
    await shot(page, info, 'Add organization form', { maskPii: DEFAULT_PII });
    const form = await page.evaluate(() => [...document.querySelectorAll('label')].map(l => (l.textContent || '').trim()).filter(Boolean).slice(0, 25));
    console.log('ADD_LABELS', JSON.stringify(form));
  } else {
    console.log('NO_ADD_BUTTON');
  }
});
