/* Terapkan preferensi tema sedini mungkin agar tidak ada kilatan warna
   yang salah saat halaman dimuat. Dipakai oleh index.html dan halaman legal.
   Aman terhadap CSP karena dimuat sebagai berkas same-origin. */
(function () {
  try {
    var raw = localStorage.getItem('busa.ops.v1');
    var data = raw ? JSON.parse(raw) : null;
    var theme = data && data.theme === 'night' ? 'night' : 'bone';
    if (document.body) document.body.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'night' ? '#2B323A' : '#FDF3E7');
  } catch (e) { /* preferensi tema tidak tersedia */ }
})();
