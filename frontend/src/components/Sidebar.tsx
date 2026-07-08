import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tasksApi } from '../api/tasks';
import { feedbackApi } from '../api/feedback';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', adminOnly: true },
  { path: '/chat', label: 'Chat AI', icon: '💬' },
  { path: '/documents', label: 'Tài liệu', icon: '📄' },
  { path: '/tasks', label: 'Công việc', icon: '✅', showBadge: true },
  { path: '/feedback', label: 'Feedback', icon: '💡', showFeedbackBadge: true },
  { path: '/users', label: 'Người dùng', icon: '👥', adminOnly: true },
  { path: '/settings', label: 'Cài đặt', icon: '⚙️' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { isAdmin } = useAuth();
  const [taskCount, setTaskCount] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);

  useEffect(() => {
    loadTaskCount();
    const interval = setInterval(loadTaskCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadFeedbackCount();
      const interval = setInterval(loadFeedbackCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  const loadTaskCount = async () => {
    try {
      const res = await tasksApi.getAll({ page: 1, page_size: 1, status: 'pending' });
      const res2 = await tasksApi.getAll({ page: 1, page_size: 1, status: 'in_progress' });
      setTaskCount(res.total + res2.total);
    } catch {
      // ignore
    }
  };

  const loadFeedbackCount = async () => {
    try {
      const res = await feedbackApi.getUnreadCount();
      setFeedbackCount(res.count);
    } catch {
      // ignore
    }
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col h-full transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 lg:w-64 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="VABot" className="w-10 h-10 rounded-xl object-cover" />
          <div>
            <h1 className="font-bold text-lg text-gray-900">VABot</h1>
            <p className="text-xs text-gray-500">Việt Anh School</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-2 text-gray-400 hover:text-gray-600 rounded-lg"
          aria-label="Đóng menu"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
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
              {item.showFeedbackBadge && isAdmin && feedbackCount > 0 && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {feedbackCount > 99 ? '99+' : feedbackCount}
                </span>
              )}
            </NavLink>
          ))}
      </nav>
    </aside>
  );
}
