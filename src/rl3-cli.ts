// Pont Vite → bibliothèque TS (Bun lit le TypeScript).
// bun src/rl3-cli.ts handle METHOD PATH ROOT < body
import { createRl3State, rl3Handle } from './rl3-http';

const [cmd, method, path, root] = process.argv.slice(2);
if (cmd !== 'handle' || !method || !path || !root) {
  throw new Error('usage: bun src/rl3-cli.ts handle METHOD PATH ROOT');
}
const chunks: Buffer[] = [];
for await (const c of process.stdin) chunks.push(c as Buffer);
const body = Buffer.concat(chunks).toString('utf8');
const res = await rl3Handle(method, path, body, createRl3State(root));
process.stdout.write(JSON.stringify(res));
process.exit(res.status >= 400 ? 0 : 0);
