import { build } from 'esbuild';
import { readFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';

// Static entry for Live. Vite still uses the TypeScript entry through its HTML transform.
const root = resolve(import.meta.dirname, '..');
async function copyTree(from, to, extensions) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) await copyTree(join(from, entry.name), join(to, entry.name), extensions);
    else if (extensions.includes(extname(entry.name))) await copyFile(join(from, entry.name), join(to, entry.name));
  }
}
await copyTree(join(root, 'web/models'), join(root, 'web/assets/models'), ['.glb']);
await copyTree(join(root, 'web/sfx/nightlords'), join(root, 'web/assets/sfx/nightlords'), ['.ogg', '.json']);
await copyTree(join(root, 'policies'), join(root, 'web/policy'), ['.json']);
await build({
  absWorkingDir: root, entryPoints: ['web/main.ts'], outfile: 'web/main.js',
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  plugins: [{ name: 'live-relative-assets', setup(builder) {
    builder.onLoad({ filter: /\.(ts|js)$/ }, async args => {
      if (!args.path.startsWith(join(root, 'web') + '/')) return;
      const contents = (await readFile(args.path, 'utf8'))
        .replaceAll('/web/models/', './assets/models/')
        .replaceAll('/web/sfx/', './assets/sfx/')
        .replaceAll('/policy/', './policy/');
      return { contents, loader: extname(args.path) === '.ts' ? 'ts' : 'js' };
    });
  } }],
});
console.log('Live static entry built with local models, sounds and policies.');
