import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute, AdminRoute, ChangePasswordRoute, BghRoute, TasksRoute, HomeRedirect } from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DocumentsPage from './pages/DocumentsPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import TasksPage from './pages/TasksPage';
import BghCalendarPage from './pages/BghCalendarPage';
import FeedbackPage from './pages/FeedbackPage';
import SubstitutesPage from './pages/SubstitutesPage';
import TimetablePage from './pages/TimetablePage';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route
              path="/change-password"
              element={
                <ChangePasswordRoute>
                  <ChangePasswordPage required />
                </ChangePasswordRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/documents" element={<DocumentsPage />} />
              <Route
                path="/tasks"
                element={
                  <TasksRoute>
                    <TasksPage />
                  </TasksRoute>
                }
              />
              <Route path="/bgh-calendar" element={<BghCalendarPage />} />
              <Route path="/timetable" element={<TimetablePage />} />
              <Route
                path="/substitutes"
                element={
                  <BghRoute>
                    <SubstitutesPage />
                  </BghRoute>
                }
              />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/dashboard"
                element={
                  <AdminRoute>
                    <DashboardPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <AdminRoute>
                    <UsersPage />
                  </AdminRoute>
                }
              />
            </Route>
            <Route path="/chat" element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
