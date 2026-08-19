import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tasksApi } from '../api/tasks';
import { feedbackApi } from '../api/feedback';
import { substitutesApi } from '../api/substitutes';

type NavItem = {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  substitutesOnly?: boolean;
  hideForBgh?: boolean;
  showBadge?: boolean;
  showSubBadge?: boolean;
  showFeedbackBadge?: boolean;
  /** Chỉ hiện khi có TKB hoặc dạy thay (user thường). Admin luôn thấy. */
  requiresTimetableAccess?: boolean;
};

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', adminOnly: true },
  { path: '/bgh-calendar', label: 'Lịch hoạt động', icon: '🗓️' },
  { path: '/timetable', label: 'Thời khóa biểu', icon: '📋', hideForBgh: true, requiresTimetableAccess: true, showSubBadge: true },
  { path: '/substitutes', label: 'Dạy thay', icon: '🔄', substitutesOnly: true },
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
  const { isAdmin, canViewSubstitutesBoard, canImportTimetable, isBghOnly, homePath } = useAuth();
  const location = useLocation();
  const [taskCount, setTaskCount] = useState(0);
  const [subCount, setSubCount] = useState(0);
  const [hasTimetableAccess, setHasTimetableAccess] = useState(false);
  const [feedbackCount, setFeedbackCount] = useState(0);

  const goHome = () => {
    onClose();
    if (location.pathname === homePath) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isBghOnly) {
      setTaskCount(0);
      setSubCount(0);
      setHasTimetableAccess(false);
      return;
    }
    loadTaskCount();
    loadTimetableNav();
    const interval = setInterval(() => {
      loadTaskCount();
      loadTimetableNav();
    }, 30000);
    return () => clearInterval(interval);
  }, [isBghOnly, isAdmin]);

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

  const loadTimetableNav = async () => {
    if (isAdmin) {
      setHasTimetableAccess(true);
      try {
        const count = await substitutesApi.mySubstitutesCount();
        setSubCount(count);
      } catch {
        setSubCount(0);
      }
      return;
    }
    try {
      const summary = await substitutesApi.myTimetableSummary();
      setSubCount(summary.substitute_count);
      setHasTimetableAccess(
        summary.has_timetable
        || summary.substitute_count > 0
        || summary.has_upcoming_substitutes,
      );
    } catch {
      setSubCount(0);
      setHasTimetableAccess(false);
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
      className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200/80 flex flex-col h-full transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 lg:w-64 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
        <Link
          to={homePath}
          onClick={goHome}
          className="flex items-center gap-3 min-w-0 rounded-lg hover:bg-gray-50 transition-colors -ml-1 px-1 py-0.5"
          aria-label="Về trang chủ"
        >
          <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          <div className="min-w-0 text-left">
            <h1 className="font-semibold text-base text-gray-900 tracking-tight">VATask</h1>
            <p className="text-[11px] text-gray-500 truncate">Việt Anh School</p>
          </div>
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
          aria-label="Đóng menu"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems
          .filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.substitutesOnly && !canViewSubstitutesBoard) return false;
            if (item.hideForBgh && isBghOnly) return false;
            if (item.path === '/tasks' && isBghOnly) return false;
            if (item.requiresTimetableAccess && !isAdmin && !canImportTimetable && !hasTimetableAccess) return false;
            return true;
          })
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base w-6 text-center shrink-0" aria-hidden>
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.showSubBadge && subCount > 0 && (
                <span
                  className="bg-amber-500 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-md min-w-[1.25rem] text-center"
                  title="Tiết dạy thay"
                >
                  {subCount > 99 ? '99+' : subCount}
                </span>
              )}
              {item.showBadge && taskCount > 0 && (
                <span className="bg-red-500 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-md min-w-[1.25rem] text-center">
                  {taskCount > 99 ? '99+' : taskCount}
                </span>
              )}
              {item.showFeedbackBadge && isAdmin && feedbackCount > 0 && (
                <span className="bg-orange-500 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-md min-w-[1.25rem] text-center">
                  {feedbackCount > 99 ? '99+' : feedbackCount}
                </span>
              )}
            </NavLink>
          ))}
      </nav>
    </aside>
  );
}
