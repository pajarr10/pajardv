/**
 * Documentation page logic for PAJARDV API
 */
const CATEGORY_ORDER = ['AI CHAT', 'AI IMAGE', 'INFO', 'DOWNLOADER', 'TOOLS', 'SEARCH', 'STALKER', 'RANDOM', 'UPLOADER'];

let allEndpoints = [];
let activeCategory = null;

(async function init() {
  themeInit();

  const params = new URLSearchParams(location.search);
  activeCategory = params.get('category');

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('search-docs').addEventListener('input', filterDocs);
  document.getElementById('refresh-docs').addEventListener('click', loadDocs);

  await loadDocs();
})();

async function loadDocs() {
  try {
    const { endpoints } = await fetchEndpoints();
    allEndpoints = endpoints;
    renderCategoryPills(endpoints);
    renderEndpoints(endpoints);
  } catch (err) {
    console.error(err);
    document.getElementById('docs-list').innerHTML =
      `<div class="empty-state">Gagal memuat docs: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCategoryPills(endpoints) {
  const counts = {};
  CATEGORY_ORDER.forEach((cat) => { counts[cat] = 0; });
  endpoints.forEach((ep) => {
    const key = ep.category.toUpperCase();
    if (counts[key] === undefined) counts[key] = 0;
    counts[key]++;
  });

  const pills = document.getElementById('category-pills');
  pills.innerHTML = '<button class="pill active" data-cat="">SEMUA</button>';

  const cats = Object.keys(counts).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  cats.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.dataset.cat = cat;
    btn.textContent = `${cat.toUpperCase()} (${counts[cat]})`;
    if (activeCategory && cat.toLowerCase() === activeCategory.toLowerCase()) {
      btn.classList.add('active');
      pills.querySelector('[data-cat=""]').classList.remove('active');
    }
    btn.addEventListener('click', () => setCategory(cat));
    pills.appendChild(btn);
  });

  pills.querySelector('[data-cat=""]').addEventListener('click', () => setCategory(''));
}

function setCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('#category-pills .pill').forEach((b) => b.classList.remove('active'));
  const active = document.querySelector(`#category-pills .pill[data-cat="${CSS.escape(cat)}"]`);
  if (active) active.classList.add('active');
  renderEndpoints(filterList());
}

function filterList() {
  const q = (document.getElementById('search-docs').value || '').toLowerCase().trim();

  return allEndpoints.filter((ep) => {
    const matchesCat = !activeCategory || ep.category.toLowerCase() === activeCategory.toLowerCase();
    if (!matchesCat) return false;
    if (!q) return true;
    return (
      (ep.name || '').toLowerCase().includes(q) ||
      (ep.id || '').toLowerCase().includes(q) ||
      (ep.description || '').toLowerCase().includes(q) ||
      (ep.path || '').toLowerCase().includes(q) ||
      (ep.category || '').toLowerCase().includes(q)
    );
  });
}

function filterDocs() {
  renderEndpoints(filterList());
}

function renderEndpoints(endpoints) {
  const list = document.getElementById('docs-list');
  list.innerHTML = '';

  if (!endpoints.length) {
    list.innerHTML = '<div class="empty-state">Tidak ada endpoint yang cocok.</div>';
    return;
  }

  endpoints.forEach((ep) => {
    list.appendChild(createEndpointCard(ep));
  });
}

function createEndpointCard(ep) {
  const card = document.createElement('div');
  card.className = 'endpoint-card';
  card.id = `ep-${ep.id}`;

  const paramsHtml = (ep.parameters || []).length
    ? `<table class="ep-params">
        <thead><tr><th>Nama</th><th>Tipe</th><th>Wajib</th><th>Deskripsi</th></tr></thead>
        <tbody>
          ${ep.parameters.map((p) => `
            <tr>
              <td><code>${escapeHtml(p.name)}</code></td>
              <td>${escapeHtml(p.type || 'string')}</td>
              <td>${p.required ? '<span class="required">Ya</span>' : 'Tidak'}</td>
              <td>${escapeHtml(p.description || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : '<p class="ep-desc">Tidak ada parameter.</p>';

  const testerFields = (ep.parameters || []).map((p) => `
    <div class="tester-field">
      <label for="param-${ep.id}-${escapeHtml(p.name)}">${escapeHtml(p.name)}</label>
      <input type="text" id="param-${ep.id}-${escapeHtml(p.name)}" class="param-input" data-name="${escapeHtml(p.name)}" placeholder="${escapeHtml(p.description || '')}" ${p.required ? 'required' : ''}>
    </div>
  `).join('');

  const fullUrl = `${location.origin}${ep.path}`;

  card.innerHTML = `
    <div class="ep-header">
      <span class="ep-method ${ep.method}">${escapeHtml(ep.method)}</span>
      <h3 class="ep-title">${escapeHtml(ep.name)}</h3>
      <span class="ep-meta">${escapeHtml(ep.creator)} · ${escapeHtml(ep.category.toUpperCase())}</span>
    </div>
    <p class="ep-desc">${escapeHtml(ep.description)}</p>
    ${paramsHtml}
    <div class="ep-block">
      <div class="ep-block-header">
        <span>Request URL</span>
        <button class="copy-btn" data-copy="${escapeHtml(ep.exampleRequest || ep.path)}">Copy</button>
      </div>
      <pre><code>${escapeHtml(ep.exampleRequest || ep.path)}</code></pre>
    </div>
    <div class="ep-block">
      <div class="ep-block-header">
        <span>Response Example</span>
      </div>
      <pre><code>${escapeHtml(formatJson(ep.exampleResponse))}</code></pre>
    </div>
    <div class="tester">
      <div class="tester-title">🧪 API TESTER</div>
      <div class="tester-grid">${testerFields}</div>
      <div class="tester-url" id="tester-url-${ep.id}">${escapeHtml(fullUrl)}</div>
      <div class="tester-actions">
        <button class="btn btn-primary btn-sm test-btn" data-id="${ep.id}" data-method="${ep.method}" data-path="${escapeHtml(ep.path)}">Send Request</button>
        <button class="btn btn-sm copy-btn" data-copy="${escapeHtml(fullUrl)}">Copy URL</button>
      </div>
      <pre class="response-box" id="response-${ep.id}">Klik Send Request untuk melihat response real.</pre>
    </div>
  `;

  card.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      copyText(btn.dataset.copy, ep.id);
    });
  });

  card.querySelectorAll('.param-input').forEach((input) => {
    input.addEventListener('input', () => updateTesterUrl(ep));
  });

  card.querySelector('.test-btn').addEventListener('click', () => runTest(ep));

  return card;
}

function updateTesterUrl(ep) {
  const base = `${location.origin}${ep.path}`;
  const sep = ep.path.includes('?') ? '&' : '?';
  const values = getParamValues(ep);
  const query = Object.entries(values)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = query ? `${base}${sep}${query}` : base;
  document.getElementById(`tester-url-${ep.id}`).textContent = url;
}

function getParamValues(ep) {
  const values = {};
  document.querySelectorAll(`#ep-${ep.id} .param-input`).forEach((input) => {
    values[input.dataset.name] = input.value;
  });
  return values;
}

async function runTest(ep) {
  const box = document.getElementById(`response-${ep.id}`);
  box.textContent = 'Loading...';

  const values = getParamValues(ep);
  const base = `${location.origin}${ep.path}`;
  const sep = ep.path.includes('?') ? '&' : '?';
  const query = Object.entries(values)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  try {
    let r;
    if (ep.method === 'GET' || ep.method === 'DELETE') {
      r = await fetch(query ? `${base}${sep}${query}` : base, { method: ep.method });
    } else {
      r = await fetch(base, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
    }
    const data = await r.json().catch(() => ({ error: 'Response bukan JSON' }));
    box.textContent = `Status: ${r.status}\n${formatJson(data)}`;
  } catch (err) {
    box.textContent = `Error: ${err.message}`;
  }
}
