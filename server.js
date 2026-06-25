/**
 * PAJARDV API Server
 *
 * Stack: Node.js + Express + Redis (opsional) + Multer
 * Fitur:
 *  - Dashboard statis (/, /docs, /admin)
 *  - API metadata & analytics
 *  - Admin upload file JS scraper yang otomatis jadi endpoint
 *  - Real request / response, tanpa dummy data
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'pajardv-admin-secret';
const SCRAPER_DIR = path.join(__dirname, 'uploads', 'scraper');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Static files (hanya direktori publik) ---
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'index.html')));
app.get('/docs/', (req, res) => res.sendFile(path.join(__dirname, 'docs', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.get('/admin/', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));

// --- Redis (fallback in-memory) ---
let redisClient = null;
let redisReady = false;
(async () => {
  if (process.env.REDIS_URL === 'none') return;
  try {
    redisClient = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    redisClient.on('error', () => { redisReady = false; });
    await redisClient.connect();
    redisReady = true;
    console.log('Redis connected');
  } catch (e) {
    console.log('Redis not available, using in-memory store.');
    redisReady = false;
  }
})();

async function redisIncr(key) {
  if (redisReady) {
    try { await redisClient.incr(key); } catch (e) { /* ignore */ }
  }
}

async function redisSet(key, value) {
  if (redisReady) {
    try { await redisClient.set(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
}

// --- In-memory store ---
const store = {
  endpoints: new Map(),          // id -> endpoint (termasuk handler)
  sessions: new Map(),           // token -> { createdAt }
  analytics: {
    totalRequests: 0,
    copies: 0,
    uniqueIps: new Set(),
    visits: 0
  }
};

// --- Helpers ---
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}

function safeFilename(name) {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
}

function serializeEndpoint(ep) {
  const { handler, filePath, ...rest } = ep;
  return rest;
}

function getEndpoints() {
  return Array.from(store.endpoints.values()).map(serializeEndpoint);
}

function getCategories() {
  const map = {};
  store.endpoints.forEach((ep) => {
    map[ep.category] = (map[ep.category] || 0) + 1;
  });
  return map;
}

function registerEndpoint(id, category, endpoint) {
  store.endpoints.set(id, { ...endpoint, id, category });
}

function loadScraperFile(filePath, rel) {
  try {
    delete require.cache[require.resolve(filePath)];
    let mod = require(filePath);

    // Normalisasi export: fungsi langsung dianggap handler
    if (typeof mod === 'function') {
      mod = { handler: mod };
    }
    if (mod && mod.default && typeof mod.default === 'object') {
      mod = mod.default;
    }
    if (mod && mod.default && typeof mod.default === 'function') {
      mod = { handler: mod.default };
    }

    const parts = rel.replace(/\\/g, '/').replace(/\.js$/i, '').split('/');
    const category = safeFilename(parts[0] || 'general');
    const slug = parts.slice(1).join('-') || parts[0];
    const id = parts.join('-');
    const meta = mod.meta || {};
    const method = (meta.method || mod.method || 'GET').toUpperCase();
    const endpointPath = meta.path
      ? meta.path
      : `/api/${parts.join('/')}`;

    const endpoint = {
      id,
      category: meta.category || category,
      name: meta.name || slug,
      description: meta.description || `Endpoint otomatis dari ${rel}`,
      creator: meta.creator || 'admin',
      method,
      path: endpointPath,
      filePath,
      parameters: meta.parameters || [],
      exampleRequest: meta.exampleRequest || endpointPath,
      exampleResponse: meta.exampleResponse || { ok: true },
      copyCount: 0,
      requestCount: 0,
      handler: mod.handler || mod
    };

    registerEndpoint(id, endpoint.category, endpoint);
    console.log('Loaded scraper', endpoint.path);
  } catch (err) {
    console.error('Failed to load scraper', filePath, err.message);
  }
}

function loadScrapers() {
  store.endpoints.clear();

  // Built-in endpoint: /api/test (selalu aktif untuk cek status)
  registerEndpoint('test', 'tools', {
    name: 'Test',
    description: 'Endpoint test untuk memastikan API aktif dan meneruskan query/body.',
    creator: 'system',
    method: 'GET',
    path: '/api/test',
    filePath: null,
    parameters: [{ name: 'msg', type: 'string', required: false, description: 'Pesan opsional' }],
    exampleRequest: '/api/test?msg=hello',
    exampleResponse: { ok: true, message: 'PAJARDV API aktif', query: { msg: 'hello' } },
    copyCount: 0,
    requestCount: 0,
    handler: (req, res) => {
      res.json({
        ok: true,
        message: 'PAJARDV API aktif',
        query: req.query,
        body: req.body,
        ip: getIp(req),
        time: new Date().toISOString()
      });
    }
  });

  // Load semua file JS di uploads/scraper/
  if (!fs.existsSync(SCRAPER_DIR)) fs.mkdirSync(SCRAPER_DIR, { recursive: true });
  (function walk(dir, base) {
    fs.readdirSync(dir).forEach((file) => {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, path.join(base, file));
      } else if (file.toLowerCase().endsWith('.js')) {
        const rel = path.relative(SCRAPER_DIR, full).replace(/\\/g, '/');
        loadScraperFile(full, rel);
      }
    });
  })(SCRAPER_DIR, '');
}

// --- Admin middleware ---
function authAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token || !store.sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- API Routes ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', time: new Date().toISOString() });
});

app.get('/api/ip', (req, res) => {
  res.json({ ip: getIp(req) });
});

app.get('/api/stats', asyncHandler(async (req, res) => {
  await redisIncr('pajardv:stats:read');
  res.json({
    ip: getIp(req),
    totalEndpoints: store.endpoints.size,
    totalModules: Object.keys(getCategories()).length,
    status: 'online',
    categories: getCategories(),
    totalRequests: store.analytics.totalRequests,
    uniqueIps: store.analytics.uniqueIps.size,
    copies: store.analytics.copies,
    visits: store.analytics.visits
  });
}));

app.get('/api/endpoints', asyncHandler(async (req, res) => {
  await redisIncr('pajardv:endpoints:read');
  res.json({ endpoints: getEndpoints() });
}));

app.get('/api/analytics', authAdmin, asyncHandler(async (req, res) => {
  res.json({
    totalRequests: store.analytics.totalRequests,
    copies: store.analytics.copies,
    visits: store.analytics.visits,
    uniqueIps: Array.from(store.analytics.uniqueIps),
    endpoints: getEndpoints().map((e) => ({
      id: e.id,
      path: e.path,
      requestCount: e.requestCount,
      copyCount: e.copyCount
    }))
  });
}));

app.post('/api/visit', (req, res) => {
  const ip = getIp(req);
  store.analytics.uniqueIps.add(ip);
  store.analytics.visits++;
  redisIncr('pajardv:visits');
  res.json({ ok: true });
});

app.post('/api/feedback', (req, res) => {
  const { name, message } = req.body || {};
  if (!name || !message) {
    return res.status(400).json({ error: 'Nama dan pesan wajib diisi' });
  }
  if (!store.feedbacks) store.feedbacks = [];
  store.feedbacks.push({
    name: String(name).slice(0, 100),
    message: String(message).slice(0, 2000),
    ip: getIp(req),
    time: new Date().toISOString()
  });
  res.json({ ok: true });
});

app.post('/api/copy', (req, res) => {
  const { id } = req.body || {};
  store.analytics.copies++;
  redisIncr('pajardv:copies');
  if (id && store.endpoints.has(id)) {
    const ep = store.endpoints.get(id);
    ep.copyCount = (ep.copyCount || 0) + 1;
  }
  res.json({ ok: true });
});

// --- Admin auth ---
app.post('/api/admin/login', asyncHandler(async (req, res) => {
  const { key } = req.body || {};
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  const token = crypto.randomUUID();
  store.sessions.set(token, { createdAt: Date.now() });
  await redisSet(`pajardv:session:${token}`, { createdAt: Date.now() });
  res.json({ token });
}));

app.post('/api/admin/logout', authAdmin, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  store.sessions.delete(token);
  res.json({ ok: true });
});

// --- Upload scraper ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.js')) {
      return cb(new Error('Hanya file .js yang diperbolehkan'));
    }
    cb(null, true);
  }
});

app.post('/api/admin/upload', authAdmin, upload.single('scraper'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File tidak ditemukan' });
  }

  const category = safeFilename(req.body.category || 'general');
  const name = safeFilename(req.body.name || req.file.originalname.replace(/\.js$/i, ''));
  if (!name) {
    return res.status(400).json({ error: 'Nama endpoint tidak valid' });
  }

  const dest = path.join(SCRAPER_DIR, category);
  fs.mkdirSync(dest, { recursive: true });
  const filePath = path.join(dest, `${name}.js`);

  // Validasi sederhana: cegah path traversal dan pastikan masih dalam SCRAPER_DIR
  if (!filePath.startsWith(SCRAPER_DIR + path.sep)) {
    return res.status(400).json({ error: 'Path tidak valid' });
  }

  fs.writeFileSync(filePath, req.file.buffer);
  const rel = path.relative(SCRAPER_DIR, filePath).replace(/\\/g, '/');
  loadScraperFile(filePath, rel);

  const ep = store.endpoints.get(`${category}-${name}`) ||
             Array.from(store.endpoints.values()).find((e) => e.filePath === filePath);

  res.json({ ok: true, endpoint: ep ? serializeEndpoint(ep) : null });
}));

app.get('/api/admin/endpoints', authAdmin, asyncHandler(async (req, res) => {
  res.json({ endpoints: getEndpoints() });
}));

app.post('/api/admin/delete', authAdmin, asyncHandler(async (req, res) => {
  const { id } = req.body || {};
  const ep = store.endpoints.get(id);
  if (!ep || !ep.filePath) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
  }
  try {
    fs.unlinkSync(ep.filePath);
    delete require.cache[require.resolve(ep.filePath)];
  } catch (e) {
    // file mungkin sudah hilang
  }
  store.endpoints.delete(id);
  res.json({ ok: true });
}));

// --- Dynamic scraper endpoints ---
app.all('/api/*', asyncHandler(async (req, res, next) => {
  const ep = Array.from(store.endpoints.values()).find((e) => e.path === req.path);
  if (!ep) return next();

  const ip = getIp(req);
  store.analytics.totalRequests++;
  store.analytics.uniqueIps.add(ip);
  await redisIncr('pajardv:requests');
  ep.requestCount = (ep.requestCount || 0) + 1;

  if (ep.method !== 'ALL' && req.method !== ep.method) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ep.handler || typeof ep.handler !== 'function') {
    return res.status(500).json({ error: 'Handler tidak ditemukan' });
  }

  try {
    const result = await ep.handler(req, res);
    if (!res.headersSent && result !== undefined) {
      res.json(result);
    }
  } catch (err) {
    console.error('Scraper error', ep.path, err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message,
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
      });
    }
  }
}));

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  loadScrapers();
  console.log(`PAJARDV API running at http://localhost:${PORT}`);
  console.log(`Admin key: ${ADMIN_KEY}`);
});
