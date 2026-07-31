// Visual + interaction smoke test against the local preview server.
import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.OUT || '/tmp/shots';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1512, height: 950, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));

await page.goto(URL, { waitUntil: 'networkidle2' });
await fs.mkdir(OUT, { recursive: true });

const text = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);

console.log('H1          :', await text('.hero h1'));
console.log('SUB         :', await text('.hero .sub'));
console.log(
  'GLANCE      :',
  await page.$$eval('.glance-grid div', (ds) =>
    ds.map((d) => `${d.querySelector('span').textContent}=${d.querySelector('strong').textContent}`).join(' | '),
  ),
);
console.log('BRIEF cards :', (await page.$$('.brief-card')).length);
console.log(
  'BRIEF repos :',
  await page.$$eval('.brief-card .bc-repo', (ps) => ps.map((p) => p.textContent.trim())),
);
console.log('ACTIVE nav  :', await text('.nav-btn.active'));
console.log('HOT results :', await text('.board:not([hidden]) [data-count]'));

// Detect layout overflow / overlap issues.
const overflow = await page.evaluate(() => {
  const issues = [];
  const docW = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > docW + 2) {
    issues.push(`horizontal page overflow: ${document.documentElement.scrollWidth} > ${docW}`);
  }
  document.querySelectorAll('.repo-row:not([hidden])').forEach((row, i) => {
    if (i > 40) return;
    const r = row.getBoundingClientRect();
    if (r.right > docW + 2) issues.push(`row ${i} overflows right (${Math.round(r.right)})`);
    const cells = [...row.children].map((c) => c.getBoundingClientRect());
    for (let j = 1; j < cells.length; j++) {
      if (cells[j].left + 1 < cells[j - 1].right) {
        issues.push(`row ${i}: cell ${j - 1}/${j} overlap`);
        break;
      }
    }
  });
  document.querySelectorAll('.brief-card h3, .bc-evidence, .brief-card dd').forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 4) issues.push(`text overflow in ${el.className || el.tagName}`);
  });
  return issues;
});
console.log('LAYOUT      :', overflow.length ? overflow.slice(0, 12) : 'no overflow/overlap detected');

await page.screenshot({ path: `${OUT}/01-hero.png` });
await page.evaluate(() => document.querySelector('.brief').scrollIntoView());
await new Promise((r) => setTimeout(r, 350));
await page.screenshot({ path: `${OUT}/02-brief.png` });
await page.evaluate(() => document.querySelector('.layout').scrollIntoView());
await new Promise((r) => setTimeout(r, 350));
await page.screenshot({ path: `${OUT}/03-board.png` });

// Switch board.
await page.click('.nav-btn[data-target="rising"]');
await new Promise((r) => setTimeout(r, 400));
console.log('RISING      :', await text('.board:not([hidden]) [data-count]'), '| nav:', await text('.nav-btn.active'));

await page.click('.nav-btn[data-target="scene-shortdrama"]');
await new Promise((r) => setTimeout(r, 400));
console.log('SHORTDRAMA  :', await text('.board:not([hidden]) [data-count]'));
await page.screenshot({ path: `${OUT}/04-scene.png` });

// Search.
await page.click('.nav-btn[data-target="all"]');
await new Promise((r) => setTimeout(r, 300));
await page.type('#q', 'lipsync');
await new Promise((r) => setTimeout(r, 400));
console.log('SEARCH      :', await text('.board:not([hidden]) [data-count]'), 'results for "lipsync"');
await page.screenshot({ path: `${OUT}/05-search.png` });
await page.evaluate(() => {
  const q = document.getElementById('q');
  q.value = '';
  q.dispatchEvent(new Event('input'));
});
await new Promise((r) => setTimeout(r, 300));

// Modal.
await page.click('.board:not([hidden]) .repo-row');
await new Promise((r) => setTimeout(r, 450));
const open = await page.$eval('#detail', (d) => d.hasAttribute('open'));
console.log('MODAL open  :', open, '| title:', await text('#detail h3'));
console.log('MODAL metric:', await page.$$eval('#detail .m-metrics div', (ds) => ds.map((d) => d.textContent.trim()).join(' | ')));
await page.screenshot({ path: `${OUT}/06-modal.png` });

// Mobile view.
await page.evaluate(() => document.querySelector('.m-close')?.click());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await new Promise((r) => setTimeout(r, 450));
const mob = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}));
console.log('MOBILE      :', JSON.stringify(mob), mob.scrollW > mob.clientW + 2 ? '⚠ OVERFLOW' : 'ok');
await page.screenshot({ path: `${OUT}/07-mobile.png`, fullPage: false });

console.log('CONSOLE     :', errors.length ? errors.slice(0, 10) : 'clean');
await browser.close();
