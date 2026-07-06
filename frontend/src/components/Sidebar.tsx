import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tasksApi } from '../api/tasks';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', adminOnly: true },
  { path: '/chat', label: 'Chat AI', icon: '💬' },
  { path: '/documents', label: 'Tài liệu', icon: '📄' },
  { path: '/tasks', label: 'Công việc', icon: '✅', showBadge: true },
  { path: '/users', label: 'Người dùng', icon: '👥', adminOnly: true },
  { path: '/settings', label: 'Cài đặt', icon: '⚙️' },
];

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    loadTaskCount();
    const interval = setInterval(loadTaskCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadTaskCount = async () => {
    try {
      const res = await tasksApi.getAll({ page: 1, page_size: 1, status: 'pending' });
      const res2 = await tasksApi.getAll({ page: 1, page_size: 1, status: 'in_progress' });
      setTaskCount(res.total + res2.total);
    } catch {
      // ignore
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="VABot" className="w-10 h-10 rounded-xl object-cover" />
          <div>
            <h1 className="font-bold text-lg text-gray-900">VABot</h1>
            <p className="text-xs text-gray-500">Việt Anh School</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.showBadge && taskCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {taskCount > 99 ? '99+' : taskCount}
                </span>
              )}
            </NavLink>
          ))}
      </nav>
    </aside>
  );
}
