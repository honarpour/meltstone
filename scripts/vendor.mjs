// Rebuilds vendor/codemirror.js and writes the license notices for every
// package that ends up in the bundle (MIT requires shipping them).
import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const result = await build({
  entryPoints: ['vendor/codemirror-entry.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: 'vendor/codemirror.js',
  metafile: true,
  banner: { js: '/*! Bundled CodeMirror 6 and dependencies (MIT). See vendor/THIRD_PARTY_LICENSES.txt */' },
});

const packages = [...new Set(Object.keys(result.metafile.inputs)
  .map(p => p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1])
  .filter(Boolean))].sort();

const sections = [];
for (const name of packages) {
  const dir = join('node_modules', name);
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  const licenseFile = (await readdir(dir)).find(f => /^licen[cs]e/i.test(f));
  const text = licenseFile ? (await readFile(join(dir, licenseFile), 'utf8')).trim() : `License: ${pkg.license}`;
  sections.push(`${name}@${pkg.version} (${pkg.license})\n${'-'.repeat(60)}\n${text}`);
}

await writeFile('vendor/THIRD_PARTY_LICENSES.txt',
  `vendor/codemirror.js bundles the following packages.\n\n${sections.join('\n\n\n')}\n`);
console.log(`Bundled ${packages.length} packages into vendor/codemirror.js`);
