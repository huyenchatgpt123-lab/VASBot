import { useState, useEffect, useRef } from 'react';
import { documentsApi, UploadMetadata, DuplicateUploadDetail } from '../api/documents';
import { useAuth } from '../context/AuthContext';
import { Document } from '../types';
import axios from 'axios';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function getSchoolYearOptions() {
  const currentYear = new Date().getFullYear();
  const options: string[] = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    options.push(`${y}-${y + 1}`);
  }
  return options;
}

function formatPlanEventAt(start: string | null | undefined, end?: string | null): string {
  if (!start) return '—';
  const startLabel = formatPlanEventAtSingle(start);
  if (!end) return startLabel;
  const endD = new Date(end);
  const startD = new Date(start);
  if (Number.isNaN(endD.getTime()) || Number.isNaN(startD.getTime())) return startLabel;
  if (endD.toDateString() === startD.toDateString()) return startLabel;
  return `${startLabel} → ${formatPlanEventAtSingle(end)}`;
}

function formatPlanEventAtSingle(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('vi-VN');
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
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
  const { canUpload, canDeleteDocuments, scopeAllDepartments, user, isAdmin } = useAuth();
  const [reExtractingId, setReExtractingId] = useState<number | null>(null);

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
  const [uploadCampusIds, setUploadCampusIds] = useState<number[]>([]);
  const [uploadIncludeCalendar, setUploadIncludeCalendar] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateUploadDetail | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [campuses, setCampuses] = useState<{ id: number; code: string; name: string }[]>([]);

  useEffect(() => {
    loadDocuments();
  }, [search, sortBy, order, page, filterDept, filterMonth, filterYear]);

  useEffect(() => {
    documentsApi.getDepartments().then((res) => setDepartments(res.departments)).catch(() => {});
    documentsApi.getCampuses().then((res) => setCampuses(res.campuses)).catch(() => {});
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
    setUploadCampusIds([]);
    setUploadIncludeCalendar(false);
    setDuplicateWarning(null);
    setShowUploadModal(true);
  };

  const canDeleteDoc = (doc: Document) => {
    if (!canDeleteDocuments) return false;
    if (scopeAllDepartments) return true;
    return doc.department === user?.department;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setDuplicateWarning(null);
    }
  };

  const handleUploadSubmit = async (force = false) => {
    if (!uploadFile || !uploadDept || !uploadMonth || !uploadYear || uploadCampusIds.length === 0) {
      alert('Vui lòng điền đầy đủ thông tin và chọn ít nhất một trường.');
      return;
    }

    const metadata: UploadMetadata = {
      department: uploadDept,
      month: parseInt(uploadMonth),
      school_year: uploadYear,
      campus_ids: uploadCampusIds,
      include_in_calendar: uploadIncludeCalendar,
      force,
    };

    setUploading(true);
    try {
      await documentsApi.upload(uploadFile, metadata);
      setDuplicateWarning(null);
      setShowUploadModal(false);
      await loadDocuments();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const detail = err.response.data?.detail;
        if (detail && typeof detail === 'object' && detail.code === 'duplicate_filename') {
          setDuplicateWarning(detail as DuplicateUploadDetail);
          return;
        }
      }
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

  const handleReExtract = async (id: number) => {
    if (!confirm('Trích xuất lại tiêu đề và ngày diễn ra kế hoạch từ file gốc?')) return;
    setReExtractingId(id);
    try {
      const result = await documentsApi.reExtractPlan(id);
      await loadDocuments();
      alert(result.message + (result.plan_event_at
        ? `\nNgày: ${formatPlanEventAt(result.plan_event_at, result.plan_event_end_at)}`
        : '\nKhông tìm thấy Thời gian:/Ngày: trong file.'));
    } catch {
      alert('Trích xuất lại thất bại.');
    } finally {
      setReExtractingId(null);
    }
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
                  <span className="col-span-2">Ngày diễn ra: {formatPlanEventAt(doc.plan_event_at, doc.plan_event_end_at)}</span>
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
                  {isAdmin && (
                    <button
                      onClick={() => handleReExtract(doc.id)}
                      disabled={reExtractingId === doc.id}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
                    >
                      {reExtractingId === doc.id ? 'Đang trích...' : 'Trích lại'}
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ngày diễn ra</th>
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
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatPlanEventAt(doc.plan_event_at, doc.plan_event_end_at)}
                    </td>
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
                      {isAdmin && (
                        <button
                          onClick={() => handleReExtract(doc.id)}
                          disabled={reExtractingId === doc.id}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
                          title="Trích xuất lại tiêu đề và ngày diễn ra"
                        >
                          {reExtractingId === doc.id ? '...' : 'Trích lại'}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 mx-auto min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload tài liệu</h2>

            <div className="space-y-4 min-w-0">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tổ / Bộ phận *</label>
                <select
                  value={uploadDept}
                  onChange={(e) => setUploadDept(e.target.value)}
                  disabled={!scopeAllDepartments}
                  className="w-full max-w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-100"
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
                  className="w-full max-w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
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
                  className="w-full max-w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">-- Chọn Năm học --</option>
                  {getSchoolYearOptions().map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Trường (địa điểm) *</label>
                <p className="text-xs text-gray-400 mb-2">Chọn một hoặc nhiều trường mà kế hoạch này áp dụng</p>
                <div className="flex flex-wrap gap-3">
                  {campuses.map((c) => (
                    <label key={c.id} className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={uploadCampusIds.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUploadCampusIds((prev) => [...prev, c.id]);
                          } else {
                            setUploadCampusIds((prev) => prev.filter((id) => id !== c.id));
                          }
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {c.code}
                    </label>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">Chọn file (PDF/DOCX) *</label>
                <label className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 cursor-pointer transition-colors">
                  {uploadFile ? 'Đổi file' : 'Chọn file'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileSelect}
                    className="sr-only"
                  />
                </label>
                {uploadFile ? (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 min-w-0">
                    <span className="shrink-0 text-sm leading-5" aria-hidden>📄</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 break-all line-clamp-2" title={uploadFile.name}>
                        {uploadFile.name}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {(uploadFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFile(null);
                        setDuplicateWarning(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="shrink-0 text-xs text-gray-400 hover:text-red-600 pt-0.5"
                      title="Bỏ chọn"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-2">Chưa chọn file</p>
                )}
              </div>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={uploadIncludeCalendar}
                  onChange={(e) => setUploadIncludeCalendar(e.target.checked)}
                  className="mt-0.5 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-800">Đưa vào Thời gian biểu</span>
                  <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Bật nếu đây là kế hoạch cần hiện trên lịch BGH. Nếu AI không tìm thấy ngày/giờ, Admin sẽ cần chỉnh sửa sau.
                  </span>
                </span>
              </label>

              {duplicateWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium text-amber-900">Đã có tài liệu cùng tên</p>
                  <p className="text-xs text-amber-800 break-words">{duplicateWarning.message}</p>
                  <p
                    className="text-xs text-amber-700 break-all line-clamp-3"
                    title={duplicateWarning.existing.plan_title || duplicateWarning.existing.filename}
                  >
                    Bản cũ: {duplicateWarning.existing.plan_title || duplicateWarning.existing.filename}
                    {duplicateWarning.existing.department ? ` · ${duplicateWarning.existing.department}` : ''}
                    {duplicateWarning.existing.created_at
                      ? ` · ${new Date(duplicateWarning.existing.created_at).toLocaleDateString('vi-VN')}`
                      : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDuplicateWarning(null)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-900 hover:bg-amber-100"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUploadSubmit(true)}
                      disabled={uploading}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {uploading ? 'Đang upload...' : 'Upload tiếp'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setDuplicateWarning(null);
                  setShowUploadModal(false);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={() => handleUploadSubmit(false)}
                disabled={uploading || !uploadFile || !uploadDept || !uploadMonth || !uploadYear || uploadCampusIds.length === 0}
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
