/**
 * @file URL pattern matcher.
 *
 * Pure functions that test whether a URL matches a rule.
 * No side effects, no chrome.* calls — fully unit-testable.
 */

/**
 * Determine if a URL is ineligible for typing.
 * Browser-internal pages should never be auto-typed.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isInternalUrl(url) {
  if (!url || typeof url !== 'string') return true;
  return /^(chrome|chrome-extension|edge|about|moz-extension|brave|opera|vivaldi|view-source|devtools):/i.test(url);
}

/**
 * Parse a URL safely.
 *
 * @param {string} url
 * @returns {URL | null}
 */
export function safeParseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Test whether a URL matches a rule.
 *
 * @param {string} url
 * @param {{pattern: string, match: string}} rule
 * @returns {boolean}
 */
export function matchesRule(url, rule) {
  if (!rule || typeof rule.pattern !== 'string') return false;
  const u = safeParseUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  const pattern = rule.pattern.toLowerCase();

  switch (rule.match) {
    case 'host':
      return host === pattern;
    case 'host-ends':
      return host === pattern || host.endsWith('.' + pattern);
    case 'host-starts':
      return host.startsWith(pattern);
    case 'url-starts': {
      const fullPath = host + u.pathname;
      return fullPath.startsWith(pattern);
    }
    case 'url-contains': {
      const full = host + u.pathname + u.search;
      return full.includes(pattern);
    }
    default:
      return host === pattern;
  }
}

/**
 * Find the first matching rule for a URL.
 *
 * @param {string} url
 * @param {Array<{pattern: string, match: string, type: string, reason: ?string}>} rules
 * @returns {Object | null} The matched rule, or null.
 */
export function findMatchingRule(url, rules) {
  if (isInternalUrl(url)) return null;
  if (!Array.isArray(rules)) return null;
  for (const rule of rules) {
    if (matchesRule(url, rule)) return rule;
  }
  return null;
}
