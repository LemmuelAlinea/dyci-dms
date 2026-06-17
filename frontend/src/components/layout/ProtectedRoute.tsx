import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { FullPageLoader } from '@/components/ui/Spinner';

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (adminOnly && !profile?.is_system_admin) return <Navigate to="/app/drive" replace />;
  return <Outlet />;
}
