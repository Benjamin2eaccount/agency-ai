// ─── Token & role helpers ─────────────────────────────────────────────────────
function getToken()    { return localStorage.getItem('agencyToken') || ''; }
function getRole()     { return localStorage.getItem('agencyRole')  || 'admin'; }
function isAdmin()     { return getRole() === 'admin'; }

function authHeaders() {
  return {
    'Authorization': 'Bearer ' + getToken(),
    'Content-Type': 'application/json'
  };
}

function logout() {
  localStorage.clear();
  window.location.href = '/login';
}

// ─── Fetch wrappers ───────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });
  if (res.status === 401) { logout(); return null; }
  return res;
}

async function apiJSON(path, options = {}) {
  const res = await api(path, options);
  if (!res) return null;
  try { return await res.json(); } catch { return null; }
}
