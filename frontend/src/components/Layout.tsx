import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import TaskWelcomeModal from './TaskWelcomeModal';
import { useAuth } from '../context/AuthContext';
import { tasksApi } from '../api/tasks';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const [showTaskWelcome, setShowTaskWelcome] = useState(false);
  const [incompleteTaskCount, setIncompleteTaskCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (sessionStorage.getItem('showTaskWelcome') !== '1') return;

    const loadTaskCount = async () => {
      try {
        const [pending, inProgress] = await Promise.all([
          tasksApi.getAll({ page: 1, page_size: 1, status: 'pending' }),
          tasksApi.getAll({ page: 1, page_size: 1, status: 'in_progress' }),
        ]);
        setIncompleteTaskCount(pending.total + inProgress.total);
        setShowTaskWelcome(true);
      } catch {
        sessionStorage.removeItem('showTaskWelcome');
      }
    };

    loadTaskCount();
  }, [user]);

  const dismissTaskWelcome = () => {
    setShowTaskWelcome(false);
    sessionStorage.removeItem('showTaskWelcome');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {showTaskWelcome && user && (
        <TaskWelcomeModal
          userName={user.name}
          taskCount={incompleteTaskCount}
          onClose={dismissTaskWelcome}
        />
      )}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
