import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;

  return <>{children}</>;
}

export function ChangePasswordRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, homePath } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_change_password) return <Navigate to={homePath} replace />;

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, homePath } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (!isAdmin) return <Navigate to={homePath} replace />;

  return <>{children}</>;
}

export function BghRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, scopeAllDepartments, homePath } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (!scopeAllDepartments) return <Navigate to={homePath} replace />;

  return <>{children}</>;
}

/** BGH không dùng module Công việc */
export function TasksRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isBghOnly } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (isBghOnly) return <Navigate to="/bgh-calendar" replace />;

  return <>{children}</>;
}

export function HomeRedirect() {
  const { loading, user, homePath } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePath} replace />;
}
