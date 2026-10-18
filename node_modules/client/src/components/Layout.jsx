import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/', label: 'Carpool', icon: CarpoolIcon, end: true, kidVisible: true },
  { to: '/map', label: 'Map', icon: MapIcon, kidVisible: true },
  { to: '/pickup-requests', label: 'Pickup Requests', icon: PickupIcon, kidVisible: true },
  { to: '/messages', label: 'Messages', icon: MessagesIcon },
  { to: '/friends', label: 'Friends', icon: FriendsIcon, kidVisible: true },
  { to: '/notifications', label: 'Notifications', icon: BellIcon },
  { to: '/profile', label: 'Profile', icon: ProfileIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/safety', label: 'Safety', icon: ShieldIcon, kidVisible: true },
];

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { currentUser, unreadCount, notifications, refreshNotifications, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [sosError, setSosError] = useState('');
  const [sosSent, setSosSent] = useState(false);
  const [sosAcknowledging, setSosAcknowledging] = useState(false);
  const incomingSos = currentUser?.role === 'parent'
    ? notifications.find((notification) => notification.type === 'emergency_sos' && !notification.read)
    : null;

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSos = async () => {
    if (!currentUser) return;
    setSosBusy(true);
    setSosError('');
    setSosSent(false);
    try {
      await api.triggerSos({ message: 'Emergency SOS triggered from FamilyRoute.' });
      setSosSent(true);
    } catch (err) {
      setSosError(err.message || 'Unable to send emergency alert right now.');
    } finally {
      setSosBusy(false);
    }
  };

  const acknowledgeSos = async () => {
    if (!incomingSos) return;
    setSosAcknowledging(true);
    setSosError('');
    try {
      await api.markNotificationRead(incomingSos.id, true);
      refreshNotifications();
    } catch (err) {
      setSosError(err.message || 'Unable to dismiss this alert. Please try again.');
    } finally {
      setSosAcknowledging(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="icon-btn hamburger"
          aria-label="Toggle navigation"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <HamburgerIcon />
        </button>
        <div className="brand">
          <span className="brand-mark">🚗</span>
          <span className="brand-name">FamilyRoute</span>
        </div>

        <div className="topbar-spacer" />

        {currentUser?.role === 'kid' && (
          <button
            className="icon-btn bell-btn"
            aria-label="Emergency SOS"
            title="Emergency SOS"
            onClick={() => {
              setSosError('');
              setSosSent(false);
              setSosOpen(true);
            }}
            disabled={sosBusy}
          >
            <ShieldIcon />
          </button>
        )}

        <NavLink to="/notifications" className="icon-btn bell-btn" aria-label="Notifications">
          <BellIcon />
          {unreadCount > 0 && <span className="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </NavLink>

        <div className="user-menu" ref={menuRef}>
          <button className="user-menu-trigger" onClick={() => setMenuOpen((v) => !v)}>
            <span className="avatar" style={{ background: currentUser?.avatarColor || '#999' }}>
              {currentUser?.name?.[0] || '?'}
            </span>
            <span className="user-menu-name">{currentUser?.name}</span>
          </button>
          {menuOpen && (
            <div className="user-menu-dropdown card">
              <div className="user-menu-header">
                <div style={{ fontWeight: 700, fontSize: 14 }}>{currentUser?.name}</div>
                <div className="faint">{currentUser?.email}</div>
              </div>
              <NavLink to="/profile" className="user-menu-item" onClick={() => setMenuOpen(false)}>
                View profile
              </NavLink>
              <button className="user-menu-item user-menu-logout" onClick={handleLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="app-body">
        {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
        <nav className={`sidebar ${drawerOpen ? 'sidebar-open' : ''}`}>
          {NAV_ITEMS.filter((item) => currentUser?.role !== 'kid' || item.kidVisible).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="content-area">
          <Outlet />
        </main>
      </div>
      {sosOpen && (
        <Modal title="Emergency SOS" onClose={() => setSosOpen(false)}>
          {sosSent ? (
            <div className="stack">
              <p role="status">Emergency alert sent to your family contacts.</p>
              <button className="btn btn-primary" onClick={() => setSosOpen(false)}>Close</button>
            </div>
          ) : (
            <div className="stack">
              <p className="muted">This will send an emergency alert to your family contacts through FamilyRoute notifications. It does not contact emergency services.</p>
              {sosError && <div className="auth-error" role="alert">{sosError}</div>}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setSosOpen(false)} disabled={sosBusy}>Cancel</button>
                <button className="btn btn-danger" onClick={handleSos} disabled={sosBusy}>
                  {sosBusy ? 'Sending…' : 'Send emergency alert'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {incomingSos && (
        <Modal title="Student SOS alert" onClose={acknowledgeSos}>
          <div className="stack">
            <p role="alert" style={{ fontWeight: 700 }}>
              A student in your family needs your attention.
            </p>
            <p className="muted">{incomingSos.body}</p>
            <p className="faint">Received {new Date(incomingSos.createdAt).toLocaleString()}</p>
            {sosError && <div className="auth-error" role="alert">{sosError}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-danger" onClick={acknowledgeSos} disabled={sosAcknowledging}>
                {sosAcknowledging ? 'Closing…' : 'Acknowledge and close'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M7 3.5 3 5v11.5l4-1.5m0-11.5 6 1.5m-6-1.5v11.5m6-10 4-1.5V15L13 16.5m0-13v13m0-13-6 1.5m6 11.5-6-1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CarpoolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 12.5V9.8a1 1 0 0 1 .1-.44l1.2-2.5A1.5 1.5 0 0 1 6.65 6h6.7a1.5 1.5 0 0 1 1.35.86l1.2 2.5c.07.14.1.29.1.44v2.7M4 12.5a1 1 0 0 0 1 1h.5a1 1 0 0 0 1-1m-2.5 0v1.3a.7.7 0 0 0 .7.7h.6M16 12.5a1 1 0 0 1-1 1h-.5a1 1 0 0 1-1-1m2.5 0v1.3a.7.7 0 0 1-.7.7h-.6M6.5 13.5h7M4 9.8h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PickupIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 17s5.5-4.9 5.5-9A5.5 5.5 0 0 0 4.5 8c0 4.1 5.5 9 5.5 9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MessagesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M3.5 5.5A1.5 1.5 0 0 1 5 4h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 15 13H8l-3.2 2.6A.5.5 0 0 1 4 15.2V13h-.5A1.5 1.5 0 0 1 2 11.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="7" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="8.2" r="1.9" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 16c.6-2.7 2.3-4 4.2-4s3.6 1.3 4.2 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11.8 12.4c1.7.1 3 1.3 3.5 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 3.5c-2.2 0-4 1.8-4 4V10c0 .9-.35 1.75-.98 2.38L4.5 12.9c-.5.5-.15 1.35.55 1.35h10c.7 0 1.05-.85.55-1.35l-.52-.52A3.37 3.37 0 0 1 14 10V7.5c0-2.2-1.8-4-4-4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.3 15.8a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6.8" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 16c.7-3 3-4.5 6-4.5s5.3 1.5 6 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 3.5v1.3m0 10.4v1.3m6.5-6.5h-1.3M4.8 10H3.5m11.1-4.6-.9.9M6.4 13.6l-.9.9m9-.9.9.9M6.4 6.4l-.9-.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5 16 4.7v4.8c0 3.7-2.5 6.7-6 8.9-3.5-2.2-6-5.2-6-8.9V4.7l6-2.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 10.2 9.5 11.7 12.9 8.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
