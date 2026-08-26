// Minimal logger: silences console.log in production, keeps errors/warnings.
// Usage: import { log } from '../utils/logger.js' — or keep console.* calls;
// this patch is applied at startup by importing it from server.js.
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  const noop = () => {};
  // Preserve original error/warn; drop noisy info logs in production.
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

export const log = (...args) => { if (!isProd) console.log(...args); };
export const logError = (...args) => console.error(...args);
export const logWarn = (...args) => console.warn(...args);
