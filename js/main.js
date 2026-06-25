/**
 * Dashboard logic for PAJARDV API
 */
const folderIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z"/></svg>';
const plusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
const refreshIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>';

const CATEGORY_ORDER = ['AI CHAT', 'AI IMAGE', 'INFO', 'DOWNLOADER', 'TOOLS', 'SEARCH', 'STALKER', 'RANDOM', 'UPLOADER'];

(async function init() {
  themeInit();

  const refreshBtn = document.getElementById('refresh-btn');
  const searchInput = document.getElementById('search-input');
  const themeBtn = document.getElementById('theme-toggle');

  if (refreshBtn) {
    refreshBtn.innerHTML = `${refreshIcon} SYNCED`;
    refreshBtn.addEventListener('click', renderDashboard);
  }
  if (searchInput) {
    searchInput.addEventListener('input', filterCategories);
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  recordVisit();
  await renderDashboard();
})();

async function renderDashboard() {
  try {
    const stats = await fetchStats();
    document.getElementById('stat-endpoints').textContent = stats.totalEndpoints;
    document.getElementById('stat-modules').textContent = stats.totalModules;
    document.getElementById('stat-status').textContent = stats.status.toUpperCase();
    document.getElementById('user-ip').textContent = stats.ip;

    const { endpoints } = await fetchEndpoints();
    window.__allEndpoints = endpoints;
    renderCategories(endpoints);
  } catch (err) {
    console.error(err);
    showToast('Gagal memuat dashboard: ' + err.message);
  }
}

function renderCategories(endpoints) {
  const list = document.getElementById('category-list');
  if (!list) return;

  list.innerHTML = '';

  const counts = {};
  CATEGORY_ORDER.forEach((cat) => { counts[cat] = 0; });
  endpoints.forEach((ep) => {
    const key = ep.category.toUpperCase();
    if (counts[key] === undefined) counts[key] = 0;
    counts[key]++;
  });

  const categories = Object.keys(counts).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  categories.forEach((cat) => {
    const item = document.createElement('a');
    item.className = 'category-item';
    item.href = `/docs?category=${encodeURIComponent(cat)}`;
    item.innerHTML = `
      <div class="cat-left">
        ${folderIcon}
        <span class="cat-name">${escapeHtml(cat.toUpperCase())}</span>
        <span class="cat-count">${counts[cat]}</span>
      </div>
      <div class="cat-plus">${plusIcon}</div>
    `;
    list.appendChild(item);
  });
}

function filterCategories() {
  const q = (this.value || '').toLowerCase().trim();
  const all = window.__allEndpoints || [];
  if (!q) return renderCategories(all);

  const filtered = all.filter((ep) =>
    (ep.name || '').toLowerCase().includes(q) ||
    (ep.id || '').toLowerCase().includes(q) ||
    (ep.description || '').toLowerCase().includes(q) ||
    (ep.path || '').toLowerCase().includes(q) ||
    (ep.category || '').toLowerCase().includes(q)
  );
  renderCategories(filtered);
}
