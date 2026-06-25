# PAJARDV API

Dashboard + dokumentasi + admin panel untuk mengelola API endpoint. Setiap file JavaScript scraper yang di-upload melalui admin akan otomatis teregister sebagai endpoint API.

## Struktur

```
/
├── index.html
├── docs/index.html
├── admin/index.html
├── css/
│   ├── style.css
│   ├── docs.css
│   └── admin.css
├── js/
│   ├── api.js
│   ├── main.js
│   ├── docs.js
│   └── admin.js
├── uploads/
│   └── scraper/
├── server.js
├── package.json
└── .env.example
```

## Jalankan

```bash
npm install
npm start
```

Server berjalan di `http://localhost:3000`.

## Admin

- Buka `/admin`.
- Default admin key: `pajardv-admin-secret` (ubah via `ADMIN_KEY` di `.env`).
- Upload file `.js` scraper, pilih kategori, dan beri nama endpoint.
- File akan tersimpan di `uploads/scraper/<kategori>/<nama>.js` dan langsung bisa diakses di `/api/<kategori>/<nama>`.

## Format Scraper

File harus berupa CommonJS yang mengekspor object dengan `meta` dan `handler`:

```js
module.exports = {
  meta: {
    name: 'Nama Endpoint',
    category: 'ai chat',
    description: 'Penjelasan singkat endpoint',
    method: 'GET',
    creator: 'pajar',
    parameters: [
      { name: 'q', type: 'string', required: true, description: 'Query pencarian' }
    ],
    exampleRequest: '/api/ai-chat/gpt?q=hello',
    exampleResponse: { ok: true, result: '...' }
  },
  handler: async (req, res) => {
    // req.query untuk GET, req.body untuk POST
    const result = await someScraper(req.query.q);
    res.json({ ok: true, result });
  }
};
```

Atau cukup ekspor sebuah fungsi:

```js
module.exports = async (req, res) => {
  res.json({ ok: true });
};
```

Semua library Node.js yang terinstall (axios, cheerio, dll.) dapat dipakai di dalam scraper.

## Fitur

- Neo Brutalism UI (responsive desktop/mobile)
- Dark / light mode
- Dashboard statistik real-time (total endpoint, module, status, IP user)
- Search endpoint real-time
- Dokumentasi lengkap dengan tester request asli
- Copy counter + analytics request
- Admin key berbasis Redis (fallback in-memory jika Redis tidak tersedia)
- Validasi input, error handling, loading state
- Tidak ada dummy data / endpoint palsu

## Catatan Keamanan

Fitur upload scraper menjalankan kode JavaScript yang diunggah. Pastikan hanya admin yang terpercaya yang memiliki `ADMIN_KEY`, dan gunakan Redis untuk session di production.
