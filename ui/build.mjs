// Builds the publishable design-system tree in design-system/project/components:
// type-checks, bundles src/ into one classic script, emits the typings, copies the
// sources and the stylesheet, and writes a preview page per component from demos/all.tsx.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'design-system/project/components');
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text.trim() + '\n'); };

// card name -> marker read by the design-system page; `<Name>Demo` must be exported from demos/all.tsx
const CARDS = {
  Mark: 'group="Основа" height=72',
  Button: 'group="Основа" height=120',
  Segmented: 'group="Основа" height=110',
  Field: 'group="Основа" height=300',
  Card: 'group="Основа" height=230',
  Popover: 'group="Основа" height=300',
  EmptyState: 'group="Основа" height=450',
  VerdictTag: 'group="Разбор" height=140',
  TokenChip: 'group="Разбор" height=170',
  CandidateRow: 'group="Разбор" height=440',
  StageChain: 'group="Разбор" height=250',
  MetricTile: 'group="Разбор" height=90',
  HeatTable: 'group="Разбор" height=250',
  TokenPanel: 'group="Каркас" height=760',
  RunCard: 'group="Каркас" height=800',
  ParamBar: 'group="Каркас" height=240',
  ModelPicker: 'group="Каркас" height=500',
  SettingsPanel: 'group="Каркас" height=400',
  AppShell: 'group="Каркас" width=1180 height=720',
  ScreenChoice: 'group="Экраны" page width=1180 height=720',
  ScreenSettings: 'group="Экраны" page width=1180 height=720',
  ScreenCompare: 'group="Экраны" page width=1180 height=720',
  ScreenAblation: 'group="Экраны" page width=1180 height=720',
  ScreenInside: 'group="Экраны" page width=1180 height=720',
};
// screens are showcase pages, not exports of the bundle
const EXPORTED = Object.keys(CARDS).filter(n => !n.startsWith('Screen'));
// the page inlines these files, so neither literal may appear in them
const forbidden = /<\/script|<!--/i;

// 1. types
execSync('npx tsc -p tsconfig.json', { cwd: here, stdio: 'inherit' });
execSync('npx tsc -p tsconfig.dts.json', { cwd: here, stdio: 'inherit' });
const dts = ['base', 'analysis', 'shell'].map(f => fs.readFileSync(path.join(here, 'out/dts', f + '.d.ts'), 'utf8')
  .split('\n').filter(l => !/^import /.test(l) && l.trim() !== 'export {};').join('\n')).join('\n');
write(path.join(out, 'index.d.ts'), "import * as React from 'react';\n" + dts);

// 2. sources and stylesheet travel with the system
for (const f of fs.readdirSync(path.join(here, 'src'))) {
  if (f !== 'styles.css') fs.cpSync(path.join(here, 'src', f), path.join(out, 'src', f));
}
fs.copyFileSync(path.join(here, 'src/styles.css'), path.join(out, 'bundle.css'));

// 3. bundle: one classic script that reads window.React and assigns window.TokenExplorer
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'TokenExplorer', components: EXPORTED.map(name => ({ name })) })} */`;
const res = await build({
  entryPoints: [path.join(here, 'src/index.ts')], bundle: true, format: 'iife', globalName: 'TokenExplorer', write: false,
  minify: true, target: 'es2019', jsx: 'transform', alias: { react: path.join(here, 'shim.cjs') },
  banner: { js: header }, footer: { js: 'window.TokenExplorer=TokenExplorer;' },
});
const bundle = res.outputFiles[0].text;
if (forbidden.test(bundle)) throw new Error('bundle holds a forbidden literal');
write(path.join(out, 'bundle.js'), bundle);

// 4. previews: markup prerendered here, then the live mount replaces it in the browser
const ctx = vm.createContext({ React, console, setTimeout, clearTimeout });
ctx.window = ctx;
vm.runInContext(bundle, ctx);
for (const [name, marker] of Object.entries(CARDS)) {
  if (!fs.existsSync(path.join(out, name, 'README.md'))) throw new Error(`${name}: no README.md in design-system/project/components/${name}`);
  const demo = await build({
    stdin: { contents: `export { ${name}Demo as default } from './all.tsx';`, resolveDir: path.join(here, 'demos'), loader: 'ts' },
    bundle: true, format: 'iife', globalName: '__demo', write: false, minify: true, target: 'es2019', jsx: 'transform',
  });
  const code = demo.outputFiles[0].text.trim();
  if (forbidden.test(code)) throw new Error(`${name}: demo holds a forbidden literal`);
  vm.runInContext(code, ctx);
  const html = renderToStaticMarkup(React.createElement(ctx.__demo.default));
  write(path.join(out, name, 'preview.html'), `<!-- @dsCard ${marker} -->
<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>${name}</title></head>
<body>
<div id="root">${html}</div>
<script>
${code}
if (window.React && window.ReactDOM && window.TokenExplorer) ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__demo.default));
</script>
</body>
</html>`);
}
console.log(`built ${Object.keys(CARDS).length} previews, bundle ${(bundle.length / 1024).toFixed(1)} KB`);
