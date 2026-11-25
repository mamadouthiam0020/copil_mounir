import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import { LogoMark } from '@/components/Logo';
import Login from '@/pages/Login';
import type { Role } from '@/types';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Clients = lazy(() => import('@/pages/Clients'));
const ClientDetail = lazy(() => import('@/pages/ClientDetail'));
const Planning = lazy(() => import('@/pages/Planning'));
const Quotes = lazy(() => import('@/pages/Quotes'));
const QuoteEditor = lazy(() => import('@/pages/QuoteEditor'));
const Reports = lazy(() => import('@/pages/Reports'));
const Team = lazy(() => import('@/pages/Team'));
const Settings = lazy(() => import('@/pages/Settings'));

function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <LogoMark size={52} />
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Loader2 size={15} className="animate-spin text-gold-500" />
        Préparation de votre espace de travail…
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <BootScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<Dashboard />} />
        <Route path="taches" element={<Tasks />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="planning" element={<Planning />} />
        <Route
          path="devis"
          element={<RoleRoute roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><Quotes /></RoleRoute>}
        />
        <Route
          path="devis/nouveau"
          element={<RoleRoute roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><QuoteEditor /></RoleRoute>}
        />
        <Route
          path="devis/:id"
          element={<RoleRoute roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><QuoteEditor /></RoleRoute>}
        />
        <Route
          path="rapports"
          element={<RoleRoute roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><Reports /></RoleRoute>}
        />
        <Route
          path="equipe"
          element={<RoleRoute roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><Team /></RoleRoute>}
        />
        <Route path="parametres" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
