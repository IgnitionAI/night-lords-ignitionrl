import { build } from 'esbuild';
await build({ entryPoints: ['src/train.ts', 'src/eval.ts', 'src/server.ts', 'src/synth-player.ts', 'src/bc.ts', 'src/experiment-c.ts'], outdir: 'dist', outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', external: ['@tensorflow/tfjs-node'], banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url); { const u = require('util'); u.isNullOrUndefined ??= (v) => v === null || v === undefined; u.isArray ??= Array.isArray; }" }, logLevel: 'warning' });
await build({ entryPoints: ['web/main.ts'], outfile: 'web/dist/main.js', bundle: true, platform: 'browser', format: 'esm', logLevel: 'warning' });
console.log('build ok');
