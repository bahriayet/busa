/* Konfigurasi alamat backend BUSA.
   - Kosong ('') = satu domain: backend menyajikan frontend (mode lokal).
   - Isi dengan alamat backend bila frontend di-host terpisah, mis. Cloudflare Pages:
     window.BUSA_API_BASE = 'https://busa-api.onrender.com'; */
window.BUSA_API_BASE = '';
window.SCAN_API = window.BUSA_API_BASE;
