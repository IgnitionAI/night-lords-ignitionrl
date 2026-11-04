// @tensorflow/tfjs-node 4.22 appelle `util.isNullOrUndefined` (et quelques voisins), retirés des Node récents.
// build.mjs pose déjà ce polyfill dans le préambule des bundles de `dist/` ; les tests, eux, passent par `tsx`
// et n'ont jamais vu ce préambule — d'où deux échecs de déterminisme sur Node 24 alors que le jeu tourne.
// Chargé par `node --require ./tools/util-shim.cjs` avant tout import de tfjs.
const util = require('util');
const define = (name, fn) => {
  if (typeof util[name] !== 'function') Object.defineProperty(util, name, { value: fn, writable: true, configurable: true, enumerable: false });
};
define('isNullOrUndefined', (v) => v === null || v === undefined);
define('isArray', Array.isArray);
define('isString', (v) => typeof v === 'string');
define('isNumber', (v) => typeof v === 'number');
define('isBoolean', (v) => typeof v === 'boolean');
define('isObject', (v) => v !== null && typeof v === 'object');
define('isUndefined', (v) => v === undefined);
define('isNull', (v) => v === null);
