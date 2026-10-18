// In-memory data store for local development.
// Step 12 (Backend) replaces this with a real database — the shape here
// is designed so that swap doesn't require route changes.

let nextId = 1;
const id = () => String(nextId++);

export const db = {
  users: [],
  carpools: [],
  pickupRequests: [],
  messages: [],
  notifications: []
};

export function insert(collection, record) {
  const withId = { id: id(), createdAt: new Date().toISOString(), ...record };
  db[collection].push(withId);
  return withId;
}

export function findAll(collection) {
  return db[collection];
}

export function findById(collection, recordId) {
  return db[collection].find((r) => r.id === recordId);
}

export function update(collection, recordId, changes) {
  const record = findById(collection, recordId);
  if (!record) return null;
  Object.assign(record, changes, { updatedAt: new Date().toISOString() });
  return record;
}
