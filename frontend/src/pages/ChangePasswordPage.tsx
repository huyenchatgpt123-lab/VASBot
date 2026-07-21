import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PasswordInput({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2.5 pr-11 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          minLength={8}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 font-medium"
        >
          {show ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
    </div>
  );
}

interface ChangePasswordPageProps {
  required?: boolean;
}

export default function ChangePasswordPage({ required = false }: ChangePasswordPageProps) {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isRequired = required || user?.must_change_password;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
        current_password: isRequired ? undefined : currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      navigate('/tasks');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof message === 'string' ? message : 'Không thể đổi mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="relative w-full max-w-[420px]">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="VATask" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg object-cover" />
          <h1 className="text-xl font-bold text-gray-900">
            {isRequired ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}
          </h1>
          {isRequired && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
              Đây là lần đăng nhập đầu tiên. Vui lòng đặt mật khẩu mới để tiếp tục sử dụng hệ thống.
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isRequired && (
              <PasswordInput
                id="current-password"
                label="Mật khẩu hiện tại"
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggleShow={() => setShowCurrent((v) => !v)}
                autoComplete="current-password"
              />
            )}
            <PasswordInput
              id="new-password"
              label="Mật khẩu mới"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              placeholder="Tối thiểu 8 ký tự"
              autoComplete="new-password"
            />
            <PasswordInput
              id="confirm-password"
              label="Xác nhận mật khẩu mới"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
            />

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Đang lưu...' : 'Lưu mật khẩu'}
            </button>

            {isRequired && (
              <button
                type="button"
                onClick={() => { logout(); navigate('/login'); }}
                className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Đăng xuất
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
