// tfjs-node 4.x uses a util helper removed in Node 24+.
const util = require('node:util');
if (!util.isNullOrUndefined) util.isNullOrUndefined = value => value === null || value === undefined;
