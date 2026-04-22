/**
 * @file Onboarding page logic.
 *
 * Minimal: just wires the CTA buttons.
 */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnClose').addEventListener('click', () => {
    window.close();
  });
  document.getElementById('btnOpenSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
