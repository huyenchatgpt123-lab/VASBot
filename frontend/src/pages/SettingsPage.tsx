import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PasswordField from '../components/PasswordField';
import { notificationsApi } from '../api/notifications';
import {
  disableWebPush,
  enableWebPush,
  getPushPermissionState,
  hasActivePushSubscription,
  isWebPushSupported,
} from '../utils/webPush';

export default function SettingsPage() {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [pushServerEnabled, setPushServerEnabled] = useState(false);
  const [pushActive, setPushActive] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushSupported] = useState(() => isWebPushSupported());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await notificationsApi.pushConfig();
        if (!cancelled) setPushServerEnabled(!!cfg.enabled);
      } catch {
        if (!cancelled) setPushServerEnabled(false);
      }
      const active = await hasActivePushSubscription();
      const perm = await getPushPermissionState();
      if (!cancelled) {
        setPushActive(active && perm === 'granted');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      const res = await enableWebPush();
      setPushMessage(res.message);
      setPushActive(res.ok);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPushMessage(typeof detail === 'string' ? detail : 'Không thể bật thông báo đẩy');
      setPushActive(false);
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      const res = await disableWebPush();
      setPushMessage(res.message);
      setPushActive(false);
    } catch {
      setPushMessage('Không thể tắt thông báo đẩy');
    } finally {
      setPushBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Đã đổi mật khẩu thành công');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof message === 'string' ? message : 'Không thể đổi mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
        <p className="text-gray-500 mt-1">Thông tin tài khoản</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm max-w-lg w-full mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-2xl">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{user?.name}</h2>
            <p className="text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Họ tên</label>
            <p className="text-gray-900 mt-1">{user?.name || 'Không có'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-gray-900 mt-1 break-all">{user?.email || 'Không có'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Phòng ban</label>
            <p className="text-gray-900 mt-1">{user?.department?.trim() || 'Không có'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Cơ sở</label>
            <p className="text-gray-900 mt-1">{user?.campus_name?.trim() || 'Không có'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm max-w-lg w-full mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Thông báo trên thiết bị</h2>
        <p className="text-sm text-gray-500 mb-4">
          Nhận banner khi có thông báo VATask (dạy thay, công việc…), kể cả khi đang đóng app.
          Trên iPhone: Thêm vào Màn hình chính, mở từ icon, rồi bật tại đây.
        </p>
        {!pushSupported && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3">
            Trình duyệt hiện tại không hỗ trợ Web Push. Dùng Chrome/Safari (PWA) và shortcut màn hình chính.
          </p>
        )}
        {!pushServerEnabled && (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3">
            Máy chủ chưa bật Web Push (`PUSH_ENABLED` + VAPID). Chuông và email vẫn hoạt động bình thường.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {pushActive ? (
            <button
              type="button"
              disabled={pushBusy || !pushSupported}
              onClick={() => void handleDisablePush()}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {pushBusy ? 'Đang tắt...' : 'Tắt thông báo thiết bị'}
            </button>
          ) : (
            <button
              type="button"
              disabled={pushBusy || !pushSupported || !pushServerEnabled}
              onClick={() => void handleEnablePush()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {pushBusy ? 'Đang bật...' : 'Bật thông báo thiết bị'}
            </button>
          )}
          <span className={`text-sm ${pushActive ? 'text-green-700' : 'text-gray-500'}`}>
            {pushActive ? 'Đang bật trên thiết bị này' : 'Chưa bật'}
          </span>
        </div>
        {pushMessage && (
          <p className="mt-3 text-sm text-gray-700">{pushMessage}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm max-w-lg w-full">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Đổi mật khẩu</h2>
        <p className="text-sm text-gray-500 mb-4">Mật khẩu mới phải có ít nhất 8 ký tự</p>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <PasswordField
            id="settings-current-password"
            label="Mật khẩu hiện tại"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
            autoComplete="current-password"
          />
          <PasswordField
            id="settings-new-password"
            label="Mật khẩu mới"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            placeholder="Tối thiểu 8 ký tự"
            autoComplete="new-password"
            minLength={8}
          />
          <PasswordField
            id="settings-confirm-password"
            label="Xác nhận mật khẩu mới"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((v) => !v)}
            autoComplete="new-password"
            minLength={8}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-700">{success}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
          </button>
        </form>
      </div>
    </div>
  );
}
