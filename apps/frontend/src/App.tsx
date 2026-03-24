import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import SessionRuntimeHotkeys from './components/SessionRuntimeHotkeys';
import { applyRootTableTheme } from './theme/tableTheme';
import HomePage from './pages/HomePage';
import MasterConsole from './pages/MasterConsole';
import DmSettingsPage from './pages/DmSettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AccountPage from './pages/AccountPage';
import TableScreen from './pages/TableScreen';
import InitiativeRemotePage from './pages/InitiativeRemotePage';
import PlayerCardDemoPage from './pages/PlayerCardDemoPage';
import ThemeBuilderPage from './pages/ThemeBuilderPage';

/** Home, auth, and account use Dark Arcane; table/master routes set their own theme on load. */
function LandingAndAuthRootTheme() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/account'
    ) {
      applyRootTableTheme('darkArcane');
    }
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <LandingAndAuthRootTheme />
      <SessionRuntimeHotkeys />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/demo/player-cards" element={<PlayerCardDemoPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/dm/settings" element={<DmSettingsPage />} />
      <Route path="/dm/settings/theme-builder" element={<ThemeBuilderPage />} />
      <Route path="/master" element={<MasterConsole />} />
      <Route path="/dm" element={<Navigate to="/master" replace />} />
      <Route path="/display/:displayToken" element={<TableScreen />} />
      <Route path="/initiative-remote/:displayToken" element={<InitiativeRemotePage />} />
    </Routes>
    </>
  );
}
