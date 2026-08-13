import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import TaskWelcomeModal from './TaskWelcomeModal';
import { useAuth } from '../context/AuthContext';
import { tasksApi } from '../api/tasks';
import { ensureServiceWorker } from '../utils/webPush';

export default function Layout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isBghOnly } = useAuth();
  const [showTaskWelcome, setShowTaskWelcome] = useState(false);
  const [incompleteTaskCount, setIncompleteTaskCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    void ensureServiceWorker();
  }, [user]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const path = event.data?.path;
      if (event.data?.type === 'vatask-navigate' && typeof path === 'string') {
        navigate(path);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    if (!user || isBghOnly) return;
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
  }, [user, isBghOnly]);

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
