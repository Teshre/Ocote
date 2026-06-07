#!/usr/bin/env node
// Genera latest.json para el updater de Tauri v1.
// Tauri v1 no genera este archivo automáticamente; sin él, el auto-update no funciona.
//
// Uso:
//   node scripts/generate-latest-json.mjs [path/to/bundle/macos] [release-url-base]
//
// Por defecto busca en src-tauri/target/release/bundle/macos y usa el repo GitHub del proyecto.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';

const repo = 'Teshre/Ocote';
const defaultBase = `https://github.com/${repo}/releases/latest/download`;

const bundleDir = resolve(process.argv[2] ?? 'src-tauri/target/release/bundle/macos');
const baseUrl = (process.argv[3] ?? defaultBase).replace(/\/+$/, '');

if (!existsSync(bundleDir)) {
  console.error(`No existe el bundle dir: ${bundleDir}`);
  console.error('Corré primero: pnpm build');
  process.exit(1);
}

const tauriConf = JSON.parse(
  readFileSync(resolve('src-tauri/tauri.conf.json'), 'utf8')
);
const version = tauriConf.package.version;

const sigFiles = readdirSync(bundleDir).filter((f) => f.endsWith('.sig'));
if (sigFiles.length === 0) {
  console.error(`No hay .sig en ${bundleDir}. El signing del updater falló.`);
  process.exit(1);
}

const target = process.platform === 'darwin' ? 'darwin'
  : process.platform === 'linux' ? 'linux'
  : process.platform === 'win32' ? 'windows'
  : (() => { throw new Error(`OS no soportado: ${process.platform}`); })();

const arch = process.arch === 'arm64' ? 'aarch64'
  : process.arch === 'x64' ? 'x86_64'
  : process.arch === 'ia32' ? 'i686'
  : (() => { throw new Error(`Arch no soportada: ${process.arch}`); })();

const platformKey = `${target}-${arch}`;

const platforms = {};
for (const sigFile of sigFiles) {
  const tarball = sigFile.replace(/\.sig$/, '');
  const tarballPath = join(bundleDir, tarball);
  if (!existsSync(tarballPath)) continue;

  const sigContent = readFileSync(join(bundleDir, sigFile), 'utf8').trim();
  platforms[platformKey] = {
    url: `${baseUrl}/${tarball}`,
    signature: sigContent,
  };
}

const manifest = {
  version,
  notes: process.env.RELEASE_NOTES ?? `Release ${version}`,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms,
};

const outPath = join(bundleDir, 'latest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`OK ${outPath}`);
console.log(`   version:   ${manifest.version}`);
console.log(`   pub_date:  ${manifest.pub_date}`);
console.log(`   platforms: ${Object.keys(platforms).join(', ')}`);
for (const [k, v] of Object.entries(platforms)) {
  console.log(`     ${k}: ${v.url}`);
}
