import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import EmptyState from '../components/EmptyState.jsx';
import { relativeTime } from '../lib/format.js';

const ICONS = {
  pickup_request_submitted: '🧍',
  pickup_request_approved: '✅',
  pickup_request_declined: '⚠️',
  carpool_request_submitted: '🚗',
  carpool_request_approved: '✅',
  carpool_request_declined: '⚠️',
  location_shared: '📍',
  new_message: '💬',
  trip_pickup_started: '🚗',
  trip_dropoff_completed: '🏁',
  friend_request_received: '🤝',
  friend_request_accepted: '🤝',
  family_member_joined: '👪',
};

export default function NotificationsPage() {
  const { currentUser, notifications, refreshNotifications } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  if (!currentUser) return null;

  const handleClick = async (n) => {
    if (!n.read) await api.markNotificationRead(n.id, true);
    refreshNotifications();
    if (n.type.startsWith('pickup_request') || n.type.startsWith('trip_')) navigate('/pickup-requests');
    else if (n.type.startsWith('carpool_request')) navigate('/carpool');
    else if (n.type === 'location_shared' || n.type === 'new_message') navigate('/messages');
    else if (n.type.startsWith('friend_request')) navigate('/friends');
    else if (n.type === 'family_member_joined') navigate('/profile');
  };

  const handleMarkAll = async () => {
    await api.markAllNotificationsRead();
    refreshNotifications();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Stay on top of pickups, carpools, and messages.</p>
        </div>
        {notifications.some((n) => !n.read) && (
          <button className="btn btn-secondary" onClick={handleMarkAll}>
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card">
          <EmptyState title="Nothing here yet" body="You'll be notified about pickups, carpools, and new messages." />
        </div>
      ) : (
        <div className="stack">
          {notifications.map((n) => (
            <button key={n.id} className="card notification-row" onClick={() => handleClick(n)}>
              <span className="notification-icon">{ICONS[n.type] || '🔔'}</span>
              <span className="notification-text">
                <span className="notification-title">{n.title}</span>
                <span className="muted">{n.body}</span>
              </span>
              <span className="row" style={{ gap: 8, flexShrink: 0 }}>
                {!n.read && <span className="unread-dot" />}
                <span className="faint">{relativeTime(n.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
