import { useState, useEffect, useRef } from 'react';
import { documentsApi, UploadMetadata } from '../api/documents';
import { useAuth } from '../context/AuthContext';
import { Document } from '../types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function getSchoolYearOptions() {
  const currentYear = new Date().getFullYear();
  const options: string[] = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    options.push(`${y}-${y + 1}`);
  }
  return options;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { canUpload, canDeleteDocuments, scopeAllDepartments, user } = useAuth();

  // Filters
  const [filterDept, setFilterDept] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDept, setUploadDept] = useState('');
  const [uploadMonth, setUploadMonth] = useState('');
  const [uploadYear, setUploadYear] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    loadDocuments();
  }, [search, sortBy, order, page, filterDept, filterMonth, filterYear]);

  useEffect(() => {
    documentsApi.getDepartments().then((res) => setDepartments(res.departments)).catch(() => {});
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await documentsApi.getAll({
        search: search || undefined,
        department: filterDept || undefined,
        month: filterMonth ? parseInt(filterMonth) : undefined,
        school_year: filterYear || undefined,
        sort_by: sortBy,
        order,
        page,
        page_size: pageSize,
      });
      setDocuments(data.documents);
      setTotal(data.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const openUploadModal = () => {
    setUploadFile(null);
    setUploadDept(scopeAllDepartments ? '' : (user?.department || ''));
    setUploadMonth('');
    setUploadYear('');
    setShowUploadModal(true);
  };

  const canDeleteDoc = (doc: Document) => {
    if (!canDeleteDocuments) return false;
    if (scopeAllDepartments) return true;
    return doc.department === user?.department;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadFile(file);
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile || !uploadDept || !uploadMonth || !uploadYear) {
      alert('Vui lòng điền đầy đủ thông tin.');
      return;
    }

    const metadata: UploadMetadata = {
      department: uploadDept,
      month: parseInt(uploadMonth),
      school_year: uploadYear,
    };

    setUploading(true);
    try {
      await documentsApi.upload(uploadFile, metadata);
      setShowUploadModal(false);
      await loadDocuments();
    } catch {
      alert('Upload thất bại. Vui lòng thử lại.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc muốn xóa tài liệu này?')) return;
    try {
      await documentsApi.delete(id);
      await loadDocuments();
    } catch {
      alert('Xóa thất bại.');
    }
  };

  const handlePreview = (id: number) => {
    const url = documentsApi.getPreviewUrl(id);
    window.open(url, '_blank');
  };

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setOrder('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="ml-1">{order === 'asc' ? '↑' : '↓'}</span>;
  };

  const clearFilters = () => {
    setFilterDept('');
    setFilterMonth('');
    setFilterYear('');
    setSearch('');
    setPage(1);
  };

  const hasFilters = filterDept || filterMonth || filterYear || search;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tài liệu</h1>
          <p className="text-gray-500 mt-1">Quản lý tài liệu nội bộ ({total} tài liệu)</p>
        </div>
        {canUpload && (
          <button
            onClick={openUploadModal}
            disabled={uploading}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 w-full sm:w-auto"
          >
            {uploading ? 'Đang upload...' : '+ Upload tài liệu'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm kiếm theo tên..."
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none w-full sm:w-56"
        />
        <select
          value={filterDept}
          onChange={(e) => { setFilterDept(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">Tất cả Tổ</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={filterMonth}
          onChange={(e) => { setFilterMonth(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">Tất cả Tháng</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>Tháng {m}</option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={(e) => { setFilterYear(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">Tất cả Năm học</option>
          {getSchoolYearOptions().map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Đang tải...</div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              {hasFilters ? 'Không tìm thấy tài liệu phù hợp.' : 'Chưa có tài liệu nào.'}
            </p>
            {canUpload && !hasFilters && (
              <p className="text-sm text-gray-400 mt-2">Upload PDF hoặc Word để bắt đầu.</p>
            )}
          </div>
        ) : (
          <>
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200">
            {documents.map((doc) => (
              <div key={doc.id} className="p-4">
                <p className="text-sm font-medium text-gray-900 break-words mb-2">{doc.filename}</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-500 mb-3">
                  <span>Tổ: {doc.department || '—'}</span>
                  <span>Tháng: {doc.month || '—'}</span>
                  <span>Năm học: {doc.school_year || '—'}</span>
                  <span>Trang: {doc.page_count}</span>
                  <span className="col-span-2">
                    {new Date(doc.created_at).toLocaleDateString('vi-VN')} · {doc.uploader_name || '—'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => handlePreview(doc.id)}
                    title="Xem"
                    className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    👁
                  </button>
                  {canDeleteDoc(doc) && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Xóa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('filename')}
                  >
                    Tên tài liệu <SortIcon field="filename" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tổ</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tháng</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Năm học</th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('created_at')}
                  >
                    Ngày upload <SortIcon field="created_at" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Người upload</th>
                  <th
                    className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('page_count')}
                  >
                    Trang <SortIcon field="page_count" />
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">{doc.filename}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{doc.department || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{doc.month || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{doc.school_year || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{doc.uploader_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{doc.page_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handlePreview(doc.id)}
                        title="Xem"
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        👁
                      </button>
                      {canDeleteDoc(doc) && (
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Xóa
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Trang {page} / {totalPages} ({total} tài liệu)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Trước
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4 sm:p-6 mx-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload tài liệu</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tổ / Bộ phận *</label>
                <select
                  value={uploadDept}
                  onChange={(e) => setUploadDept(e.target.value)}
                  disabled={!scopeAllDepartments}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-100"
                >
                  <option value="">-- Chọn Tổ --</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tháng *</label>
                <select
                  value={uploadMonth}
                  onChange={(e) => setUploadMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">-- Chọn Tháng --</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Năm học *</label>
                <select
                  value={uploadYear}
                  onChange={(e) => setUploadYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">-- Chọn Năm học --</option>
                  {getSchoolYearOptions().map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chọn file (PDF/DOCX) *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileSelect}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                {uploadFile && (
                  <p className="text-xs text-gray-500 mt-1">Đã chọn: {uploadFile.name}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleUploadSubmit}
                disabled={uploading || !uploadFile || !uploadDept || !uploadMonth || !uploadYear}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Đang upload...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
