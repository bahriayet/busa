/* Konfigurasi alamat backend BUSA.
   - Lokal (localhost / satu domain): kosong = relatif, backend menyajikan frontend.
   - Online (mis. Vercel/Cloudflare Pages): otomatis menunjuk ke backend Render. */
(function () {
  var host = location.hostname;
  var isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1'
    || host.indexOf('192.168.') === 0 || host.indexOf('10.') === 0 || host.indexOf('172.') === 0;
  window.BUSA_API_BASE = isLocal ? '' : 'https://busa-api.onrender.com';
  window.SCAN_API = window.BUSA_API_BASE;
})();
