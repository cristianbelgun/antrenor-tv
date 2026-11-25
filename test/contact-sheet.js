// Renders every exercise figure at p = 0, 0.5, 1 into test-results/figures.png for a visual check.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const js = ['program.js', 'figures.js'].map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#111513;color:#93a097;font:14px sans-serif">
    <div id="g" style="display:grid;grid-template-columns:160px repeat(3,190px);gap:6px;padding:10px"></div>
    <script>${js}</script>
    <script>
      const g = document.getElementById('g'), ids = Array.from(new Set(AT.program.WORKOUTS.A.concat(AT.program.WORKOUTS.B)));
      ids.forEach(id => {
        const l = document.createElement('div'); l.textContent = id; l.style.alignSelf = 'center'; g.appendChild(l);
        [0, 0.5, 1].forEach(p => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', 190); svg.setAttribute('height', 190); svg.style.background = '#1b211e';
          g.appendChild(svg); AT.figures.draw(svg, id, p);
        });
      });
    </script></body></html>`);
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results', 'figures.png'), fullPage: true });
  await browser.close();
  console.log('wrote test-results/figures.png');
})();
