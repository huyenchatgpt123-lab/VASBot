import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="VATask" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg object-cover" />
          <h1 className="text-3xl font-bold text-gray-900">VATask</h1>
          <p className="text-gray-500 mt-2">Việt Anh School</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quên mật khẩu</h2>

          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Nếu bạn quên mật khẩu, vui lòng liên hệ{' '}
              <span className="font-medium text-gray-800">Admin hệ thống</span> để được cấp lại.
            </p>

            <div className="p-4 bg-primary-50 border border-primary-100 rounded-lg">
              <p className="font-medium text-gray-800 mb-2">Khi liên hệ Admin, hãy cung cấp:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>Email đăng nhập VATask</li>
                <li>Họ và tên</li>
                <li>Tổ / bộ môn (nếu có)</li>
              </ul>
            </div>

            <p className="text-gray-500">
              Chưa có tài khoản? Liên hệ Admin để được cấp tài khoản, không tự đăng ký trên hệ thống.
            </p>
          </div>

          <Link
            to="/login"
            className="mt-6 block w-full py-2.5 text-center bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
