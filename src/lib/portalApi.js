// Client for the /api/portal and /api/masaajid endpoints — the masjid-portal
// counterpart to store.js, kept separate since it talks to a different login
// system (per-masjid accounts, not the single shared madrasah password).
import { NetworkError } from './store';

export class PortalAuthError extends Error {}

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new NetworkError('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    if (res.status === 401) throw new PortalAuthError(msg);
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ──
export async function portalLogin(email, password) {
  return apiFetch('/api/portal/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export async function portalLogout() {
  return apiFetch('/api/portal/logout', { method: 'POST' });
}
export async function portalSession() {
  return apiFetch('/api/portal/session');
}

// ── Masaajid ──
export async function listMasaajid() { return apiFetch('/api/masaajid'); }
export async function getMasjid(id) { return apiFetch(`/api/masaajid/${id}`); }
export async function createMasjid(data) { return apiFetch('/api/masaajid', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateMasjid(id, data) { return apiFetch(`/api/masaajid/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteMasjid(id) { return apiFetch(`/api/masaajid/${id}`, { method: 'DELETE' }); }

// ── Salaah times ──
export async function getSalaahTimes(masjidId) { return apiFetch(`/api/masaajid/${masjidId}/salaah-times`); }
export async function updateSalaahTimes(masjidId, data) {
  return apiFetch(`/api/masaajid/${masjidId}/salaah-times`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ── Talks ──
export async function listTalks(masjidId, { all = false } = {}) {
  return apiFetch(`/api/masaajid/${masjidId}/talks${all ? '?all=true' : ''}`);
}
export async function createTalk(masjidId, data) {
  return apiFetch(`/api/masaajid/${masjidId}/talks`, { method: 'POST', body: JSON.stringify(data) });
}
export async function updateTalk(masjidId, talkId, data) {
  return apiFetch(`/api/masaajid/${masjidId}/talks/${talkId}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export async function deleteTalk(masjidId, talkId) {
  return apiFetch(`/api/masaajid/${masjidId}/talks/${talkId}`, { method: 'DELETE' });
}

// ── Portal accounts (super_admin only) ──
export async function listPortalUsers() { return apiFetch('/api/portal/users'); }
export async function createPortalUser(data) { return apiFetch('/api/portal/users', { method: 'POST', body: JSON.stringify(data) }); }
export async function deletePortalUser(id) { return apiFetch(`/api/portal/users/${id}`, { method: 'DELETE' }); }
