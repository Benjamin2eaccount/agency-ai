// ─── Token & role helpers ─────────────────────────────────────────────────────
function getToken() {
  // sessionStorage wins (impersonated tab)
  const sess = sessionStorage.getItem('agencyToken');
  if (sess) return sess;
  // Workspace-specific impersonation token (survives Ctrl+R)
  const ws = localStorage.getItem('currentWorkspace');
  if (ws) {
    const imp = localStorage.getItem('impToken_' + ws);
    if (imp) {
      sessionStorage.setItem('agencyToken', imp);
      return imp;
    }
  }
  return localStorage.getItem('agencyToken') || '';
}
function getRole()  { return sessionStorage.getItem('agencyRole') || localStorage.getItem('agencyRole') || 'admin'; }
function isAdmin()  { return getRole() === 'admin'; }

function getTokenPayload() {
  const t = getToken();
  if (!t) return null;
  try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
}

function authHeaders() {
  return {
    'Authorization': 'Bearer ' + getToken(),
    'Content-Type': 'application/json'
  };
}

function logout() {
  const ws = localStorage.getItem('currentWorkspace');
  if (ws) localStorage.removeItem('impToken_' + ws);
  sessionStorage.clear();
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
