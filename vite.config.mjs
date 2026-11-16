// Vite ne remplace que le bundle **navigateur**. Les bundles Node (train, eval, bc, server) restent dans
// build.mjs : ils sont en ESM pour Node, avec `@tensorflow/tfjs-node` en externe, et Vite n'a rien à y faire.
//
// Deux contraintes que la migration ne doit pas casser :
// 1. **mêmes URL** — `main.js` sans hash, sinon les captures `?shot=N` et `src/server.ts` changent de chemins ;
// 2. **la page servie reste une seule requête** — Vite émet l'HTML à `web/dist/web/index.html` (il conserve le
//    chemin relatif à la racine du dépôt) ; le plugin le remonte à `web/dist/index.html`, seule adresse que
//    sert le serveur.
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';

const ROOT = import.meta.dirname;

/** Remonte les HTML émis de `web/dist/web/*.html` vers `web/dist/*.html`. */
const flattenHtml = () => ({
  name: 'nl-flatten-html',
  closeBundle() {
    for (const name of ['index.html', 'sas.html', 'strategy.html', 'fps.html']) {
      const from = resolve(ROOT, `web/dist/web/${name}`), to = resolve(ROOT, `web/dist/${name}`);
      if (existsSync(from)) {
        const html = readFileSync(from, 'utf8').replaceAll('../', './');
        writeFileSync(to, html);
      }
    }
    // Preserve the now-empty HTML directory; no destructive cleanup is needed.
    mkdirSync(resolve(ROOT, 'web/dist/assets'), { recursive: true });
    cpSync(resolve(ROOT, 'web/models'), resolve(ROOT, 'web/dist/assets/models'), { recursive: true });
    cpSync(resolve(ROOT, 'web/sfx/nightlords'), resolve(ROOT, 'web/dist/assets/sfx/nightlords'), { recursive: true });
    for (const row of JSON.parse(readFileSync(resolve(ROOT, 'docs/immersion/generations.json'), 'utf8'))) {
      for (const file of row.delivery?.files ?? []) { const target=resolve(ROOT, 'web/dist', file.replace(/^public\//,'')); mkdirSync(resolve(target,'..'),{recursive:true});cpSync(resolve(ROOT,file),target); }
    }
    cpSync(resolve(ROOT, 'policies'), resolve(ROOT, 'web/dist/policy'), { recursive: true });
  },
});

/** Le serveur de dev ne connaît pas la règle de `src/server.ts` : `/policy/x.json` y désigne `policies/x.json`.
 *  Sans ce relais, la page de dev joue sans politique chargée — et l'image change. */
const policyAlias = () => ({
  name: 'nl-policy-alias',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && req.url.startsWith('/policy/')) req.url = '/policies/' + req.url.slice(8);
      next();
    });
  },
});

export default ({ command }) => ({
  root: ROOT,
  // en développement la page est servie à la racine et importe le TypeScript source ; en production elle vit
  // sous /web/dist/ avec `main.js`, exactement l'URL que servait esbuild.
  base: command === 'build' ? './' : '/',
  publicDir: false,
  plugins: [react(), {
    name: 'nl-static-asset-paths', apply: 'build',
    transform(code, id) {
      if (!id.startsWith(resolve(ROOT, 'web') + '/') || !/\.(ts|tsx|js)$/.test(id)) return;
      return code.replaceAll('/web/models/', './assets/models/')
        .replaceAll('/public/assets/genex/', './assets/genex/').replaceAll('/web/sfx/', './assets/sfx/').replaceAll('/policy/', './policy/');
    },
  }, flattenHtml(), policyAlias()],
  build: {
    outDir: 'web/dist',
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { index: resolve(ROOT, 'web/index.html'), sas: resolve(ROOT, 'web/sas.html'), strategy: resolve(ROOT, 'web/strategy.html'), fps: resolve(ROOT, 'web/fps.html') },
      output: {
        entryFileNames: chunk => chunk.name === 'index' ? 'main.js' : '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  server: { port: 18230, strictPort: true, host: '127.0.0.1' },
});
