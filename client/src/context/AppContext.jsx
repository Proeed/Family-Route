import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from '../api.js';

const AppContext = createContext(null);

function fireBrowserNotification(n) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(n.title, { body: n.body, tag: n.id });
  } catch {
    // Notification constructor can throw in some embedded contexts; safe to ignore.
  }
}

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const seenNotificationIds = useRef(new Set());

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    api
      .me()
      .then((user) => setCurrentUser(user))
      .catch(() => setToken(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user, token } = await api.login({ email, password });
    setToken(token);
    setCurrentUser(user);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return user;
  }, []);

  const signup = useCallback(async (data) => {
    const { user, token } = await api.signup(data);
    setToken(token);
    setCurrentUser(user);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // token may already be invalid; clear local state regardless.
    }
    setToken(null);
    setCurrentUser(null);
    setNotifications([]);
    seenNotificationIds.current = new Set();
  }, []);

  const updateCurrentUser = useCallback((patch) => {
    setCurrentUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const refreshNotifications = useCallback(() => {
    if (!currentUser) return;
    api
      .getNotifications()
      .then((list) => {
        list
          .filter((n) => !n.read && !seenNotificationIds.current.has(n.id))
          .forEach((n) => {
            seenNotificationIds.current.add(n.id);
            fireBrowserNotification(n);
          });
        setNotifications(list);
      })
      .catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 4000);
    return () => clearInterval(interval);
  }, [currentUser, refreshNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const value = {
    currentUser,
    authLoading,
    login,
    signup,
    logout,
    updateCurrentUser,
    notifications,
    unreadCount,
    refreshNotifications,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
