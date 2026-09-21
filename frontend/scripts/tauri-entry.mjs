import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

// Tauri bundles frontendDist verbatim and loads its index.html at
// tauri.localhost/. The release build's index.html is a bootstrap stub that
// location.replace()s to the digest-addressed entry — fine for the PWA (the
// relay and _redirects already reroute '/' server-side) but a wasted second
// navigation inside the WebView on every cold start. This step replaces the
// stub with the real entry for the bundled shell only; lerdr-bootstrap.js and
// builds/ stay in place so the same dist still serves the PWA contract.

const root = resolve(process.argv[2] || 'dist');
const descriptor = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
const entryPath = descriptor?.files?.entry?.path;
if (typeof entryPath !== 'string' || !entryPath.startsWith('builds/') || !entryPath.endsWith('/index.html')) {
  throw new Error('release.json does not describe a build-specific entry');
}

const entry = await readFile(join(root, entryPath), 'utf8');
// The bundled document sits at '/', so every asset reference must be
// root-relative exactly like it is under /builds/<ver>/.
for (const required of ['src="/manifest-loader.js"', 'src="/assets/', 'href="/assets/']) {
  if (!entry.includes(required)) {
    throw new Error(`Build entry lacks the root-relative reference ${required}; refusing to flatten`);
  }
}

const indexPath = join(root, 'index.html');
const current = await readFile(indexPath, 'utf8').catch(() => '');
if (current === entry) {
  console.log(`Tauri entry already flattened in ${root}`);
} else {
  await writeFile(indexPath, entry);
}

// index.html.br is a compressedAssets member: the relay serves the sidecar
// verbatim, and validate-build.mjs requires it to decode back to the source.
await writeFile(`${indexPath}.br`, brotliCompressSync(entry, {
  params: {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_QUALITY]: 11,
    [constants.BROTLI_PARAM_SIZE_HINT]: entry.length,
  },
}));

console.log(`Flattened ${entryPath} into ${indexPath} for the bundled shell`);
