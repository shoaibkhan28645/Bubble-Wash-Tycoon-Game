// Caption overlays for the trailer, in the game's title style, as transparent 1920x1080 PNGs.
const { chromium } = require('playwright');
const caps = [
  ['cap1', 'Wash cars,', 'make money!'],
  ['cap2', 'Build it up', 'and hire a crew'],
  ['cap3', 'Grow a farm'],
  ['cap4', 'Run a theme park'],
  ['cap5', 'Build an airport!'],
  ['capend', 'Play now!'],
];
const html = (lines, end) => `<!doctype html><html><head><style>
@font-face { font-family: 'Lilita One'; src: url('lilita-one.woff2') format('woff2'); }
html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; }
.wrap { position: absolute; left: 0; right: 0; ${end ? 'bottom: 70px' : 'bottom: 90px'}; display: flex; flex-direction: column; align-items: center; transform: rotate(-3deg); }
.line { font: 400 ${end ? 110 : 128}px/1.02 'Lilita One'; color: #fff; letter-spacing: 1px;
  text-shadow: -6px -6px 0 #0e5f73, 6px -6px 0 #0e5f73, -6px 6px 0 #0e5f73, 6px 6px 0 #0e5f73, 0 -7px 0 #0e5f73, 0 7px 0 #0e5f73, -7px 0 0 #0e5f73, 7px 0 0 #0e5f73, 0 15px 0 #0e5f73; }
.line + .line { color: #ffd24a; }
${end ? '.pill { padding: 18px 64px 26px; border: 7px solid #0e5f73; border-radius: 999px; background: #22c3c9; box-shadow: 0 12px 0 #0e5f73; } .pill .line { color: #fff; }' : ''}
</style></head><body><div class="wrap">${end ? `<div class="pill"><div class="line">${lines[0]}</div></div>` : lines.map((l) => `<div class="line">${l}</div>`).join('')}</div></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [name, ...lines] of caps) {
    require('fs').writeFileSync(`${name}.html`, html(lines, name === 'capend'));
    await page.goto(`file://${process.cwd()}/${name}.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${name}.png`, omitBackground: true });
  }
  await browser.close();
  console.log('captions done');
})();
