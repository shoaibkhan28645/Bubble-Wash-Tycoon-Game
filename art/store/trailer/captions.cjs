// Captions for the cinematic trailer, in the game's title style (Lilita One, white with a dark-teal outline, key
// words in sunny yellow), one line each, as transparent 1920x1080 PNGs in frames/.  node captions.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const caps = [
  ['k1', 'Start with one <y>car wash</y>'],
  ['k2', '<y>Build</y> it up!'],
  ['k3', 'Hire a <y>crew</y>, earn more'],
  ['k4', 'Grow a <y>farm</y>'],
  ['k5', 'Run a <y>theme park</y>'],
  ['k6', 'Rule the <y>skies!</y>'],
  ['kend', 'Play now!'],
];
const TEAL = '#0e5f73';
const html = (text, end) => `<!doctype html><html><head><style>
@font-face { font-family: 'Lilita One'; src: url('../../../../src/ui/fonts/lilita-one.woff2') format('woff2'); }
html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; }
.wrap { position: absolute; left: 0; right: 0; bottom: ${end ? 64 : 76}px; display: flex; justify-content: center; }
.cap { position: relative; font: 400 ${end ? 112 : 104}px/1.1 'Lilita One'; letter-spacing: 1px; white-space: nowrap; }
.cap span { display: block; }
.stroke { position: absolute; inset: 0; color: ${TEAL}; -webkit-text-stroke: 18px ${TEAL}; filter: drop-shadow(0 10px 0 ${TEAL}); }
.fill { position: relative; color: #fff; }
y { color: #ffd24a; }
.stroke y { color: ${TEAL}; }
${end ? `.pill { padding: 14px 70px 24px; border: 8px solid ${TEAL}; border-radius: 999px; background: linear-gradient(#3fd6db, #1fb3ba); box-shadow: 0 12px 0 ${TEAL}, 0 18px 40px rgba(0,0,0,.25); }` : ''}
</style></head><body><div class="wrap">${end ? '<div class="pill">' : ''}<div class="cap"><span class="stroke">${text}</span><span class="fill">${text}</span></div>${end ? '</div>' : ''}</div></body></html>`;
(async () => {
  fs.mkdirSync('frames', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [name, text] of caps) {
    fs.writeFileSync(`frames/${name}.html`, html(text, name === 'kend'));
    await page.goto(`file://${process.cwd()}/frames/${name}.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `frames/${name}.png`, omitBackground: true });
  }
  await browser.close();
  console.log('captions done');
})();
