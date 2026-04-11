import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import RootErrorBoundary from './components/RootErrorBoundary';
import SessionRuntimeHotkeys from './components/SessionRuntimeHotkeys';
import { applyRootTableTheme } from './theme/tableTheme';
import HomePage from './pages/HomePage';

const MasterConsole = lazy(() => import('./pages/MasterConsole'));
const DmSettingsPage = lazy(() => import('./pages/DmSettingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const TableScreen = lazy(() => import('./pages/TableScreen'));
const InitiativeRemotePage = lazy(() => import('./pages/InitiativeRemotePage'));
const PlayerCardDemoPage = lazy(() => import('./pages/PlayerCardDemoPage'));
const ThemeBuilderPage = lazy(() => import('./pages/ThemeBuilderPage'));
const InitiativeCustomizerPage = lazy(() => import('./pages/InitiativeCustomizerPage'));

/** Home, auth, and account use Dark Arcane; table/master routes set their own theme on load. */
function LandingAndAuthRootTheme() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/account' ||
      pathname === '/admin'
    ) {
      applyRootTableTheme('darkArcane');
    }
  }, [pathname]);
  return null;
}

function RouteFallback() {
  return (
    <div className="theme-dark-arcane flex min-h-dvh items-center justify-center px-4 text-sm text-[var(--muted)]">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <RootErrorBoundary>
      <LandingAndAuthRootTheme />
      <SessionRuntimeHotkeys />
      <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/demo/player-cards" element={<PlayerCardDemoPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/dm/settings" element={<DmSettingsPage />} />
      <Route path="/dm/settings/theme-builder" element={<ThemeBuilderPage />} />
      <Route path="/dm/settings/initiative-customizer" element={<InitiativeCustomizerPage />} />
      <Route path="/master" element={<MasterConsole />} />
      <Route path="/dm" element={<Navigate to="/master" replace />} />
      <Route path="/display/:displayToken" element={<TableScreen />} />
      <Route path="/initiative-remote/:displayToken" element={<InitiativeRemotePage />} />
    </Routes>
      </Suspense>
    </RootErrorBoundary>
  );
}
