// Builds the new interface into ui/dist: type-check, one script with React inside, one stylesheet
// (variables compiled from tokens.json + the component styles) and index.html. server.py serves the folder at the site root.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
const project = path.join(here, 'design-system/project');
fs.mkdirSync(out, { recursive: true });

execSync('npx tsc -p tsconfig.json', { cwd: here, stdio: 'inherit' });

// tokens.json -> CSS variables; the first theme is the default, the others apply by data-theme on <html>
const tokens = JSON.parse(fs.readFileSync(path.join(project, 'tokens.json'), 'utf8'));
const themes = tokens.color.themes.map(t => t.id);
const block = (sel, pairs) => `${sel}{${pairs.map(([k, v]) => `--${k}:${v}`).join(';')}}`;
const colors = id => tokens.color.tokens.map(t => [t.name, typeof t.value === 'string' ? t.value : t.value[id] ?? t.value[themes[0]]]);
const plain = ['spacing', 'radius', 'shadow', 'layout', 'timing'].flatMap(f => (tokens[f]?.tokens || []).map(t => [t.name, t.value]));
const fonts = Object.entries(tokens.type.families).map(([k, v]) => ['font-' + k, v]);
const vars = [
  block(':root', [...colors(themes[0]), ...plain, ...fonts]) + `:root{color-scheme:${themes[0]}}`,
  ...themes.slice(1).map(id => block(`:root[data-theme="${id}"]`, colors(id)) + `:root[data-theme="${id}"]{color-scheme:${id}}`),
].join('\n');
fs.writeFileSync(path.join(out, 'app.css'), `/* generated from tokens.json and src/styles.css */\n${vars}\nhtml,body,#root{height:100%}\n` + fs.readFileSync(path.join(here, 'src/styles.css'), 'utf8'));

const res = await build({
  entryPoints: [path.join(here, 'app/main.tsx')], bundle: true, format: 'iife', minify: true, target: 'es2020', jsx: 'transform',
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(out, 'app.js'), metafile: true,
});
fs.copyFileSync(path.join(project, 'assets/Logos/token-explorer-app-icon.svg'), path.join(out, 'icon.svg'));
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Token Explorer</title>
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="root"></div>
<script src="app.js"></script>
</body>
</html>
`);
const size = Object.values(res.metafile.outputs)[0].bytes;
console.log(`built ui/dist: app.js ${(size / 1024).toFixed(0)} KB`);
