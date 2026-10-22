(function (root) {
  const MAX_MESSAGE_LENGTH = 50000;
  // Browsers/editors render CRLF, paragraph breaks and NBSP differently.
  // Compare all of the text, never just a prefix (a truncated paste must fail).
  const normalizeMessage = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  const api = { MAX_MESSAGE_LENGTH, normalizeMessage };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.moriText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
