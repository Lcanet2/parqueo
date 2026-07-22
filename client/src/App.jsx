import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import Settings from './pages/Settings.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tickets from './pages/Tickets.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import TicketNew from './pages/TicketNew.jsx';
import TicketCatalog from './pages/TicketCatalog.jsx';
import FormFill from './pages/FormFill.jsx';
import Kb from './pages/Kb.jsx';
import KbArticle from './pages/KbArticle.jsx';
import Assets from './pages/Assets.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import Admin from './pages/Admin.jsx';
import { Spinner } from './components/ui.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Protected>
                <SettingsProvider>
                  <Layout />
                </SettingsProvider>
              </Protected>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/tickets/nouveau" element={<TicketCatalog />} />
            <Route path="/tickets/nouveau/libre" element={<TicketNew />} />
            <Route path="/demandes/:id" element={<FormFill />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/aide" element={<Kb />} />
            <Route path="/aide/nouveau" element={<KbArticle />} />
            <Route path="/aide/:id" element={<KbArticle />} />
            <Route path="/inventaire" element={<Assets />} />
            <Route path="/inventaire/:id" element={<AssetDetail />} />
            <Route
              path="/admin"
              element={
                <AdminOnly>
                  <Admin />
                </AdminOnly>
              }
            />
            <Route
              path="/parametres"
              element={
                <AdminOnly>
                  <Settings />
                </AdminOnly>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
