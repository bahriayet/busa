/* Konfigurasi alamat backend BUSA.
   - Sumber pertama: <meta name="busa-api-base"> di index.html — ganti backend
     cukup dengan mengubah satu baris itu, tanpa menyentuh JS.
   - Lokal (localhost / satu domain): kosong = relatif, backend menyajikan frontend.
   - Online (mis. Vercel/Cloudflare Pages): pakai meta; bila meta kosong, jatuh
     ke backend Render bawaan. */
(function () {
  var meta = document.querySelector('meta[name="busa-api-base"]');
  var configured = meta && meta.content ? meta.content.trim().replace(/\/+$/, '') : '';
  var host = location.hostname;
  var isLocal = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1'
    || host.indexOf('192.168.') === 0 || host.indexOf('10.') === 0 || host.indexOf('172.') === 0;
  window.BUSA_API_BASE = isLocal ? '' : (configured || 'https://busa-api.onrender.com');
  window.SCAN_API = window.BUSA_API_BASE;
})();
