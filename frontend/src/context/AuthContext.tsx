import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { User, UserPermissions } from '../types';
import { authApi } from '../api/auth';

const defaultPermissions: UserPermissions = {
  can_upload: false,
  can_manage_tasks: false,
  can_delete_documents: false,
  scope_all_departments: false,
  can_access_substitutes: false,
  can_manage_calendar: false,
  can_import_timetable: false,
  bgh_workspace: false,
};

interface ChangePasswordPayload {
  current_password?: string;
  new_password: string;
  confirm_password: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  changePassword: (data: ChangePasswordPayload) => Promise<User>;
  logout: () => void;
  isAdmin: boolean;
  /** Hồ sơ BGH: ẩn TKB + Công việc, home = Lịch hoạt động */
  isBghOnly: boolean;
  homePath: string;
  permissions: UserPermissions;
  canUpload: boolean;
  canManageTasks: boolean;
  canDeleteDocuments: boolean;
  scopeAllDepartments: boolean;
  canAccessSubstitutes: boolean;
  /** Tổ trưởng: xem board dạy thay read-only theo tổ */
  canViewSubstitutesBoard: boolean;
  isTeamLead: boolean;
  canManageCalendar: boolean;
  canImportTimetable: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi.getMe()
        .then((me) => {
          setUser(me);
          localStorage.setItem('user', JSON.stringify(me));
        })
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
    if (!data.user.must_change_password) {
      sessionStorage.setItem('showTaskWelcome', '1');
    }
    setUser(data.user);
    return data.user;
  };

  const changePassword = async (payload: ChangePasswordPayload) => {
    const updated = await authApi.changePassword(payload);
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
    if (!updated.must_change_password) {
      sessionStorage.setItem('showTaskWelcome', '1');
    }
    return updated;
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
  const scopeAllDepartments = isAdmin || permissions.scope_all_departments;
  const canManageTasks = isAdmin || permissions.can_manage_tasks;
  const canAccessSubstitutes = isAdmin || permissions.can_access_substitutes;
  const isTeamLead = Boolean(
    user && !isAdmin && canManageTasks && !scopeAllDepartments && user.department,
  );
  const canViewSubstitutesBoard = canAccessSubstitutes || isTeamLead;
  const isBghOnly = Boolean(user && !isAdmin && permissions.bgh_workspace);
  const homePath = isBghOnly ? '/bgh-calendar' : '/tasks';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        changePassword,
        logout,
        isAdmin,
        isBghOnly,
        homePath,
        permissions,
        canUpload: isAdmin || permissions.can_upload,
        canManageTasks,
        canDeleteDocuments: isAdmin || permissions.can_delete_documents,
        scopeAllDepartments,
        canAccessSubstitutes,
        canViewSubstitutesBoard,
        isTeamLead,
        canManageCalendar: isAdmin || permissions.can_manage_calendar,
        canImportTimetable: isAdmin || permissions.can_import_timetable,
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
