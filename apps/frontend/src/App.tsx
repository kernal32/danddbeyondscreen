import { Routes, Route } from 'react-router-dom';
import SessionRuntimeHotkeys from './components/SessionRuntimeHotkeys';
import HomePage from './pages/HomePage';
import DmConsole from './pages/DmConsole';
import DmSettingsPage from './pages/DmSettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AccountPage from './pages/AccountPage';
import TableScreen from './pages/TableScreen';
import InitiativeRemotePage from './pages/InitiativeRemotePage';
import PlayerCardDemoPage from './pages/PlayerCardDemoPage';

export default function App() {
  return (
    <>
      <SessionRuntimeHotkeys />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/demo/player-cards" element={<PlayerCardDemoPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/dm/settings" element={<DmSettingsPage />} />
      <Route path="/dm" element={<DmConsole />} />
      <Route path="/display/:displayToken" element={<TableScreen />} />
      <Route path="/initiative-remote/:displayToken" element={<InitiativeRemotePage />} />
    </Routes>
    </>
  );
}
