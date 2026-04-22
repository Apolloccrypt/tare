/**
 * @file Notification service.
 *
 * Thin wrapper around chrome.notifications that respects the
 * user's "show notifications" preference.
 */

import * as State from './state.js';
import { log } from './logger.js';

const ICON_URL = chrome.runtime.getURL('assets/icon128.png');

/**
 * Show a desktop notification.
 *
 * @param {string} id
 * @param {{title: string, message: string}} opts
 */
export async function notify(id, opts) {
  const settings = State.getSettings();
  if (!settings.showNotifications) return;
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: ICON_URL,
      title: opts.title,
      message: opts.message,
      priority: 0,
    });
  } catch (err) {
    log.debug('notification failed:', err?.message);
  }
}
