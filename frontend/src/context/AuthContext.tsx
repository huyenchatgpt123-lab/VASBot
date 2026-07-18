import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { User, UserPermissions } from '../types';
import { authApi } from '../api/auth';

const defaultPermissions: UserPermissions = {
  can_upload: false,
  can_manage_tasks: false,
  can_delete_documents: false,
  scope_all_departments: false,
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  permissions: UserPermissions;
  canUpload: boolean;
  canManageTasks: boolean;
  canDeleteDocuments: boolean;
  scopeAllDepartments: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi.getMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    sessionStorage.setItem('showTaskWelcome', '1');
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const permissions = useMemo(
    () => user?.permissions ?? defaultPermissions,
    [user],
  );

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAdmin,
        permissions,
        canUpload: isAdmin || permissions.can_upload,
        canManageTasks: isAdmin || permissions.can_manage_tasks,
        canDeleteDocuments: isAdmin || permissions.can_delete_documents,
        scopeAllDepartments: isAdmin || permissions.scope_all_departments,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
