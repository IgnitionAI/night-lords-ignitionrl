// Vite ne remplace que le bundle **navigateur**. Les bundles Node (train, eval, bc, server) restent dans
// build.mjs : ils sont en ESM pour Node, avec `@tensorflow/tfjs-node` en externe, et Vite n'a rien à y faire.
//
// Deux contraintes que la migration ne doit pas casser :
// 1. **mêmes URL** — `main.js` sans hash, sinon les captures `?shot=N` et `src/server.ts` changent de chemins ;
// 2. **la page servie reste une seule requête** — Vite émet l'HTML à `web/dist/web/index.html` (il conserve le
//    chemin relatif à la racine du dépôt) ; le plugin le remonte à `web/dist/index.html`, seule adresse que
//    sert le serveur.
import { resolve } from 'node:path';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import react from '@vitejs/plugin-react';

const ROOT = import.meta.dirname;

/** Remonte les HTML émis de `web/dist/web/*.html` vers `web/dist/*.html`. */
const flattenHtml = () => ({
  name: 'nl-flatten-html',
  closeBundle() {
    for (const name of ['index.html', 'sas.html']) {
      const from = resolve(ROOT, `web/dist/web/${name}`), to = resolve(ROOT, `web/dist/${name}`);
      if (existsSync(from)) renameSync(from, to);
    }
    rmSync(resolve(ROOT, 'web/dist/web'), { recursive: true, force: true });
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

/** RL3 (BC/DAgger) : mêmes routes que `src/server.ts`, via Bun pour lire le TypeScript source. */
const rl3Api = () => ({
  name: 'nl-rl3-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url?.split('?')[0] ?? '';
      if (!url.startsWith('/api/rl3/')) return next();
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const r = spawnSync('bun', ['src/rl3-cli.ts', 'handle', req.method ?? 'GET', url, ROOT], {
          cwd: ROOT, input: body, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
        });
        if (r.error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(r.error) }));
          return;
        }
        try {
          const parsed = JSON.parse(r.stdout || '{"status":500,"json":{"error":"rl3 vide"}}');
          res.statusCode = parsed.status ?? 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(parsed.json));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(e), stderr: (r.stderr || '').slice(-800) }));
        }
      });
    });
  },
});

export default ({ command }) => ({
  root: ROOT,
  // en développement la page est servie à la racine et importe le TypeScript source ; en production elle vit
  // sous /web/dist/ avec `main.js`, exactement l'URL que servait esbuild.
  base: command === 'build' ? '/web/dist/' : '/',
  publicDir: false,
  plugins: [react(), flattenHtml(), policyAlias(), rl3Api()],
  build: {
    outDir: 'web/dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { index: resolve(ROOT, 'web/index.html'), sas: resolve(ROOT, 'web/sas.html') },
      output: {
        entryFileNames: chunk => chunk.name === 'index' ? 'main.js' : '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  server: { port: 18230, strictPort: true, host: '127.0.0.1' },
});
