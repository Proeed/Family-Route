const BASE = '/api';
const TOKEN_KEY = 'family-transport:token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  signup: (data) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  getUsers: (search = '') => request(`/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getPlaces: () => request('/places'),

  getFriends: () => request('/friends'),
  sendFriendRequest: (toUserId, extra = {}) =>
    request('/friend-requests', { method: 'POST', body: JSON.stringify({ toUserId, ...extra }) }),
  getFriendRequests: (direction = 'incoming') => request(`/friend-requests?direction=${direction}`),
  respondFriendRequest: (id, status) => request(`/friend-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getMyFamily: () => request('/families/mine'),
  createFamily: (name, extra = {}) => request('/families', { method: 'POST', body: JSON.stringify({ name, ...extra }) }),
  joinFamily: (code, extra = {}) => request('/families/join', { method: 'POST', body: JSON.stringify({ code, ...extra }) }),
  leaveFamily: () => request('/families/leave', { method: 'POST' }),

  getCarpools: () => request('/carpools'),
  createCarpool: (data) => request('/carpools', { method: 'POST', body: JSON.stringify(data) }),
  cancelCarpool: (carpoolId) => request(`/carpools/${carpoolId}/cancel`, { method: 'POST' }),
  requestCarpool: (carpoolId, kidId, extra = {}) =>
    request(`/carpools/${carpoolId}/requests`, { method: 'POST', body: JSON.stringify({ kidId, ...extra }) }),
  getCarpoolRequests: () => request('/carpool-requests'),
  updateCarpoolRequest: (id, status) =>
    request(`/carpool-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getPickupRequests: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/pickup-requests${qs ? `?${qs}` : ''}`);
  },
  createPickupRequest: (data) => request('/pickup-requests', { method: 'POST', body: JSON.stringify(data) }),
  updatePickupRequest: (id, data) => request(`/pickup-requests/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getTrips: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/trips${qs ? `?${qs}` : ''}`);
  },
  getTrip: (id) => request(`/trips/${id}`),
  updateTripStatus: (id, status) => request(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  postTripLocation: (id, lat, lng) => request(`/trips/${id}/location`, { method: 'POST', body: JSON.stringify({ lat, lng }) }),

  getConversations: () => request('/conversations'),
  startConversation: (toUserId) => request('/conversations', { method: 'POST', body: JSON.stringify({ toUserId }) }),
  getConversation: (id) => request(`/conversations/${id}`),
  sendMessage: (conversationId, text) =>
    request(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),

  getSafetyStatus: () => request('/safety/status'),
  verifyParent: (verificationType, reference) =>
    request('/safety/parent-verify', { method: 'POST', body: JSON.stringify({ verificationType, reference }) }),
  verifyDriver: (license, insurance, vehicle) =>
    request('/safety/driver-verify', { method: 'POST', body: JSON.stringify({ license, insurance, vehicle }) }),
  createFamilyAccessToken: () => request('/safety/family-token', { method: 'POST' }),
  setBoardingPin: (pin) => request('/safety/boarding-pin', { method: 'POST', body: JSON.stringify({ pin }) }),
  getSafetyDashboard: () => request('/safety/dashboard'),
  triggerSos: (payload = {}) => request('/safety/sos', { method: 'POST', body: JSON.stringify(payload) }),

  getNotifications: () => request('/notifications'),
  markNotificationRead: (id, read = true) =>
    request(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read }) }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
};
