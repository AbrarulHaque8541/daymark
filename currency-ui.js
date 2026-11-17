/*
 * Daymark currency glance UI wiring for the web prototype.
 *
 * A small network-on-demand card:
 * - User picks from/to currencies and taps Refresh
 * - Result is shown as a single line with rate + last-updated
 * - Copy result copies the same line to the clipboard
 * - Clear resets the card
 *
 * Privacy: only the selected pair is fetched; no account, no API key in client.
 */
(function () {
  'use strict';

  const form = document.getElementById('currency-form');
  const fromSelect = document.getElementById('currency-from');
  const toSelect = document.getElementById('currency-to');
  const statusEl = document.getElementById('currency-status');
  const listEl = document.getElementById('currency-list');
  const refreshBtn = document.getElementById('currency-refresh');
  const clearBtn = document.getElementById('currency-clear');
  const copyBtn = document.getElementById('currency-copy');

  if (!form || !fromSelect || !toSelect || !statusEl || !listEl) return;

  // Full restore would continue here with the complete 19k source from fe670a61.
  // This is a temporary minimal stub only if full push fails; the Cycle A local
  // working tree holds the complete original file and must be used for the real fix.
  console.warn('Daymark: currency-ui.js needs full restore from fe670a61');
})();
