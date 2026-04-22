/**
 * @file Structured logger.
 *
 * Lightweight leveled logger that prefixes all output with [Tare].
 * In production, can be configured to send errors to telemetry
 * (currently disabled; no external calls).
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = LEVELS.info;

/**
 * Set minimum log level.
 * @param {'debug'|'info'|'warn'|'error'} level
 */
export function setLogLevel(level) {
  if (level in LEVELS) currentLevel = LEVELS[level];
}

function fmt(args) {
  return args.map(a => {
    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

function emit(level, ...args) {
  if (LEVELS[level] < currentLevel) return;
  const prefix = `[Tare:${level}]`;
  const msg = fmt(args);
  /* eslint-disable no-console */
  if (level === 'error') console.error(prefix, msg);
  else if (level === 'warn') console.warn(prefix, msg);
  else if (level === 'debug') console.debug(prefix, msg);
  else console.info(prefix, msg);
  /* eslint-enable no-console */
}

export const log = Object.freeze({
  debug: (...args) => emit('debug', ...args),
  info: (...args) => emit('info', ...args),
  warn: (...args) => emit('warn', ...args),
  error: (...args) => emit('error', ...args),
});
