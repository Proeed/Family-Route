import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto, { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');

const app = express();
app.use(cors());
app.use(express.json());

const now = () => new Date().toISOString();
const id = () => randomUUID();

const PALETTE = ['#4C7A63', '#8B5E3C', '#3D5A80', '#8E4162', '#5B6EAE', '#B0555C', '#4E8098', '#A6763F'];
function pickAvatarColor(seedStr) {
  let h = 0;
  for (const ch of seedStr) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return PALETTE[h % PALETTE.length];
}

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function ensureUserSafety(user) {
  if (!user) return user;
  user.safety = {
    verifiedParent: !!user.safety?.verifiedParent,
    verifiedDriver: !!user.safety?.verifiedDriver,
    driverProfile: user.safety?.driverProfile || null,
    parentApprovalRequired: !!user.safety?.parentApprovalRequired,
    childProfileVisible: user.role === 'kid' ? !!user.safety?.childProfileVisible : true,
    boardingPin: user.safety?.boardingPin || null,
    tripConfirmationRequired: !!user.safety?.tripConfirmationRequired,
    liveLocationEnabled: !!user.safety?.liveLocationEnabled,
    contentFilteringEnabled: user.safety?.contentFilteringEnabled ?? true,
    lastVerificationAt: user.safety?.lastVerificationAt || null,
    lastLoggedAction: user.safety?.lastLoggedAction || null,
  };
  return user;
}

function generateFamilyAccessToken() {
  return { token: String(Math.floor(100000 + Math.random() * 900000)), expiresAt: Date.now() + 15 * 60 * 1000 };
}

function activeFamilyTokens(family) {
  const items = family?.accessTokens || [];
  return items.filter((token) => token.expiresAt > Date.now());
}

function redactSensitiveText(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/https?:\/\/\S+/gi, '[link removed]').replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, '[phone removed]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]');
}

function containsBlockedContactInfo(text) {
  if (!text || typeof text !== 'string') return false;
  return /(https?:\/\/|\b\+?\d[\d\s().-]{7,}\d\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/i.test(text);
}

const SAFETY_KEY = crypto.createHash('sha256').update(process.env.SAFETY_KEY || 'familyroute-safety-key').digest();
function encryptValue(value) {
  if (value === null || value === undefined || value === '') return value;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', SAFETY_KEY, iv);
  const payload = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${payload.toString('hex')}`;
}

function decryptValue(value) {
  if (!value || typeof value !== 'string' || !value.includes(':')) return value;
  try {
    const [ivHex, tagHex, payloadHex] = value.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const payload = Buffer.from(payloadHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SAFETY_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Content moderation — this app is used by kids, so slurs are blocked
// outright (not just flagged after the fact) wherever a user types free text.
// ---------------------------------------------------------------------------

const SLUR_PATTERNS = [
  /(?<![a-z])n[i1!|]+[gq]+[e3]*r+(?![a-z])/i,
  /(?<![a-z])n[i1!|]+[gq]+[e3]*[e3]+r*(?![a-z])/i,
  /(?<![a-z])f[a4@]+g+[o0]+t(?![a-z])/i,
  /(?<![a-z])f[a4@]+g(?![a-z])/i,
  /(?<![a-z])k[i1!|]+k+[e3]+(?![a-z])/i,
  /(?<![a-z])sp[i1!|]+c(?![a-z])/i,
  /(?<![a-z])ch[i1!|]+nk(?![a-z])/i,
  /(?<![a-z])tr[a4@]+nn+y(?![a-z])/i,
  /(?<![a-z])r[e3]+t[a4@]+rd(?![a-z])/i,
  /(?<![a-z])w[e3]+tb[a4@]+ck(?![a-z])/i,
  /(?<![a-z])b[e3]+[a4@]+n+[e3]+r(?![a-z])/i,
  /(?<![a-z])g[o0]+[o0]+k(?![a-z])/i,
  /(?<![a-z])c[o0]+[o0]+n(?![a-z])/i,
];

function containsSlur(text) {
  if (!text) return false;
  const normalized = text.replace(/[\s._-]+/g, '');
  return SLUR_PATTERNS.some((pattern) => pattern.test(text) || pattern.test(normalized));
}

function rejectIfSlur(res, text) {
  if (containsSlur(text)) {
    res.status(400).json({ error: 'That contains language that isn’t allowed here.' });
    return true;
  }
  if (typeof text === 'string' && containsBlockedContactInfo(text)) {
    res.status(400).json({ error: 'Links, email addresses, and phone numbers are not allowed in chat or notes.' });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// In-memory data store (demo-only persistence)
// ---------------------------------------------------------------------------

const DEMO_PASSWORD_HASH = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'Sunny-Trail-77', 8);

const users = [
  {
    id: 'u_parent_sanjeev',
    name: 'Sanjeev',
    email: 'sanjeev@example.com',
    passwordHash: DEMO_PASSWORD_HASH,
    role: 'parent',
    avatarColor: '#4C7A63',
    familyId: 'fam_sanjeev',
    safety: {
      verifiedParent: true,
      verifiedDriver: true,
      driverProfile: {
        license: 'valid',
        insurance: 'valid',
        vehicle: '2022 Toyota Sienna',
      },
      parentApprovalRequired: false,
      childProfileVisible: true,
      boardingPin: '2468',
      tripConfirmationRequired: true,
      liveLocationEnabled: true,
      contentFilteringEnabled: true,
      lastVerificationAt: now(),
    },
  },
  {
    id: 'u_kid_maya',
    name: 'Maya',
    email: 'maya@example.com',
    passwordHash: DEMO_PASSWORD_HASH,
    role: 'kid',
    avatarColor: '#5B6EAE',
    familyId: 'fam_sanjeev',
    safety: {
      verifiedParent: false,
      verifiedDriver: false,
      parentApprovalRequired: true,
      childProfileVisible: false,
      boardingPin: '4821',
      tripConfirmationRequired: true,
      liveLocationEnabled: false,
      contentFilteringEnabled: true,
    },
  },
];

let families = [
  { id: 'fam_sanjeev', code: 'SUNNY12', name: "Sanjeev's Family", memberIds: ['u_parent_sanjeev', 'u_kid_maya'], accessTokens: [] },
];

// Edison, NJ schools — real, geocoded coordinates. This app is scoped to
// Edison; carpool/pickup destinations are always one of these five schools.
const PLACES = {
  woodrowWilsonMS: {
    name: 'Woodrow Wilson Middle School',
    lat: 40.5546604,
    lng: -74.3758401,
    address: '50 Woodrow Wilson Dr, Edison, NJ 08820',
  },
  herbertHooverMS: {
    name: 'Herbert Hoover Middle School',
    lat: 40.5326556,
    lng: -74.3387333,
    address: 'Brower Ave, Edison, NJ 08837',
  },
  johnAdamsMS: {
    name: 'John Adams Middle School',
    lat: 40.5794927,
    lng: -74.3695708,
    address: 'Fairmount Ave, Edison, NJ 08820',
  },
  johnPStevensHS: {
    name: 'John P. Stevens High School',
    lat: 40.5804609,
    lng: -74.3589441,
    address: '855 Grove Ave, Edison, NJ 08820',
  },
  edisonHS: {
    name: 'Edison High School',
    lat: 40.5144974,
    lng: -74.3872208,
    address: '50 Blvd of the Eagles, Edison, NJ 08817',
  },
};

const EDISON_CENTER = { name: 'Edison, NJ', lat: 40.5187, lng: -74.4121, address: 'Edison, NJ' };

let carpools = [];

let carpoolRequests = [];
let pickupRequests = [];
let trips = [];
let conversations = [];
let notifications = [];
let friendRequests = [];
let safetyEvents = [];
const tokens = new Map(); // token -> userId

// ---------------------------------------------------------------------------
// Disk persistence — snapshots the store to a local JSON file after every
// write so accounts and data survive a server restart. Sessions (tokens)
// intentionally don't persist; users just log back in.
// ---------------------------------------------------------------------------

function restoreSafeSnapshot(snapshot) {
  const restored = JSON.parse(JSON.stringify(snapshot));
  restored.users = (restored.users || []).map((user) => ({
    ...user,
    safety: {
      ...user.safety,
      boardingPin: user.safety?.boardingPin ? decryptValue(user.safety.boardingPin) : null,
    },
  }));
  restored.conversations = (restored.conversations || []).map((convo) => ({
    ...convo,
    messages: (convo.messages || []).map((message) => ({
      ...message,
      text: typeof message.text === 'string' ? decryptValue(message.text) : message.text,
    })),
  }));
  restored.trips = (restored.trips || []).map((trip) => ({
    ...trip,
    driverLocation: trip.driverLocation
      ? {
          ...trip.driverLocation,
          lat: typeof trip.driverLocation.lat === 'string' ? Number(decryptValue(trip.driverLocation.lat)) : trip.driverLocation.lat,
          lng: typeof trip.driverLocation.lng === 'string' ? Number(decryptValue(trip.driverLocation.lng)) : trip.driverLocation.lng,
        }
      : null,
  }));
  return restored;
}

function serializeSafeSnapshot(snapshot) {
  const safe = JSON.parse(JSON.stringify(snapshot));
  safe.users = (safe.users || []).map((user) => ({
    ...user,
    safety: {
      ...user.safety,
      boardingPin: user.safety?.boardingPin ? encryptValue(String(user.safety.boardingPin)) : null,
    },
  }));
  safe.conversations = (safe.conversations || []).map((convo) => ({
    ...convo,
    messages: (convo.messages || []).map((message) => ({
      ...message,
      text: typeof message.text === 'string' ? encryptValue(message.text) : message.text,
    })),
  }));
  safe.trips = (safe.trips || []).map((trip) => ({
    ...trip,
    driverLocation: trip.driverLocation
      ? {
          ...trip.driverLocation,
          lat: typeof trip.driverLocation.lat === 'number' ? encryptValue(String(trip.driverLocation.lat)) : trip.driverLocation.lat,
          lng: typeof trip.driverLocation.lng === 'number' ? encryptValue(String(trip.driverLocation.lng)) : trip.driverLocation.lng,
        }
      : null,
  }));
  return safe;
}

function loadPersistedState() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const saved = restoreSafeSnapshot(JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')));
    const loadedUsers = (saved.users || []).map(ensureUserSafety);
    users.splice(0, users.length, ...loadedUsers);
    families.splice(0, families.length, ...(saved.families || []).map((family) => ({ ...family, accessTokens: family.accessTokens || [] })));
    carpools.splice(0, carpools.length, ...(saved.carpools || []));
    carpoolRequests.splice(0, carpoolRequests.length, ...(saved.carpoolRequests || []));
    pickupRequests.splice(0, pickupRequests.length, ...(saved.pickupRequests || []));
    trips.splice(0, trips.length, ...(saved.trips || []));
    conversations.splice(0, conversations.length, ...(saved.conversations || []));
    notifications.splice(0, notifications.length, ...(saved.notifications || []));
    friendRequests.splice(0, friendRequests.length, ...(saved.friendRequests || []));
    safetyEvents.splice(0, safetyEvents.length, ...(saved.safetyEvents || []));
    users.forEach((user) => ensureUserSafety(user));
    console.log(`Loaded persisted data (${users.length} users) from ${DATA_FILE}`);
  } catch (err) {
    console.error('Failed to load persisted data, starting from seed data instead:', err.message);
  }
}

function persist() {
  const snapshot = {
    users,
    families,
    carpools,
    carpoolRequests,
    pickupRequests,
    trips,
    conversations,
    notifications,
    friendRequests,
    safetyEvents,
  };
  fs.writeFile(DATA_FILE, JSON.stringify(serializeSafeSnapshot(snapshot)), (err) => {
    if (err) console.error('Failed to persist data:', err.message);
  });
}

loadPersistedState();

app.use((req, res, next) => {
  res.on('finish', () => {
    if (req.method !== 'GET' && req.path.startsWith('/api/') && res.statusCode < 400) {
      persist();
    }
  });
  next();
});

function findOrCreateConversation(userIdA, userIdB) {
  let convo = conversations.find(
    (c) => c.participants.includes(userIdA) && c.participants.includes(userIdB)
  );
  if (!convo) {
    convo = {
      id: id(),
      participants: [userIdA, userIdB],
      messages: [],
      createdAt: now(),
    };
    conversations.push(convo);
  }
  return convo;
}

function pushMessage(convo, message) {
  const full = { id: id(), createdAt: now(), ...message };
  convo.messages.push(full);
  return full;
}

function notify(userId, { type, title, body, relatedId }) {
  const n = {
    id: id(),
    userId,
    type,
    title,
    body,
    relatedId: relatedId ?? null,
    read: false,
    createdAt: now(),
  };
  notifications.push(n);
  return n;
}

function logSafetyEvent({ userId, eventType, summary, evidence = null, severity = 'info', familyId = null }) {
  const event = {
    id: id(),
    userId,
    familyId,
    eventType,
    summary,
    evidence,
    severity,
    createdAt: now(),
  };
  safetyEvents.push(event);
  return event;
}

function userById(uid) {
  return users.find((u) => u.id === uid);
}

function familyById(fid) {
  return families.find((f) => f.id === fid);
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  const out = { ...rest };
  if (out.safety) {
    out.safety = {
      verifiedParent: !!out.safety.verifiedParent,
      verifiedDriver: !!out.safety.verifiedDriver,
      parentApprovalRequired: !!out.safety.parentApprovalRequired,
      childProfileVisible: !!out.safety.childProfileVisible,
      tripConfirmationRequired: !!out.safety.tripConfirmationRequired,
      liveLocationEnabled: !!out.safety.liveLocationEnabled,
      contentFilteringEnabled: !!out.safety.contentFilteringEnabled,
      driverProfile: out.safety.driverProfile || null,
    };
  }
  return out;
}

function areFriends(userIdA, userIdB) {
  return friendRequests.some(
    (r) =>
      r.status === 'accepted' &&
      ((r.fromUserId === userIdA && r.toUserId === userIdB) ||
        (r.fromUserId === userIdB && r.toUserId === userIdA))
  );
}

function familyParentsOf(kidId, { excludeUserId } = {}) {
  const kid = userById(kidId);
  if (!kid?.familyId) return [];
  const family = familyById(kid.familyId);
  if (!family) return [];
  return family.memberIds
    .map(userById)
    .filter((u) => u && u.role === 'parent' && u.id !== excludeUserId);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = token ? tokens.get(token) : null;
  const user = userId ? userById(userId) : null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.currentUserId = user.id;
  req.currentUser = user;
  next();
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path === '/api/auth/signup' || req.path === '/api/auth/login') return next();
  return authenticate(req, res, next);
});

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
  if (!['parent', 'kid'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (rejectIfSlur(res, name)) return;

  const normalizedEmail = email.trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const user = {
    id: id(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: bcrypt.hashSync(password, 8),
    role,
    avatarColor: pickAvatarColor(name + email),
    familyId: null,
    safety: {
      verifiedParent: role === 'parent' ? false : false,
      verifiedDriver: false,
      driverProfile: null,
      parentApprovalRequired: role === 'kid',
      childProfileVisible: role === 'kid' ? false : true,
      boardingPin: null,
      tripConfirmationRequired: true,
      liveLocationEnabled: false,
      contentFilteringEnabled: true,
      lastVerificationAt: null,
      lastLoggedAction: 'Account created',
    },
  };
  users.push(user);

  const token = id();
  tokens.set(token, user.id);
  res.status(201).json({ user: publicUser(user), token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email.toLowerCase() === (email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const token = id();
  tokens.set(token, user.id);
  res.json({ user: publicUser(user), token });
});

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) tokens.delete(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json(publicUser(req.currentUser));
});

app.get('/api/safety/status', (req, res) => {
  const me = req.currentUser;
  const upcomingFamilyToken = activeFamilyTokens(familyById(me.familyId)).at(-1) || null;
  const latestTrip = trips.filter((trip) => trip.requesterId === me.id || trip.pickerId === me.id).slice(-1)[0] || null;
  res.json({
    currentUser: publicUser(me),
    parentVerified: !!me.safety?.verifiedParent,
    driverVerified: !!me.safety?.verifiedDriver,
    familyAccessToken: upcomingFamilyToken,
    childProfileVisible: !!me.safety?.childProfileVisible,
    boardingPin: me.safety?.boardingPin || null,
    activeTrip: latestTrip ? { id: latestTrip.id, status: latestTrip.status } : null,
    policies: {
      geofencingEnabled: true,
      dataMinimization: true,
      contentFilteringEnabled: !!me.safety?.contentFilteringEnabled,
      dualApprovalRequired: true,
    },
  });
});

app.get('/api/safety/dashboard', (req, res) => {
  const me = req.currentUser;
  const family = me.familyId ? familyById(me.familyId) : null;
  const familyMembers = family ? family.memberIds.map(userById).filter(Boolean).map(publicUser) : [];
  const rideHistory = trips.filter((trip) => trip.pickerId === me.id || trip.requesterId === me.id || family?.memberIds.includes(trip.requesterId) || family?.memberIds.includes(trip.pickerId));
  const myConversations = conversations.filter((convo) => convo.participants.includes(me.id)).map((convo) => ({
    id: convo.id,
    participants: convo.participants.map(userById).filter(Boolean).map(publicUser),
    messageCount: convo.messages.length,
    lastMessage: convo.messages.at(-1) || null,
  }));
  const events = safetyEvents.filter((event) => (!event.familyId || event.familyId === me.familyId) && (!event.userId || event.userId === me.id || family?.memberIds.includes(event.userId))).slice(-20).reverse();
  res.json({
    familyMembers,
    rideHistory: rideHistory.map((trip) => ({ id: trip.id, status: trip.status, createdAt: trip.createdAt, requesterId: trip.requesterId, pickerId: trip.pickerId })),
    conversations: myConversations,
    activeFriendList: users.filter((u) => u.id !== me.id && areFriends(me.id, u.id)).map(publicUser),
    safetyEvents: events,
  });
});

app.get('/api/safety/events', (req, res) => {
  const me = req.currentUser;
  const family = me.familyId ? familyById(me.familyId) : null;
  const events = safetyEvents.filter((event) => (!event.familyId || event.familyId === me.familyId) && (!event.userId || event.userId === me.id || family?.memberIds.includes(event.userId))).slice(-30).reverse();
  res.json(events);
});

app.post('/api/safety/sos', (req, res) => {
  const me = req.currentUser;
  if (me.role !== 'kid') {
    return res.status(403).json({ error: 'Only a student account can send an SOS alert.' });
  }
  if (!me.familyId) {
    return res.status(400).json({ error: 'Join your family before sending an SOS alert.' });
  }
  const { lat, lng, message } = req.body || {};
  const notifyTargets = familyParentsOf(me.id).map((parent) => parent.id);
  if (notifyTargets.length === 0) {
    return res.status(400).json({ error: 'No linked parent is available to receive this SOS alert.' });
  }
  notifyTargets.forEach((userId) => {
    notify(userId, {
      type: 'emergency_sos',
      title: 'Emergency SOS alert',
      body: `${me.name} triggered an emergency SOS${lat && lng ? ` near ${lat}, ${lng}` : ''}. ${message || 'Please check in immediately.'}`,
      relatedId: me.id,
    });
  });
  logSafetyEvent({
    userId: me.id,
    eventType: 'emergency_sos',
    summary: `${me.name} triggered an emergency SOS`,
    evidence: { lat, lng, message },
    severity: 'critical',
    familyId: me.familyId,
  });
  res.status(201).json({ ok: true, message: 'Emergency alert sent to family contacts.' });
});

app.post('/api/safety/parent-verify', (req, res) => {
  const me = req.currentUser;
  if (me.role !== 'parent') return res.status(403).json({ error: 'Only parent accounts can complete parental verification.' });
  const { verificationType = 'card-check', reference = 'manual-review' } = req.body || {};
  me.safety.verifiedParent = true;
  me.safety.lastVerificationAt = now();
  me.safety.lastLoggedAction = `Parent verification completed via ${verificationType} (${reference})`;
  res.json({ ok: true, user: publicUser(me) });
});

app.post('/api/safety/driver-verify', (req, res) => {
  const me = req.currentUser;
  if (me.role !== 'parent') return res.status(403).json({ error: 'Only parent accounts can verify driver credentials.' });
  const { license, insurance, vehicle } = req.body || {};
  if (!license || !insurance || !vehicle) {
    return res.status(400).json({ error: 'Driver license, insurance, and vehicle details are required.' });
  }
  me.safety.verifiedDriver = true;
  me.safety.driverProfile = { license, insurance, vehicle };
  me.safety.lastVerificationAt = now();
  me.safety.lastLoggedAction = 'Driver verification completed';
  res.json({ ok: true, user: publicUser(me) });
});

app.post('/api/safety/family-token', (req, res) => {
  const me = req.currentUser;
  if (!me.familyId) return res.status(400).json({ error: 'Create or join a family before generating a short-lived family token.' });
  const family = familyById(me.familyId);
  const token = generateFamilyAccessToken();
  family.accessTokens = (family.accessTokens || []).filter((item) => item.expiresAt > Date.now());
  family.accessTokens.push(token);
  res.json({ token, expiresAt: token.expiresAt });
});

app.post('/api/safety/boarding-pin', (req, res) => {
  const me = req.currentUser;
  const pin = String(req.body?.pin || '').replace(/\D/g, '').slice(0, 4);
  if (!pin || pin.length !== 4) return res.status(400).json({ error: 'A 4-digit boarding PIN is required.' });
  me.safety.boardingPin = pin;
  me.safety.lastLoggedAction = 'Boarding PIN refreshed';
  res.json({ ok: true, boardingPin: pin });
});

// ---------------------------------------------------------------------------
// Users / directory / friends
// ---------------------------------------------------------------------------

app.get('/api/users', (req, res) => {
  const meId = req.currentUserId;
  const me = req.currentUser;
  const { search } = req.query;
  let results = users.filter((u) => u.id !== meId);
  results = results.filter((u) => {
    if (u.role !== 'kid') return true;
    if (me.role === 'parent' && me.familyId && u.familyId === me.familyId) return true;
    return !!u.safety?.childProfileVisible;
  });
  if (search) {
    const q = search.toLowerCase();
    results = results.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  res.json(
    results.map((u) => {
      const outgoing = friendRequests.find((r) => r.fromUserId === meId && r.toUserId === u.id && r.status === 'pending');
      const incoming = friendRequests.find((r) => r.fromUserId === u.id && r.toUserId === meId && r.status === 'pending');
      let friendStatus = 'none';
      if (areFriends(meId, u.id)) friendStatus = 'friends';
      else if (outgoing) friendStatus = 'pending_outgoing';
      else if (incoming) friendStatus = 'pending_incoming';
      return { ...publicUser(u), friendStatus, incomingRequestId: incoming?.id ?? null };
    })
  );
});

app.get('/api/places', (req, res) => {
  res.json(Object.entries(PLACES).map(([key, place]) => ({ id: key, ...place })));
});

app.get('/api/friends', (req, res) => {
  const meId = req.currentUserId;
  const friendIds = friendRequests
    .filter((r) => r.status === 'accepted' && (r.fromUserId === meId || r.toUserId === meId))
    .map((r) => (r.fromUserId === meId ? r.toUserId : r.fromUserId));
  res.json(friendIds.map(userById).filter(Boolean).map(publicUser));
});

app.post('/api/friend-requests', (req, res) => {
  const meId = req.currentUserId;
  const me = req.currentUser;
  const { toUserId, parentApproved } = req.body;
  const target = userById(toUserId);
  if (!target || toUserId === meId) return res.status(400).json({ error: 'Invalid recipient' });
  if (areFriends(meId, toUserId)) return res.status(409).json({ error: 'Already friends' });
  if ((me.role === 'kid' || target.role === 'kid') && parentApproved !== true) {
    return res.status(403).json({ error: 'Parent approval is required before connecting with a child account.' });
  }

  const existing = friendRequests.find(
    (r) => r.status === 'pending' && r.fromUserId === meId && r.toUserId === toUserId
  );
  if (existing) return res.status(200).json(existing);

  const reverse = friendRequests.find(
    (r) => r.status === 'pending' && r.fromUserId === toUserId && r.toUserId === meId
  );
  if (reverse) {
    reverse.status = 'accepted';
    notify(reverse.fromUserId, {
      type: 'friend_request_accepted',
      title: 'Friend request accepted',
      body: `${req.currentUser.name} accepted your friend request.`,
      relatedId: reverse.id,
    });
    return res.status(200).json(reverse);
  }

  const request = { id: id(), fromUserId: meId, toUserId, status: 'pending', createdAt: now(), parentApproved: !!parentApproved };
  friendRequests.push(request);
  logSafetyEvent({ userId: meId, eventType: 'friend_request_submitted', summary: `${me.name} sent a friend request to ${target.name}.`, severity: 'info', familyId: me.familyId });
  notify(toUserId, {
    type: 'friend_request_received',
    title: 'New friend request',
    body: `${req.currentUser.name} wants to connect.`,
    relatedId: request.id,
  });
  res.status(201).json(request);
});

app.get('/api/friend-requests', (req, res) => {
  const meId = req.currentUserId;
  const { direction = 'incoming' } = req.query;
  const results = friendRequests.filter((r) =>
    direction === 'outgoing'
      ? r.fromUserId === meId && r.status === 'pending'
      : r.toUserId === meId && r.status === 'pending'
  );
  res.json(results.map((r) => ({ ...r, fromUser: publicUser(userById(r.fromUserId)), toUser: publicUser(userById(r.toUserId)) })));
});

app.patch('/api/friend-requests/:id', (req, res) => {
  const request = friendRequests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.toUserId !== req.currentUserId) return res.status(403).json({ error: 'Not your request' });
  const { status } = req.body;
  if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  request.status = status;
  if (status === 'accepted') {
    notify(request.fromUserId, {
      type: 'friend_request_accepted',
      title: 'Friend request accepted',
      body: `${req.currentUser.name} accepted your friend request.`,
      relatedId: request.id,
    });
    logSafetyEvent({ userId: req.currentUserId, eventType: 'friend_request_accepted', summary: `${req.currentUser.name} accepted a friend request.`, severity: 'info', familyId: req.currentUser.familyId });
  }
  res.json(request);
});

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

app.get('/api/families/mine', (req, res) => {
  const me = req.currentUser;
  if (!me.familyId) return res.json(null);
  const family = familyById(me.familyId);
  if (!family) return res.json(null);
  res.json({ ...family, members: family.memberIds.map(userById).filter(Boolean).map(publicUser) });
});

app.post('/api/families', (req, res) => {
  const me = req.currentUser;
  if (me.familyId) return res.status(409).json({ error: 'You are already in a family' });
  const { name } = req.body;
  if (rejectIfSlur(res, name)) return;
  if (me.role === 'kid' && req.body.parentApproved !== true) {
    return res.status(403).json({ error: 'A parent must approve a child family link before joining.' });
  }
  let code = generateCode();
  while (families.some((f) => f.code === code)) code = generateCode();

  const family = { id: id(), code, name: name?.trim() || `${me.name}'s Family`, memberIds: [me.id], accessTokens: [] };
  families.push(family);
  me.familyId = family.id;
  logSafetyEvent({ userId: me.id, familyId: family.id, eventType: 'family_created', summary: `${me.name} created a new family.`, severity: 'info' });
  res.status(201).json({ ...family, members: [publicUser(me)] });
});

app.post('/api/families/join', (req, res) => {
  const me = req.currentUser;
  if (me.familyId) return res.status(409).json({ error: 'You are already in a family' });
  const { code, token, parentApproved } = req.body;
  const normalizedCode = (code || '').trim().toUpperCase();
  let family = families.find((f) => f.code === normalizedCode);
  if (!family && token) {
    family = families.find((candidate) => (candidate.accessTokens || []).some((entry) => entry.token === String(token) && entry.expiresAt > Date.now()));
  }
  if (!family) return res.status(404).json({ error: "That family code or token doesn't match anything" });
  if (me.role === 'kid' && parentApproved !== true) return res.status(403).json({ error: 'A parent must approve a child family link before joining.' });

  family.memberIds.push(me.id);
  me.familyId = family.id;
  family.accessTokens = (family.accessTokens || []).filter((entry) => entry.expiresAt > Date.now() && entry.token !== String(token));

  family.memberIds
    .filter((uid) => uid !== me.id)
    .forEach((uid) =>
      notify(uid, {
        type: 'family_member_joined',
        title: 'Family updated',
        body: `${me.name} joined your family using a secure family token.`,
        relatedId: family.id,
      })
    );
  logSafetyEvent({ userId: me.id, familyId: family.id, eventType: 'family_joined', summary: `${me.name} joined ${family.name}.`, severity: 'info' });

  res.json({ ...family, members: family.memberIds.map(userById).filter(Boolean).map(publicUser) });
});

app.post('/api/families/leave', (req, res) => {
  const me = req.currentUser;
  if (!me.familyId) return res.status(400).json({ error: 'You are not in a family' });
  const family = familyById(me.familyId);
  if (family) family.memberIds = family.memberIds.filter((uid) => uid !== me.id);
  me.familyId = null;
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Carpools
// ---------------------------------------------------------------------------

// A carpool "expires" once its ride time passes: it still shows (as expired)
// for a 5-minute grace window, then drops out of the list entirely.
const EXPIRY_GRACE_MS = 5 * 60 * 1000;

function carpoolVisibility(c) {
  if (c.status !== 'active') return null;
  if (!c.time) return 'active';
  const rideMs = new Date(c.time).getTime();
  const nowMs = Date.now();
  if (nowMs < rideMs) return 'active';
  if (nowMs < rideMs + EXPIRY_GRACE_MS) return 'expired';
  return null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Offers must be created the day before the ride, by 8 PM that day. Requests
// to join must land by 10 PM that same day (the day before the ride).
function carpoolDeadlines(rideTime) {
  const rideDay = startOfDay(rideTime);
  const creationDay = new Date(rideDay);
  creationDay.setDate(creationDay.getDate() - 1);
  const creationDeadline = new Date(creationDay);
  creationDeadline.setHours(20, 0, 0, 0);
  const requestDeadline = new Date(creationDay);
  requestDeadline.setHours(22, 0, 0, 0);
  return { creationDay, creationDeadline, requestDeadline };
}

app.get('/api/carpools', (req, res) => {
  const withDriver = carpools
    .map((c) => ({ ...c, effectiveStatus: carpoolVisibility(c) }))
    .filter((c) => c.effectiveStatus)
    .map((c) => ({
      ...c,
      driver: publicUser(userById(c.driverId)),
      passengerDetails: c.passengers.map(userById).filter(Boolean).map(publicUser),
    }));
  res.json(withDriver);
});

app.post('/api/carpools', (req, res) => {
  if (req.currentUser.role !== 'parent') return res.status(403).json({ error: 'Only parents can offer carpools' });
  const { kind, pickupArea, pickupLocation, destination, time, seatsTotal } = req.body;
  if (!req.currentUser.safety?.verifiedDriver && !req.currentUser.safety?.verifiedParent) {
    return res.status(403).json({ error: 'Driver verification is required before offering a carpool route.' });
  }
  if (rejectIfSlur(res, pickupArea)) return;
  if (!['pickup', 'dropoff'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be "pickup" or "dropoff"' });
  }
  if (!time) return res.status(400).json({ error: 'Pick a ride date and time' });

  const rideTime = new Date(time);
  if (Number.isNaN(rideTime.getTime())) return res.status(400).json({ error: 'Invalid ride time' });
  const { creationDay, creationDeadline } = carpoolDeadlines(rideTime);
  const today = startOfDay(new Date());
  if (today.getTime() !== creationDay.getTime()) {
    return res.status(400).json({
      error: `Carpool offers must be created the day before the ride — that's ${creationDay.toLocaleDateString()}.`,
    });
  }
  if (Date.now() > creationDeadline.getTime()) {
    return res.status(400).json({ error: 'Too late to offer this carpool — offers must be created by 8:00 PM the day before the ride.' });
  }

  const carpool = {
    id: id(),
    driverId: req.currentUserId,
    kind,
    pickupArea,
    pickupLocation: pickupLocation || EDISON_CENTER,
    destination: destination || PLACES.edisonHS,
    time,
    seatsTotal: Number(seatsTotal) || 3,
    passengers: [],
    status: 'active',
    createdAt: now(),
  };
  carpools.push(carpool);
  res.status(201).json(carpool);
});

app.post('/api/carpools/:id/cancel', (req, res) => {
  const carpool = carpools.find((c) => c.id === req.params.id);
  if (!carpool) return res.status(404).json({ error: 'Carpool not found' });
  if (carpool.driverId !== req.currentUserId) {
    return res.status(403).json({ error: 'Only the driver who created this carpool can cancel it' });
  }
  if (carpool.status === 'cancelled') return res.json(carpool);

  carpool.status = 'cancelled';
  const guardianIds = carpoolRequests
    .filter((r) => r.carpoolId === carpool.id && r.status === 'approved')
    .map((r) => r.parentId);
  const notifyIds = new Set([...carpool.passengers, ...guardianIds]);
  notifyIds.forEach((userId) => {
    notify(userId, {
      type: 'carpool_cancelled',
      title: 'Carpool cancelled',
      body: `${req.currentUser.name} cancelled the carpool to ${carpool.destination.address.split(',')[0]}.`,
      relatedId: carpool.id,
    });
  });

  res.json(carpool);
});

app.post('/api/carpools/:id/requests', (req, res) => {
  const carpool = carpools.find((c) => c.id === req.params.id);
  if (!carpool) return res.status(404).json({ error: 'Carpool not found' });
  if (carpoolVisibility(carpool) !== 'active') return res.status(400).json({ error: 'This carpool is no longer accepting requests' });

  const me = req.currentUser;
  if (me.role !== 'parent' || !me.familyId) {
    return res.status(400).json({ error: 'Link with your child through a family code before requesting a carpool seat' });
  }
  const { kidId, parentApproved = false } = req.body;
  const kid = userById(kidId);
  if (!kid || kid.role !== 'kid' || kid.familyId !== me.familyId) {
    return res.status(400).json({ error: "Pick one of your linked kids to request this seat for" });
  }
  if (kid.safety?.parentApprovalRequired && parentApproved !== true) {
    return res.status(403).json({ error: 'Parent approval is required before a child can join a carpool.' });
  }
  if (carpool.passengers.includes(kidId)) {
    return res.status(409).json({ error: 'This kid already has a seat on this carpool' });
  }

  if (carpool.time) {
    const { requestDeadline } = carpoolDeadlines(new Date(carpool.time));
    if (Date.now() > requestDeadline.getTime()) {
      return res.status(400).json({ error: 'Too late to request this carpool — requests must be in by 10:00 PM the day before the ride.' });
    }
  }

  const parentId = req.currentUserId;
  const request = { id: id(), carpoolId: carpool.id, parentId, kidId, status: 'pending', createdAt: now(), parentApproved: !!parentApproved };
  carpoolRequests.push(request);
  logSafetyEvent({ userId: parentId, familyId: me.familyId, eventType: 'carpool_request_submitted', summary: `${me.name} requested a seat for ${kid.name}.`, severity: 'info' });

  notify(carpool.driverId, {
    type: 'carpool_request_submitted',
    title: 'New carpool request',
    body: `${me.name} wants a seat for ${kid.name} on your carpool to ${carpool.destination.address.split(',')[0]}.`,
    relatedId: request.id,
  });

  res.status(201).json(request);
});

app.get('/api/carpool-requests', (req, res) => {
  const meId = req.currentUserId;
  const myCarpoolIds = carpools.filter((c) => c.driverId === meId).map((c) => c.id);
  const results = carpoolRequests.filter((r) => r.parentId === meId || myCarpoolIds.includes(r.carpoolId));
  res.json(
    results.map((r) => ({
      ...r,
      parent: publicUser(userById(r.parentId)),
      kid: publicUser(userById(r.kidId)),
      carpool: carpools.find((c) => c.id === r.carpoolId),
    }))
  );
});

app.patch('/api/carpool-requests/:id', (req, res) => {
  const request = carpoolRequests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const carpool = carpools.find((c) => c.id === request.carpoolId);
  if (!carpool || carpool.driverId !== req.currentUserId) {
    return res.status(403).json({ error: 'Only the carpool driver can decide this request' });
  }
  const { status } = req.body;
  if (!['approved', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or declined' });
  }

  request.status = status;
  const kid = userById(request.kidId);

  if (status === 'approved') {
    if (!carpool.passengers.includes(request.kidId)) {
      carpool.passengers.push(request.kidId);
    }
    notify(request.parentId, {
      type: 'carpool_request_approved',
      title: 'Carpool request approved',
      body: `You're in! ${userById(carpool.driverId)?.name} confirmed ${kid?.name}'s seat for ${carpool.pickupArea}.`,
      relatedId: carpool.id,
    });

    const convo = findOrCreateConversation(carpool.driverId, request.parentId);
    pushMessage(convo, {
      from: carpool.driverId,
      type: 'text',
      text: `${kid?.name} is confirmed for the carpool to ${carpool.destination.address.split(',')[0]}. See you at pickup!`,
    });
  } else {
    notify(request.parentId, {
      type: 'carpool_request_declined',
      title: 'Carpool request declined',
      body: `Your request for ${kid?.name} to join the carpool wasn't approved this time.`,
      relatedId: carpool?.id,
    });
  }

  res.json(request);
});

// ---------------------------------------------------------------------------
// Pickup requests
//
// Only kids request; only their linked parent(s) approve. A single request
// covers both directions — "kind" just decides which side is the school:
// pickup (school -> address, kid needs a ride home) or dropoff (address ->
// school, kid needs a ride to school). Approving creates a trip: a Google
// Maps-ready route plus live location tracking.
// ---------------------------------------------------------------------------

app.get('/api/pickup-requests', (req, res) => {
  const me = req.currentUser;
  let results = pickupRequests.filter((r) => {
    if (r.requesterId === me.id) return true;
    if (me.role === 'parent' && me.familyId) {
      const kid = userById(r.kidId);
      return kid && kid.familyId === me.familyId;
    }
    return false;
  });
  if (req.query.status) results = results.filter((r) => r.status === req.query.status);

  res.json(
    results
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((r) => ({
        ...r,
        requester: publicUser(userById(r.requesterId)),
        kid: r.kidId ? publicUser(userById(r.kidId)) : null,
      }))
  );
});

app.post('/api/pickup-requests', (req, res) => {
  const me = req.currentUser;
  if (me.role !== 'kid') return res.status(403).json({ error: 'Only kids can request a pickup or drop-off' });
  if (!me.familyId) {
    return res.status(400).json({ error: 'Join a family with a family code before requesting a pickup' });
  }

  const { kind, pickupLocation, destination, notes, time } = req.body;
  if (!['pickup', 'dropoff'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be "pickup" or "dropoff"' });
  }
  if (rejectIfSlur(res, notes)) return;

  const request = {
    id: id(),
    requesterId: me.id,
    kidId: me.id,
    kind,
    pickupLocation: pickupLocation || EDISON_CENTER,
    destination: destination || PLACES.edisonHS,
    notes: notes || '',
    time: time || null,
    status: 'pending',
    assignedPickerId: null,
    createdAt: now(),
  };
  pickupRequests.push(request);

  const verb = kind === 'pickup' ? 'a pickup from' : 'a drop-off to';
  const place = kind === 'pickup' ? request.pickupLocation : request.destination;
  familyParentsOf(me.id, { excludeUserId: me.id }).forEach((parent) => {
    notify(parent.id, {
      type: 'pickup_request_submitted',
      title: kind === 'pickup' ? 'New pickup request' : 'New drop-off request',
      body: `${me.name} requested ${verb} ${place.address.split(',')[0]}.`,
      relatedId: request.id,
    });
  });

  res.status(201).json(request);
});

app.patch('/api/pickup-requests/:id', (req, res) => {
  const request = pickupRequests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const me = req.currentUser;
  const { status } = req.body;
  if (!['approved', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or declined' });
  }

  const kid = userById(request.kidId);
  if (me.role !== 'parent' || !kid || kid.familyId !== me.familyId) {
    return res.status(403).json({ error: "Only the requester's linked parent can decide this" });
  }

  request.status = status;

  if (status === 'approved') {
    request.assignedPickerId = me.id;
    logSafetyEvent({ userId: me.id, familyId: me.familyId, eventType: 'pickup_approved', summary: `${me.name} approved a pickup request for ${kid?.name || 'a child'}.`, severity: 'info' });

    notify(request.requesterId, {
      type: 'pickup_request_approved',
      title: request.kind === 'pickup' ? 'Pickup approved' : 'Drop-off approved',
      body: 'Your route is ready.',
      relatedId: request.id,
    });

    const convo = findOrCreateConversation(me.id, request.requesterId);
    pushMessage(convo, {
      from: me.id,
      type: 'text',
      text: `Pickup approved! I'll see you at ${request.pickupLocation.address.split(',')[0]}.`,
    });
    pushMessage(convo, {
      from: me.id,
      type: 'location',
      pickupLocation: request.pickupLocation,
      destination: request.destination,
      relatedPickupRequestId: request.id,
    });

    notify(request.requesterId, {
      type: 'location_shared',
      title: 'Location shared',
      body: 'The pickup location and route were shared in Messages.',
      relatedId: convo.id,
    });

    const trip = {
      id: id(),
      pickupRequestId: request.id,
      pickerId: me.id,
      requesterId: request.requesterId,
      kidId: request.kidId,
      familyParentIds: request.kidId ? familyParentsOf(request.kidId, { excludeUserId: me.id }).map((p) => p.id) : [],
      pickupLocation: request.pickupLocation,
      destination: request.destination,
      status: 'not_started',
      driverLocation: null,
      createdAt: now(),
    };
    trips.push(trip);
    request.tripId = trip.id;
    logSafetyEvent({ userId: request.requesterId, familyId: me.familyId, eventType: 'trip_created', summary: `Trip created for ${kid?.name || 'a child'} with ${me.name}.`, severity: 'info' });
  } else {
    notify(request.requesterId, {
      type: 'pickup_request_declined',
      title: request.kind === 'pickup' ? 'Pickup declined' : 'Drop-off declined',
      body: "This request wasn't approved. You can try a different time.",
      relatedId: request.id,
    });
  }

  res.json(request);
});

// ---------------------------------------------------------------------------
// Trips — Google Maps route + live location tracking for an approved pickup
// ---------------------------------------------------------------------------

function tripForClient(t) {
  return {
    ...t,
    picker: publicUser(userById(t.pickerId)),
    requester: publicUser(userById(t.requesterId)),
    kid: t.kidId ? publicUser(userById(t.kidId)) : null,
  };
}

function canSeeTrip(trip, userId) {
  return trip.pickerId === userId || trip.requesterId === userId || trip.familyParentIds.includes(userId);
}

app.get('/api/trips', (req, res) => {
  const meId = req.currentUserId;
  const results = trips.filter((t) => canSeeTrip(t, meId));
  if (req.query.status) return res.json(results.filter((t) => t.status === req.query.status).map(tripForClient));
  res.json(results.map(tripForClient));
});

app.get('/api/trips/:id', (req, res) => {
  const trip = trips.find((t) => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!canSeeTrip(trip, req.currentUserId)) return res.status(403).json({ error: 'Not part of this trip' });
  res.json(tripForClient(trip));
});

app.patch('/api/trips/:id', (req, res) => {
  const trip = trips.find((t) => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.pickerId !== req.currentUserId) return res.status(403).json({ error: 'Only the picker can update this trip' });

  const { status, confirmedByParent } = req.body;
  if (trip.status === 'not_started' && confirmedByParent !== true) {
    return res.status(403).json({ error: 'Both the driver and the child’s parent must confirm the trip before it starts.' });
  }
  const validTransitions = { not_started: ['in_progress'], in_progress: ['completed'] };
  if (!validTransitions[trip.status]?.includes(status)) {
    return res.status(400).json({ error: `Cannot move trip from ${trip.status} to ${status}` });
  }
  trip.status = status;

  const picker = userById(trip.pickerId);
  const who = userById(trip.kidId)?.name || userById(trip.requesterId)?.name || 'They';
  const notifyList = new Set([...trip.familyParentIds, trip.requesterId].filter((uid) => uid !== trip.pickerId));

  if (status === 'in_progress') {
    logSafetyEvent({ userId: trip.requesterId, familyId: userById(trip.requesterId)?.familyId, eventType: 'trip_in_progress', summary: `${picker.name} started the trip for ${who}.`, severity: 'info' });
    notifyList.forEach((uid) =>
      notify(uid, {
        type: 'trip_pickup_started',
        title: 'Pickup complete',
        body: `${picker.name} picked up ${who === picker.name ? 'them' : who} and is on the way.`,
        relatedId: trip.id,
      })
    );
  } else if (status === 'completed') {
    logSafetyEvent({ userId: trip.requesterId, familyId: userById(trip.requesterId)?.familyId, eventType: 'trip_completed', summary: `${who} arrived safely at ${trip.destination.address.split(',')[0]}.`, severity: 'info' });
    notifyList.forEach((uid) =>
      notify(uid, {
        type: 'trip_dropoff_completed',
        title: 'Drop-off complete',
        body: `${who} arrived safely at ${trip.destination.address.split(',')[0]}.`,
        relatedId: trip.id,
      })
    );
  }

  res.json(tripForClient(trip));
});
app.post('/api/trips/:id/location', (req, res) => {
  const trip = trips.find((t) => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.pickerId !== req.currentUserId) return res.status(403).json({ error: 'Only the picker can share location' });
  if (trip.status !== 'in_progress') return res.status(403).json({ error: 'Live location is only shared during active trip windows.' });
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat/lng required' });
  trip.driverLocation = { lat, lng, updatedAt: now() };
  res.json(tripForClient(trip));
});

// ---------------------------------------------------------------------------
// Conversations / Messages
// ---------------------------------------------------------------------------

app.get('/api/conversations', (req, res) => {
  const meId = req.currentUserId;
  const results = conversations.filter((c) => c.participants.includes(meId));
  res.json(
    results.map((c) => ({
      ...c,
      participants: c.participants.map(userById).map(publicUser),
      lastMessage: c.messages[c.messages.length - 1] || null,
    }))
  );
});

app.post('/api/conversations', (req, res) => {
  const meId = req.currentUserId;
  const { toUserId } = req.body;
  const target = userById(toUserId);
  if (!target) return res.status(400).json({ error: 'Unknown user' });
  if (!areFriends(meId, toUserId)) return res.status(403).json({ error: 'You can only message friends' });
  const convo = findOrCreateConversation(meId, toUserId);
  res.status(201).json({ ...convo, participants: convo.participants.map(userById).map(publicUser) });
});

app.get('/api/conversations/:id', (req, res) => {
  const convo = conversations.find((c) => c.id === req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  if (!convo.participants.includes(req.currentUserId)) return res.status(403).json({ error: 'Not part of this conversation' });
  res.json({ ...convo, participants: convo.participants.map(userById).map(publicUser) });
});

app.post('/api/conversations/:id/messages', (req, res) => {
  const convo = conversations.find((c) => c.id === req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  if (!convo.participants.includes(req.currentUserId)) return res.status(403).json({ error: 'Not part of this conversation' });
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (rejectIfSlur(res, text)) return;
  if (containsBlockedContactInfo(text)) {
    return res.status(400).json({ error: 'Links, email addresses, and phone numbers are blocked in chat.' });
  }
  const sanitizedText = redactSensitiveText(text);
  const message = pushMessage(convo, { from: req.currentUserId, type: 'text', text: sanitizedText });

  const recipientId = convo.participants.find((p) => p !== req.currentUserId);
  if (recipientId) {
    notify(recipientId, {
      type: 'new_message',
      title: `New message from ${req.currentUser.name}`,
      body: sanitizedText,
      relatedId: convo.id,
    });
  }
  logSafetyEvent({ userId: req.currentUserId, eventType: 'chat_message_sent', summary: `${req.currentUser.name} sent a message in a family conversation.`, severity: 'info', familyId: req.currentUser.familyId });

  res.status(201).json(message);
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

app.get('/api/notifications', (req, res) => {
  const results = notifications.filter((n) => n.userId === req.currentUserId);
  res.json(results.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
});

app.patch('/api/notifications/read-all', (req, res) => {
  notifications.filter((n) => n.userId === req.currentUserId).forEach((n) => (n.read = true));
  res.json({ ok: true });
});

app.patch('/api/notifications/:id', (req, res) => {
  const n = notifications.find((n) => n.id === req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification not found' });
  if (n.userId !== req.currentUserId) return res.status(403).json({ error: 'Not your notification' });
  if (typeof req.body.read === 'boolean') n.read = req.body.read;
  res.json(n);
});

// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Carpool API listening on http://localhost:${PORT}`);
});
