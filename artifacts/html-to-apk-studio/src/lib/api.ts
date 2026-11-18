// Lightweight typed API client for the Webz backend.
const BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

async function request<T = any>(method: string, path: string, body?: any, admin = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 300) };
  }
  if (!res.ok) {
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  }
  return data as T;
}

export const api = {
  // --- auth ---
  session: () => request('GET', '/auth/session'),
  register: (email: string, password: string, name: string) =>
    request('POST', '/auth/register', { email, password, name }),
  login: (email: string, password: string) => request('POST', '/auth/login', { email, password }),
  logout: () => request('POST', '/auth/logout'),
  verifyEmail: (email: string, code: string) => request('POST', '/auth/verify-email', { email, code }),
  resendVerification: (email: string) => request('POST', '/auth/resend-verification', { email }),
  forgotPassword: (email: string) => request('POST', '/auth/forgot-password', { email }),
  resetPassword: (email: string, code: string, password: string) =>
    request('POST', '/auth/reset-password', { email, code, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('POST', '/auth/change-password', { currentPassword, newPassword }),

  // --- account ---
  me: () => request('GET', '/me'),
  myBuilds: () => request('GET', '/me/builds'),
  redeemKey: (key: string) => request('POST', '/me/premium/redeem', { key }),
  createSupport: (subject: string, message: string, type?: string) =>
    request('POST', '/me/support', { subject, message, type }),
  mySupport: () => request('GET', '/me/support'),
  myAnnouncements: () => request('GET', '/me/announcements'),
  markAnnouncementRead: (id: string) => request('POST', `/me/announcements/${id}/read`),
  chatSettings: () => request('GET', '/me/chat/settings'),
  updateChatSettings: (settings: any) => request('PATCH', '/me/chat/settings', settings),

  // --- builds ---
  createBuild: (input: any) => request('POST', '/apk/build', input),
  buildStatus: (id: string) => request('GET', `/apk/build/${id}`),
  buildDownloadUrl: (id: string) => `${BASE}/apk/build/${id}/download`,

  // --- admin ---
  adminLogin: (username: string, password: string) =>
    request('POST', '/admin/login', { username, password }),
  adminLogout: () => request('POST', '/admin/logout'),
  adminSession: () => request('GET', '/admin/session'),
  adminOverview: () => request('GET', '/admin/overview'),
  adminUsers: (q?: string) => request('GET', `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminUpdateUser: (id: string, patch: any) => request('PATCH', `/admin/users/${id}`, patch),
  adminDeleteUser: (id: string) => request('DELETE', `/admin/users/${id}`),
  adminBuilds: () => request('GET', '/admin/builds'),
  adminCreateKey: (data: any) => request('POST', '/admin/keys', data),
  adminKeys: () => request('GET', '/admin/keys'),
  adminDeleteKey: (id: string) => request('DELETE', `/admin/keys/${id}`),
  adminSettings: () => request('GET', '/admin/settings'),
  adminUpdateSettings: (patch: any) => request('PATCH', '/admin/settings', patch),
  adminRequests: () => request('GET', '/admin/requests'),
  adminUpdateRequest: (id: string, patch: any) => request('PATCH', `/admin/requests/${id}`, patch),
  adminAnnouncements: () => request('GET', '/admin/announcements'),
  adminCreateAnnouncement: (data: any) => request('POST', '/admin/announcements', data),
  adminUpdateAnnouncement: (id: string, patch: any) => request('PATCH', `/admin/announcements/${id}`, patch),
  adminDeleteAnnouncement: (id: string) => request('DELETE', `/admin/announcements/${id}`),
  adminChatMessages: () => request('GET', '/admin/chat/messages'),
  adminPostChatMessage: (content: string) => request('POST', '/admin/chat/messages', { content }),
  adminDeleteChatMessage: (id: string) => request('DELETE', `/admin/chat/messages/${id}`),
};

// Session persistence (localStorage)
const USER_KEY = 'webz_user';
const ADMIN_KEY = 'webz_admin_username';

export function saveUser(user: any) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function loadUser(): any {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}
export function clearUser() {
  localStorage.removeItem(USER_KEY);
}
export function saveAdminUsername(username: string) {
  localStorage.setItem(ADMIN_KEY, username);
}
export function loadAdminUsername(): string | null {
  return localStorage.getItem(ADMIN_KEY);
}
export function clearAdmin() {
  localStorage.removeItem(ADMIN_KEY);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(value: number | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}
