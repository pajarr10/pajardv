/**
 * Admin panel logic for PAJARDV API
 */
let token = localStorage.getItem('admin_token') || '';

const CATEGORIES = ['AI CHAT', 'AI IMAGE', 'INFO', 'DOWNLOADER', 'TOOLS', 'SEARCH', 'STALKER', 'RANDOM', 'UPLOADER'];

(async function init() {
  themeInit();
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('upload-form').addEventListener('submit', handleUpload);
  document.getElementById('file-input').addEventListener('change', updateFileName);
  document.getElementById('file-drop').addEventListener('click', () => document.getElementById('file-input').click());

  if (token) {
    try {
      await fetchAnalytics(token);
      showAdmin();
    } catch (e) {
      token = '';
      localStorage.removeItem('admin_token');
    }
  }
})();

async function handleLogin(e) {
  e.preventDefault();
  const key = document.getElementById('admin-key').value;
  try {
    const res = await PAJARDV.post('/api/admin/login', { key });
    token = res.token;
    localStorage.setItem('admin_token', token);
    showAdmin();
  } catch (err) {
    showToast(err.message || 'Login gagal');
  }
}

async function handleLogout() {
  try {
    await PAJARDV.post('/api/admin/logout', {}, token);
  } catch (e) { /* ignore */ }
  token = '';
  localStorage.removeItem('admin_token');
  location.reload();
}

function showAdmin() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  loadAdminData();
}

async function loadAdminData() {
  try {
    const stats = await fetchStats();
    const analytics = await fetchAnalytics(token);
    const { endpoints } = await fetchWithToken('/api/admin/endpoints');

    document.getElementById('stat-total').textContent = stats.totalEndpoints;
    document.getElementById('stat-modules').textContent = stats.totalModules;
    document.getElementById('stat-requests').textContent = analytics.totalRequests;
    document.getElementById('stat-copies').textContent = analytics.copies;
    document.getElementById('stat-visits').textContent = analytics.visits;

    renderEndpointList(endpoints);
  } catch (err) {
    console.error(err);
    showToast('Gagal memuat data admin: ' + err.message);
  }
}

function renderEndpointList(endpoints) {
  const tbody = document.getElementById('endpoint-list');
  tbody.innerHTML = '';

  if (!endpoints.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada endpoint</td></tr>';
    return;
  }

  endpoints.forEach((ep) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(ep.name)}</strong><br><small>${escapeHtml(ep.id)}</small></td>
      <td>${escapeHtml(ep.category.toUpperCase())}</td>
      <td><code>${escapeHtml(ep.path)}</code></td>
      <td>${ep.requestCount || 0} / ${ep.copyCount || 0}</td>
      <td>
        <button class="btn btn-danger btn-sm delete-btn" data-id="${ep.id}">Hapus</button>
      </td>
    `;
    tr.querySelector('.delete-btn').addEventListener('click', () => deleteEndpoint(ep.id));
    tbody.appendChild(tr);
  });
}

async function deleteEndpoint(id) {
  if (!confirm('Yakin ingin menghapus endpoint ini?')) return;
  try {
    await PAJARDV.post('/api/admin/delete', { id }, token);
    showToast('Endpoint dihapus');
    loadAdminData();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus');
  }
}

function updateFileName() {
  const file = document.getElementById('file-input').files[0];
  const label = document.getElementById('file-name');
  label.textContent = file ? file.name : 'Pilih atau drag file .js di sini';
}

async function handleUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('file-input');
  const file = fileInput.files[0];
  if (!file) return showToast('Pilih file .js terlebih dahulu');
  if (!file.name.toLowerCase().endsWith('.js')) return showToast('Hanya file .js yang diperbolehkan');

  const form = document.getElementById('upload-form');
  const formData = new FormData(form);

  try {
    const r = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Upload gagal');
    showToast('Endpoint berhasil diupload: ' + (data.endpoint?.path || ''));
    form.reset();
    document.getElementById('file-name').textContent = 'Pilih atau drag file .js di sini';
    loadAdminData();
  } catch (err) {
    showToast(err.message || 'Upload gagal');
  }
}

async function fetchWithToken(url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

function populateCategories() {
  const select = document.getElementById('category-select');
  CATEGORIES.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.toLowerCase();
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

populateCategories();
