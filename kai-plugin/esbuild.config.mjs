import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'fs';

const watch = process.argv.includes('--watch');

const mainConfig = {
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: 'dist/main.mjs',
  external: ['node:crypto', 'node:fs', 'node:path', 'node:os', 'zod', 'zod-to-json-schema'],
  sourcemap: 'inline',
  banner: { js: '// kai-plugin-legion main — bundled with esbuild' },
  logLevel: 'info',
};

const rendererConfig = {
  entryPoints: ['src/renderer/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120', 'safari17'],
  outfile: 'dist/renderer.mjs',
  sourcemap: 'inline',
  banner: { js: '// kai-plugin-legion renderer — bundled with esbuild' },
  logLevel: 'info',
};

if (watch) {
  const [mainCtx, rendererCtx] = await Promise.all([
    context(mainConfig),
    context(rendererConfig),
  ]);
  await Promise.all([mainCtx.watch(), rendererCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([build(mainConfig), build(rendererConfig)]);

  // Copy plugin.json into dist/ so the install directory is self-contained
  cpSync('plugin.json', 'dist/plugin.json');
  console.log('Copied plugin.json → dist/');
}
