import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../api/admin';
import { User } from '../types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', nickname: '', email: '', password: '', role: 'user', department: '' });
  const [importResult, setImportResult] = useState<{ message: string; errors: string[] } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await adminApi.getUsers();
      setUsers(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ name: '', nickname: '', email: '', password: '', role: 'user', department: '' });
    setEditingUser(null);
    setShowForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createUser({
        name: form.name,
        nickname: form.nickname,
        email: form.email,
        password: form.password,
        role: form.role,
        department: form.department || undefined,
      });
      resetForm();
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Tạo người dùng thất bại.');
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      nickname: user.nickname || '',
      email: user.email,
      password: '',
      role: user.role,
      department: user.department || '',
    });
    setShowForm(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const data: Record<string, string | undefined> = {};
    if (form.name !== editingUser.name) data.name = form.name;
    if (form.email !== editingUser.email) data.email = form.email;
    if (form.password) data.password = form.password;
    if (form.role !== editingUser.role) data.role = form.role;
    if (form.nickname !== (editingUser.nickname || '')) data.nickname = form.nickname;

    if (form.department !== (editingUser.department || '')) data.department = form.department;

    if (!editingUser.nickname && !form.nickname.trim()) {
      alert('Vui lòng nhập biệt danh.');
      return;
    }

    try {
      await adminApi.updateUser(editingUser.id, data);
      resetForm();
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Cập nhật thất bại.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc muốn xóa người dùng này?')) return;
    try {
      await adminApi.deleteUser(id);
      loadUsers();
    } catch {
      alert('Xóa thất bại.');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await adminApi.importExcel(file);
      setImportResult(result);
      loadUsers();
    } catch {
      alert('Import thất bại.');
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Người dùng</h1>
          <p className="text-gray-500 mt-1">Quản lý tài khoản người dùng</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
          />
          <button
            onClick={() => excelInputRef.current?.click()}
            className="px-5 py-2.5 border border-primary-600 text-primary-600 rounded-lg font-medium hover:bg-primary-50 transition-colors"
          >
            Import Excel
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            + Thêm người dùng
          </button>
        </div>
      </div>

      {/* Import result notification */}
      {importResult && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800">{importResult.message}</p>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 text-xs text-green-700 space-y-1">
              {importResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
          <button onClick={() => setImportResult(null)} className="mt-2 text-xs text-green-600 hover:underline">
            Đóng
          </button>
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            {editingUser ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
          </h2>
          <form onSubmit={editingUser ? handleUpdate : handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              placeholder="Họ tên"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              required
            />
            <input
              placeholder="Biệt danh (VD: An Tin, Nguyệt K1)"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              required={!editingUser || !editingUser.nickname}
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              required
            />
            <input
              type="password"
              placeholder={editingUser ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              required={!editingUser}
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <input
              placeholder="Phòng ban"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700">
                {editingUser ? 'Cập nhật' : 'Tạo'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Excel format hint */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        File Excel cần có các cột theo thứ tự: <strong>Họ tên, Email, Mật khẩu, Vai trò (admin/user), Phòng ban, Biệt danh</strong>. Dòng đầu tiên là tiêu đề.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Đang tải...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Họ tên</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Biệt danh</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Vai trò</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Phòng ban</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {user.nickname ? (
                      user.nickname
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Chưa có biệt danh
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{user.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{user.department || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
