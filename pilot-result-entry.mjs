import fs from 'fs';
const auth = JSON.parse(fs.readFileSync(process.env.HOME + '/Documents/OpenELIS-QA-git/.auth/user.json', 'utf8'));
const jsess = auth.cookies.find(c => c.domain.includes('52.88.37.243')).value;
const origin = auth.origins.find(o => o.origin.includes('52.88.37.243'));
const csrf = origin.localStorage.find(l => l.name === 'CSRF').value;
const BASE = 'https://52.88.37.243';

async function api(p, opt = {}) {
  const headers = { 'Accept': 'application/json', 'Cookie': `JSESSIONID=${jsess}` };
  const init = { method: opt.method || 'GET', headers };
  if (opt.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-TOKEN'] = csrf;
    init.body = JSON.stringify(opt.body);
  }
  const res = await fetch(BASE + p, init);
  const text = await res.text();
  let b = text;
  try { b = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, body: b };
}

async function main() {
  const acc = 'DEV01260000000000008';
  const g = await api(`/api/OpenELIS-Global/rest/LogbookResults?labNumber=${acc}&doRange=false&finished=false`);
  console.log('GET status', g.status);
  const form = g.body;
  form.testResult[0].resultValue = '43';
  form.testResult[0].technician = 'qaauto';
  const p = await api('/api/OpenELIS-Global/rest/LogbookResults', { method: 'POST', body: form });
  console.log('POST status', p.status, JSON.stringify(p.body).slice(0, 400));
  const g2 = await api(`/api/OpenELIS-Global/rest/LogbookResults?labNumber=${acc}&doRange=false&finished=false`);
  const t = g2.body.testResult[0];
  console.log('resultValue', t.resultValue, 'analysisStatusId', t.analysisStatusId);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
