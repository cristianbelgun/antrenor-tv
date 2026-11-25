(function (root) {
  var AT = root.AT = root.AT || {};
  // Cheia secretă se pune aici la instalare (scripts/build-zip.sh). Goală = istoric doar pe televizor.
  AT.config = AT.config || { secret: '' };
})(typeof window !== 'undefined' ? window : globalThis);
