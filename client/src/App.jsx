import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import Settings from './pages/Settings.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import DemoBanner from './components/DemoBanner.jsx';
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
import Software from './pages/Software.jsx';
import Admin from './pages/Admin.jsx';
import Account from './pages/Account.jsx';
import { Spinner } from './components/ui.jsx';
import GlobalErrors from './components/GlobalErrors.jsx';

function Protected({ children }) {
  const { user, loading, needsSetup } = useAuth();
  if (loading) return <Spinner />;
  // Une instance sans aucun compte n'a rien à protéger : on envoie sur
  // l'installation plutôt que sur un écran de connexion impossible à passer.
  if (needsSetup) return <Navigate to="/installation" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// L'installation ne s'ouvre que tant qu'aucun compte n'existe. Le serveur
// applique la même règle (409) : cette redirection est du confort, pas la
// serrure.
function SetupOnly() {
  const { loading, needsSetup, user } = useAuth();
  if (loading) return <Spinner />;
  if (!needsSetup) return <Navigate to={user ? '/' : '/login'} replace />;
  return <Setup />;
}

// Écran de connexion : inutile tant que personne n'a installé l'application.
function LoginOrSetup() {
  const { loading, needsSetup } = useAuth();
  if (loading) return <Spinner />;
  if (needsSetup) return <Navigate to="/installation" replace />;
  return <Login />;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

// Réservé au support (technicien + admin) : le catalogue logiciel n'est pas
// destiné aux utilisateurs finals.
function StaffOnly({ children }) {
  const { user } = useAuth();
  if (user.role === 'user') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <GlobalErrors />
        <DemoBanner />
        <Routes>
          <Route path="/installation" element={<SetupOnly />} />
          <Route path="/login" element={<LoginOrSetup />} />
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
            <Route path="/compte" element={<Account />} />
            <Route path="/aide" element={<Kb />} />
            <Route path="/aide/nouveau" element={<KbArticle />} />
            <Route path="/aide/:id" element={<KbArticle />} />
            <Route path="/inventaire" element={<Assets />} />
            <Route path="/inventaire/:id" element={<AssetDetail />} />
            <Route
              path="/logiciels"
              element={
                <StaffOnly>
                  <Software />
                </StaffOnly>
              }
            />
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
