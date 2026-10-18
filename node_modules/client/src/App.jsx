import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import MapPage from './pages/MapPage.jsx';
import CarpoolPage from './pages/CarpoolPage.jsx';
import PickupRequestsPage from './pages/PickupRequestsPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import FriendsPage from './pages/FriendsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import SafetyDashboardPage from './pages/SafetyDashboardPage.jsx';

function RequireAuth({ children }) {
  const { currentUser, authLoading } = useApp();
  if (authLoading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const { currentUser, authLoading } = useApp();
  if (authLoading) return null;
  if (currentUser) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <LoginPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/signup"
            element={
              <RedirectIfAuthed>
                <SignupPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<CarpoolPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/pickup-requests" element={<PickupRequestsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/safety" element={<SafetyDashboardPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
