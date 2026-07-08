import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
        <p className="text-gray-500 mt-1">Thông tin tài khoản</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm max-w-lg w-full">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-2xl">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{user?.name}</h2>
            <p className="text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Họ tên</label>
            <p className="text-gray-900 mt-1">{user?.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-gray-900 mt-1">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Vai trò</label>
            <p className="text-gray-900 mt-1 capitalize">{user?.role}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Ngày tạo</label>
            <p className="text-gray-900 mt-1">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('vi-VN')
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
