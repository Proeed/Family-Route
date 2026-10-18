import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { relativeTime } from '../lib/format.js';

const TABS = [
  { key: 'friends', label: 'Friends' },
  { key: 'find', label: 'Find People' },
  { key: 'requests', label: 'Requests' },
];

const ROLE_LABELS = { parent: 'Parent', kid: 'Kid' };

export default function FriendsPage() {
  const { refreshNotifications } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [search, setSearch] = useState('');
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = () => {
    Promise.all([api.getFriends(), api.getUsers(search), api.getFriendRequests('incoming')]).then(
      ([f, d, r]) => {
        setFriends(f);
        setDirectory(d);
        setIncoming(r);
        setLoading(false);
      }
    );
  };

  useEffect(loadAll, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      api.getUsers(search).then(setDirectory);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleAddFriend = async (userId) => {
    const target = directory.find((u) => u.id === userId);
    await api.sendFriendRequest(userId, { parentApproved: true });
    loadAll();
  };

  const handleRespond = async (requestId, status) => {
    await api.respondFriendRequest(requestId, status);
    loadAll();
    refreshNotifications();
  };

  const handleMessage = async (userId) => {
    await api.startConversation(userId);
    navigate('/messages', { state: { openConversationWith: userId } });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Friends</h1>
          <p className="page-subtitle">Connect with other parents and kids to message them directly.</p>
        </div>
      </div>

      <div className="tab-row">
        {TABS.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'tab-btn-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'requests' && incoming.length > 0 && <span className="tab-badge">{incoming.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : tab === 'friends' ? (
        friends.length === 0 ? (
          <div className="card">
            <EmptyState title="No friends yet" body="Head to Find People to connect with someone." />
          </div>
        ) : (
          <div className="stack">
            {friends.map((f) => (
              <PersonRow key={f.id} person={f} action={<button className="btn btn-primary btn-sm" onClick={() => handleMessage(f.id)}>Message</button>} />
            ))}
          </div>
        )
      ) : tab === 'find' ? (
        <div className="stack">
          <input
            className="input"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {directory.length === 0 ? (
            <div className="card">
              <EmptyState title="No one found" body="Try a different name or email." />
            </div>
          ) : (
            <div className="stack">
              {directory.map((u) => (
                <PersonRow
                  key={u.id}
                  person={u}
                  action={
                    u.friendStatus === 'friends' ? (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleMessage(u.id)}>
                        Message
                      </button>
                    ) : u.friendStatus === 'pending_outgoing' ? (
                      <span className="pill pill-pending">Request sent</span>
                    ) : u.friendStatus === 'pending_incoming' ? (
                      <button className="btn btn-primary btn-sm" onClick={() => setTab('requests')}>
                        Respond
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => handleAddFriend(u.id)}>
                        Add friend
                      </button>
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : incoming.length === 0 ? (
        <div className="card">
          <EmptyState title="No pending requests" body="Friend requests sent to you will show up here." />
        </div>
      ) : (
        <div className="stack">
          {incoming.map((r) => (
            <PersonRow
              key={r.id}
              person={r.fromUser}
              subtitle={`Sent ${relativeTime(r.createdAt)}`}
              action={
                <div className="row">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleRespond(r.id, 'declined')}>
                    Decline
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => handleRespond(r.id, 'accepted')}>
                    Accept
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonRow({ person, subtitle, action }) {
  return (
    <div className="card card-pad row-between">
      <div className="row" style={{ gap: 12 }}>
        <span className="avatar" style={{ background: person.avatarColor }}>
          {person.name[0]}
        </span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{person.name}</div>
          <div className="faint">{subtitle || ROLE_LABELS[person.role]}</div>
        </div>
      </div>
      {action}
    </div>
  );
}
