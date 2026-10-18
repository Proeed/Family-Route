import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { formatTime, googleMapsDirectionsUrl, relativeTime, shortAddress } from '../lib/format.js';
import './MessagesPage.css';

export default function MessagesPage() {
  const { currentUser } = useApp();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [sendError, setSendError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const bottomRef = useRef(null);
  const pendingOpenRef = useRef(location.state?.openConversationWith || null);

  const loadConversations = () => api.getConversations().then(setConversations);

  useEffect(() => {
    if (!currentUser) return;
    const targetUserId = pendingOpenRef.current;
    if (!targetUserId) {
      api.getConversations().then((convos) => {
        setConversations(convos);
        if (convos.length) setActiveId(convos[0].id);
      });
      return;
    }
    pendingOpenRef.current = null;
    api.startConversation(targetUserId).then((convo) => {
      loadConversations();
      setActiveId(convo.id);
      setShowThreadOnMobile(true);
    });
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId) return;
    const load = () => api.getConversation(activeId).then(setThread);
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread]);

  if (!currentUser) return null;

  const otherPerson = (convo) => convo.participants?.find((p) => p.id !== currentUser.id);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !activeId) return;
    setSendError('');
    try {
      await api.sendMessage(activeId, draft.trim());
      setDraft('');
      const updated = await api.getConversation(activeId);
      setThread(updated);
      loadConversations();
    } catch (err) {
      setSendError(err.message);
    }
  };

  const openRoute = (msg) => {
    navigate('/map', {
      state: {
        focusRoute: {
          id: `msg-${msg.id}`,
          label: 'Shared pickup location',
          pickupLocation: msg.pickupLocation,
          destination: msg.destination,
          color: '#2f6f5e',
        },
      },
    });
  };

  const openNewChat = () => {
    api.getFriends().then(setFriends);
    setNewChatOpen(true);
  };

  const startChatWith = async (userId) => {
    const convo = await api.startConversation(userId);
    setNewChatOpen(false);
    loadConversations();
    setActiveId(convo.id);
    setShowThreadOnMobile(true);
  };

  return (
    <div className="messages-page">
      <div className={`convo-list ${showThreadOnMobile ? 'hide-on-mobile' : ''}`}>
        <div className="convo-list-header row-between">
          <h1 className="page-title" style={{ fontSize: 18 }}>
            Messages
          </h1>
          <button className="btn btn-ghost btn-sm" onClick={openNewChat}>
            + New
          </button>
        </div>
        {conversations.length === 0 ? (
          <EmptyState title="No conversations yet" body="Message a friend, or approved pickups will start one here automatically." />
        ) : (
          conversations.map((c) => {
            const person = otherPerson(c);
            const last = c.lastMessage;
            return (
              <button
                key={c.id}
                className={`convo-item ${activeId === c.id ? 'convo-item-active' : ''}`}
                onClick={() => {
                  setActiveId(c.id);
                  setShowThreadOnMobile(true);
                }}
              >
                <span className="avatar" style={{ background: person?.avatarColor || '#999' }}>
                  {person?.name?.[0] || '?'}
                </span>
                <span className="convo-item-text">
                  <span className="convo-item-name">{person?.name}</span>
                  <span className="convo-item-preview">
                    {last ? (last.type === 'location' ? '📍 Pickup location shared' : last.text) : 'No messages yet'}
                  </span>
                </span>
                {last && <span className="faint">{relativeTime(last.createdAt)}</span>}
              </button>
            );
          })
        )}
      </div>

      <div className={`thread ${showThreadOnMobile ? '' : 'hide-on-mobile'}`}>
        {thread ? (
          <>
            <div className="thread-header">
              <button className="btn btn-ghost btn-sm back-btn" onClick={() => setShowThreadOnMobile(false)}>
                ← Back
              </button>
              <span className="avatar" style={{ background: otherPerson(thread)?.avatarColor || '#999' }}>
                {otherPerson(thread)?.name?.[0] || '?'}
              </span>
              <span style={{ fontWeight: 700 }}>{otherPerson(thread)?.name}</span>
            </div>

            <div className="thread-messages">
              {thread.messages.map((m) => {
                const mine = m.from === currentUser.id;
                if (m.type === 'location') {
                  return (
                    <div key={m.id} className={`msg-row ${mine ? 'msg-row-mine' : ''}`}>
                      <div className="card location-card">
                        <div className="location-card-title">📍 Pickup Location</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {shortAddress(m.pickupLocation.address)} → {shortAddress(m.destination.address)}
                        </div>
                        <div className="row" style={{ marginTop: 12 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => openRoute(m)}>
                            View route
                          </button>
                          <a
                            className="btn btn-secondary btn-sm"
                            href={googleMapsDirectionsUrl(m.pickupLocation, m.destination)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in Google Maps
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={`msg-row ${mine ? 'msg-row-mine' : ''}`}>
                    <div className={`bubble ${mine ? 'bubble-mine' : ''}`}>
                      <span>{m.text}</span>
                      <span className="bubble-time">{formatTime(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {sendError && (
              <div className="auth-error" style={{ margin: '0 18px' }}>
                {sendError}
              </div>
            )}
            <form className="thread-composer" onSubmit={handleSend}>
              <input
                className="input"
                placeholder="Write a message…"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSendError('');
                }}
              />
              <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <EmptyState title="Select a conversation" body="Pick a conversation from the list to see messages." />
        )}
      </div>

      {newChatOpen && (
        <Modal title="Message a friend" onClose={() => setNewChatOpen(false)}>
          {friends.length === 0 ? (
            <EmptyState title="No friends yet" body="Add friends from the Friends page, then message them here." />
          ) : (
            <div className="stack">
              {friends.map((f) => (
                <button key={f.id} className="card card-pad row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => startChatWith(f.id)}>
                  <span className="avatar" style={{ background: f.avatarColor }}>
                    {f.name[0]}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
