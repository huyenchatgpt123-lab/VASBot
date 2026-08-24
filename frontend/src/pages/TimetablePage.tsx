import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  substitutesApi,
  SubstituteAssignment,
  TeacherOption,
  TimetableSlot,
  TimetableImportResult,
} from '../api/substitutes';
import OperationProgressBar from '../components/OperationProgressBar';
import { useOperationProgress } from '../hooks/useOperationProgress';
import { useToast } from '../context/ToastContext';
import {
  periodHeader,
  periodSessionBorderClass,
  periodSessionLabelClass,
  periodSessionListClass,
  periodSessionRowClass,
} from '../utils/periodDisplay';

const DAYS = [
  { value: 2, label: 'Thứ 2' },
  { value: 3, label: 'Thứ 3' },
  { value: 4, label: 'Thứ 4' },
  { value: 5, label: 'Thứ 5' },
  { value: 6, label: 'Thứ 6' },
  { value: 7, label: 'Thứ 7' },
];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weekLabelOf(start: Date): string {
  const end = addDays(start, 5);
  return `${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
}

function formatAbsentForUser(
  name: string | null | undefined,
  department: string | null | undefined,
): string {
  if (!name) return '—';
  const base = `GV ${name}`;
  return department ? `${base} · ${department}` : base;
}

function formatCoverTeacher(
  name: string | null | undefined,
  department?: string | null,
): string {
  if (!name) return '—';
  const base = `GV ${name}`;
  return department ? `${base} · ${department}` : base;
}

function statusLabelVi(status: string): string {
  if (status === 'pending') return 'Chờ xác nhận';
  if (status === 'confirmed') return 'Đã xác nhận';
  if (status === 'rejected') return 'Từ chối';
  if (status === 'cancelled') return 'Đã hủy';
  return status;
}

export default function TimetablePage() {
  const { user, isAdmin, isBghOnly, homePath, canImportTimetable } = useAuth();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [subs, setSubs] = useState<SubstituteAssignment[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [teacherId, setTeacherId] = useState<number | ''>('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showMergeImport, setShowMergeImport] = useState(false);
  const [mergeOverwrite, setMergeOverwrite] = useState(false);
  const [importResult, setImportResult] = useState<TimetableImportResult | null>(null);
  const [lastImportedAt, setLastImportedAt] = useState<string | null>(null);
  const { progress, start, finish, fail } = useOperationProgress();

  const weekDates = useMemo(() => {
    return DAYS.map((d, i) => {
      const dt = addDays(weekStart, i);
      return { ...d, date: toISODate(dt), dateObj: dt };
    });
  }, [weekStart]);

  const fromDate = weekDates[0]?.date;
  const toDate = weekDates[5]?.date;

  const viewingTeacherId = isAdmin
    ? (teacherId || user?.id || null)
    : (user?.id ?? null);

  useEffect(() => {
    if (!isAdmin) return;
    substitutesApi.listTeachers()
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && user?.id && teacherId === '') {
      setTeacherId(user.id);
    }
  }, [isAdmin, user?.id, teacherId]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of teachers) {
      if (t.department) set.add(t.department);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    return teachers.filter((t) => {
      if (deptFilter && t.department !== deptFilter) return false;
      if (!q) return true;
      return `${t.name} ${t.teacher_code || ''} ${t.department || ''}`.toLowerCase().includes(q);
    });
  }, [teachers, teacherSearch, deptFilter]);

  // If current teacher falls outside the department filter, reset to self / first match
  useEffect(() => {
    if (!isAdmin || !deptFilter || !teacherId) return;
    const stillVisible = filteredTeachers.some((t) => t.id === teacherId)
      || (user?.id === teacherId);
    if (stillVisible) return;
    if (user?.id) setTeacherId(user.id);
    else if (filteredTeachers[0]) setTeacherId(filteredTeachers[0].id);
    else setTeacherId('');
  }, [isAdmin, deptFilter, teacherId, filteredTeachers, user?.id]);

  const openImport = () => {
    setImportResult(null);
    setShowImport(true);
  };

  const openMergeImport = () => {
    setImportResult(null);
    setMergeOverwrite(false);
    setShowMergeImport(true);
  };

  const formatImportTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    substitutesApi
      .getTimetableLastImport()
      .then((meta) => setLastImportedAt(meta.last_imported_at || null))
      .catch(() => setLastImportedAt(null));
  }, []);

  const load = useCallback(async () => {
    if (!viewingTeacherId || !fromDate || !toDate) return;
    setLoading(true);
    setError('');
    try {
      const subParams: {
        teacher_id?: number;
        from_date: string;
        to_date: string;
      } = {
        from_date: fromDate,
        to_date: toDate,
      };
      if (isAdmin && viewingTeacherId !== user?.id) {
        subParams.teacher_id = Number(viewingTeacherId);
      }
      const [tt, mine] = await Promise.all([
        substitutesApi.myTimetable(isAdmin ? Number(viewingTeacherId) : undefined),
        substitutesApi.mySubstitutes(subParams),
      ]);
      setSlots(tt);
      setSubs(mine.items || []);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Không tải được thời khóa biểu');
    } finally {
      setLoading(false);
    }
  }, [viewingTeacherId, isAdmin, user?.id, fromDate, toDate]);

  const handleImport = async (file: File) => {
    if (!confirm(
      `Import TKB từ "${file.name}"?\n\n`
      + `Hệ thống sẽ XÓA TOÀN BỘ thời khóa biểu hiện tại rồi import file mới.\n`
      + `Lịch dạy thay (từ hôm nay) chỉ bị HỦY nếu không còn khớp TKB mới; `
      + `lịch vẫn đúng sẽ được giữ và có thông báo khi hủy.\n\n`
      + `Giữ cột Mã GV và Cơ sở trên file. Ô trống: hệ thống lấy từ hồ sơ user `
      + `(khớp Mã GV hoặc họ tên đầy đủ). GV mới trên file: điền Mã GV hoặc để trống mã `
      + `(không kéo mã GV phía trên). Nên điền Mã GV nếu trùng tên.`,
    )) {
      return;
    }
    start('Đang import thời khóa biểu...');
    setImportResult(null);
    try {
      const result = await substitutesApi.importTimetable(file);
      setImportResult(result);
      if (result.last_imported_at) {
        setLastImportedAt(result.last_imported_at);
      } else {
        const meta = await substitutesApi.getTimetableLastImport().catch(() => null);
        if (meta?.last_imported_at) setLastImportedAt(meta.last_imported_at);
      }
      await finish();
      await load();
      if (result.errors?.length) {
        const n = result.errors.length + (result.errors_omitted || 0);
        toast.error(
          result.message || 'Import TKB hoàn tất có cảnh báo',
          `Có ${n} lỗi/cảnh báo — xem panel chi tiết bên dưới.`,
        );
      } else {
        toast.success(result.message || 'Import TKB thành công');
      }
    } catch (err: unknown) {
      fail();
      toast.apiError(err, 'Import TKB thất bại');
    }
  };

  const handleMergeImport = async (file: File) => {
    const modeLabel = mergeOverwrite
      ? 'GV đã có TKB sẽ bị GHI ĐÈ tiết cũ.'
      : 'GV đã có TKB sẽ được BỎ QUA.';
    if (!confirm(
      `Thêm TKB từ "${file.name}"?\n\n`
      + `Chỉ cập nhật giáo viên trong file — TKB của GV khác được giữ nguyên.\n`
      + `${modeLabel}\n`
      + `Trùng lớp với GV khác → báo lỗi, không ghi.\n`
      + `Lịch dạy thay chỉ hủy nếu tiết của GV trong file đổi/mất.`,
    )) {
      return;
    }
    start('Đang thêm thời khóa biểu...');
    setImportResult(null);
    try {
      const result = await substitutesApi.importTimetableMerge(file, mergeOverwrite);
      setImportResult(result);
      if (result.last_imported_at) {
        setLastImportedAt(result.last_imported_at);
      } else {
        const meta = await substitutesApi.getTimetableLastImport().catch(() => null);
        if (meta?.last_imported_at) setLastImportedAt(meta.last_imported_at);
      }
      await finish();
      await load();
      if (result.errors?.length) {
        const n = result.errors.length + (result.errors_omitted || 0);
        toast.error(
          result.message || 'Thêm TKB hoàn tất có cảnh báo',
          `Có ${n} lỗi/cảnh báo — xem panel chi tiết bên dưới.`,
        );
      } else {
        toast.success(result.message || 'Thêm TKB thành công');
      }
    } catch (err: unknown) {
      fail();
      toast.apiError(err, 'Thêm TKB thất bại');
    }
  };

  const copyImportErrors = async () => {
    if (!importResult) return;
    const lines: string[] = [importResult.message];
    if (importResult.campuses?.length) {
      lines.push(`Cơ sở: ${importResult.campuses.join(', ')}`);
    }
    if (importResult.teachers_unmatched.length) {
      lines.push('Chưa khớp:');
      lines.push(...importResult.teachers_unmatched.map((n) => `- ${n}`));
    }
    if (importResult.errors.length) {
      lines.push('Chi tiết lỗi:');
      lines.push(...importResult.errors.map((e, i) => `${i + 1}. ${e}`));
    }
    if (importResult.errors_truncated && importResult.errors_omitted) {
      lines.push(`… và ${importResult.errors_omitted} lỗi khác (đã cắt trên server).`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Đã sao chép lỗi vào clipboard');
    } catch {
      toast.error('Không sao chép được — hãy chọn và copy thủ công');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const slotMap = useMemo(() => {
    const map = new Map<string, TimetableSlot>();
    for (const s of slots) {
      map.set(`${s.day_of_week}-${s.period}`, s);
    }
    return map;
  }, [slots]);

  const viewingId = viewingTeacherId ? Number(viewingTeacherId) : null;

  /** Tiết tôi (hoặc GV đang xem) đi dạy thay người khác */
  const asSubstituteSubs = useMemo(
    () =>
      viewingId
        ? subs.filter((a) => a.substitute_teacher_id === viewingId)
        : [],
    [subs, viewingId],
  );

  /** Tiết tôi nghỉ — người khác dạy thay */
  const asAbsentSubs = useMemo(
    () =>
      viewingId
        ? subs.filter((a) => a.absent_teacher_id === viewingId)
        : [],
    [subs, viewingId],
  );

  const confirmedAsSub = useMemo(
    () => asSubstituteSubs.filter((a) => a.status === 'confirmed'),
    [asSubstituteSubs],
  );

  const subByDatePeriod = useMemo(() => {
    const map = new Map<string, SubstituteAssignment>();
    for (const a of confirmedAsSub) {
      if (a.date < (fromDate || '') || a.date > (toDate || '')) continue;
      map.set(`${a.date}-${a.period}`, a);
    }
    return map;
  }, [confirmedAsSub, fromDate, toDate]);

  /** Cover trên tiết của mình (pending + confirmed trong tuần) */
  const coverByDatePeriod = useMemo(() => {
    const map = new Map<string, SubstituteAssignment>();
    for (const a of asAbsentSubs) {
      if (a.status !== 'pending' && a.status !== 'confirmed') continue;
      if (a.date < (fromDate || '') || a.date > (toDate || '')) continue;
      map.set(`${a.date}-${a.period}`, a);
    }
    return map;
  }, [asAbsentSubs, fromDate, toDate]);

  const weekSubs = useMemo(
    () => confirmedAsSub.filter((a) => a.date >= (fromDate || '') && a.date <= (toDate || '')),
    [confirmedAsSub, fromDate, toDate],
  );

  // Badge xác nhận: chỉ pending khi tôi là GV dạy thay
  const pendingSubs = useMemo(
    () =>
      asSubstituteSubs.filter(
        (a) =>
          a.status === 'pending'
          && a.date >= (fromDate || '')
          && a.date <= (toDate || ''),
      ),
    [asSubstituteSubs, fromDate, toDate],
  );

  const myCoversThisWeek = useMemo(
    () =>
      asAbsentSubs.filter(
        (a) =>
          (a.status === 'pending' || a.status === 'confirmed')
          && a.date >= (fromDate || '')
          && a.date <= (toDate || ''),
      ),
    [asAbsentSubs, fromDate, toDate],
  );

  const canRespond = (item: SubstituteAssignment) => {
    if (item.status !== 'pending') return false;
    if (isAdmin) return true;
    return item.substitute_teacher_id === user?.id;
  };

  const handleConfirm = async (id: number) => {
    if (!confirm('Xác nhận nhận lịch dạy thay này?')) return;
    setActingId(id);
    try {
      await substitutesApi.confirmAssignment(id);
      await load();
      toast.success('Đã xác nhận lịch dạy thay');
    } catch (err: unknown) {
      toast.apiError(err, 'Không xác nhận được');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: number) => {
    const reason = window.prompt('Nhập lý do từ chối (bắt buộc):');
    if (reason === null) return;
    if (reason.trim().length < 3) {
      toast.error('Lý do từ chối cần ít nhất 3 ký tự');
      return;
    }
    setActingId(id);
    try {
      await substitutesApi.rejectAssignment(id, reason.trim());
      await load();
      toast.success('Đã từ chối lịch dạy thay');
    } catch (err: unknown) {
      toast.apiError(err, 'Không từ chối được');
    } finally {
      setActingId(null);
    }
  };

  if (isBghOnly) {
    return <Navigate to={homePath} replace />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thời khóa biểu</h1>
          <p className="text-sm text-gray-500 mt-1">
            Lịch dạy của {isAdmin && viewingTeacherId !== user?.id ? 'giáo viên đang chọn' : 'bạn'}
            {' — '}tiết dạy thay đã xác nhận hiện trên lưới; khi nghỉ sẽ thấy người dạy thay kèm trạng thái.
            {canImportTimetable ? ' Có thể tải mẫu / import TKB.' : ''}
          </p>
          <p className="text-xs text-gray-500 mt-1.5">
            Cập nhật TKB lần cuối:{' '}
            <span className="font-medium text-gray-700">
              {formatImportTime(lastImportedAt) || 'Chưa có'}
            </span>
          </p>
        </div>
        {canImportTimetable && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
            <a
              href="/mau_thoi_khoa_bieu_luoi.xlsx"
              download
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg text-sm font-medium text-center"
            >
              Tải mẫu
            </a>
            <button
              type="button"
              onClick={openImport}
              className="px-4 py-2 border border-primary-300 text-primary-700 bg-white hover:bg-primary-50 rounded-lg text-sm font-medium w-full sm:w-auto"
            >
              Import TKB
            </button>
            <button
              type="button"
              onClick={openMergeImport}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg text-sm font-medium w-full sm:w-auto"
            >
              Thêm TKB
            </button>
          </div>
        )}
      </div>

      {importResult && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-amber-950">{importResult.message}</p>
              {importResult.campuses?.length > 0 && (
                <p className="text-amber-800">
                  Cơ sở trong lần import: {importResult.campuses.join(', ')}
                </p>
              )}
              <p className="text-amber-800">
                Khớp {importResult.teachers_matched} GV
                {importResult.slots_created != null ? ` · ${importResult.slots_created} tiết mới` : ''}
                {importResult.errors?.length
                  ? ` · ${importResult.errors.length + (importResult.errors_omitted || 0)} lỗi/cảnh báo`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {(importResult.errors.length > 0 || importResult.teachers_unmatched.length > 0) && (
                <button
                  type="button"
                  onClick={copyImportErrors}
                  className="px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-900 bg-white hover:bg-amber-100 rounded-lg"
                >
                  Sao chép lỗi
                </button>
              )}
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>

          {importResult.teachers_unmatched.length > 0 && (
            <div>
              <p className="font-medium text-amber-900 mb-1">
                Chưa khớp ({importResult.teachers_unmatched.length})
              </p>
              <ul className="list-disc pl-5 max-h-28 overflow-y-auto text-amber-900 space-y-0.5">
                {importResult.teachers_unmatched.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div>
              <p className="font-medium text-amber-900 mb-1">
                Chi tiết lỗi ({importResult.errors.length}
                {importResult.errors_truncated && importResult.errors_omitted
                  ? ` / còn cắt ${importResult.errors_omitted}`
                  : ''}
                )
              </p>
              <ul className="list-disc pl-5 max-h-56 overflow-y-auto text-amber-900 space-y-0.5 border border-amber-100 rounded-md bg-white/60 px-3 py-2">
                {importResult.errors.map((e, i) => (
                  <li key={`${i}-${e.slice(0, 24)}`}>{e}</li>
                ))}
              </ul>
              {importResult.errors_truncated && !!importResult.errors_omitted && (
                <p className="mt-1 text-xs text-amber-700">
                  Server chỉ trả tối đa 200 lỗi; còn {importResult.errors_omitted} lỗi chưa hiện.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full sm:w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Tất cả tổ</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Tìm giáo viên..."
            value={teacherSearch}
            onChange={(e) => setTeacherSearch(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : '')}
            className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {user && (!deptFilter || !user.department || user.department === deptFilter) && (
              <option value={user.id}>{user.name} (Bạn)</option>
            )}
            {filteredTeachers
              .filter((t) => t.id !== user?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.department ? ` · ${t.department}` : ''}
                  {t.teacher_code ? ` · ${t.teacher_code}` : ''}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Chỉ hiện khi còn lịch chờ xác nhận — phía trên bộ lọc tuần */}
      {pendingSubs.length > 0 && (
        <div className="mb-4 border border-orange-200 bg-orange-50/40 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-orange-100 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-orange-950">
              Xác nhận lịch dạy thay (tuần đang xem)
            </h2>
            <span className="text-[11px] font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {pendingSubs.length}
            </span>
          </div>
          <ul className="divide-y divide-orange-100 bg-white">
            {pendingSubs.map((item) => (
              <li key={item.id} className="px-4 py-2.5 flex flex-col gap-2 text-sm">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                    {new Date(item.date + 'T00:00:00').toLocaleDateString('vi-VN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                  <span className="shrink-0 font-semibold text-primary-800">{item.period_label}</span>
                  <span className="min-w-0 break-words text-gray-900">
                    Lớp {item.class_name || '—'}
                    {item.campus_code ? ` · ${item.campus_code}` : ''}
                  </span>
                  <span className="text-xs text-gray-500 sm:ml-auto">
                    Thay {formatAbsentForUser(item.absent_teacher_name, item.absent_teacher_department)}
                  </span>
                </div>
                {canRespond(item) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actingId === item.id}
                      onClick={() => handleConfirm(item.id)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                    >
                      {actingId === item.id ? 'Đang xử lý...' : 'Xác nhận'}
                    </button>
                    <button
                      type="button"
                      disabled={actingId === item.id}
                      onClick={() => handleReject(item.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    >
                      Từ chối
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {myCoversThisWeek.length > 0 && (
        <div className="mb-4 border border-sky-200 bg-sky-50/40 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sky-100 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-sky-950">
              Người dạy thay khi bạn nghỉ (tuần đang xem)
            </h2>
            <span className="text-[11px] font-bold text-white bg-sky-600 px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {myCoversThisWeek.length}
            </span>
          </div>
          <ul className="divide-y divide-sky-100 bg-white">
            {myCoversThisWeek.map((item) => (
              <li key={item.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                  {new Date(item.date + 'T00:00:00').toLocaleDateString('vi-VN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
                <span className="shrink-0 font-semibold text-primary-800">{item.period_label}</span>
                <span className="min-w-0 break-words text-gray-900">
                  Lớp {item.class_name || '—'}
                  {item.campus_code ? ` · ${item.campus_code}` : ''}
                </span>
                <span className="text-xs text-sky-900 sm:ml-auto">
                  {formatCoverTeacher(item.substitute_teacher_name, item.substitute_teacher_department)}
                  {' · '}
                  <span className={item.status === 'confirmed' ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'}>
                    {statusLabelVi(item.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ← Tuần trước
        </button>
        <span className="text-sm font-medium text-gray-800 tabular-nums">{weekLabelOf(weekStart)}</span>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Tuần sau →
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(mondayOf(new Date()))}
          className="text-sm text-primary-700 hover:underline"
        >
          Tuần này
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Lưới TKB */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Thời khóa biểu tuần</h2>
          {weekSubs.length > 0 && (
            <span className="text-xs text-green-800 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
              {weekSubs.length} tiết đã xác nhận trong tuần
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Đang tải...</div>
        ) : (
          <>
            {slots.length === 0 && weekSubs.length === 0 && pendingSubs.length === 0 && myCoversThisWeek.length === 0 && (
              <div className="mb-3 border border-dashed border-gray-300 rounded-xl px-4 py-3 text-center text-sm text-gray-500">
                Chưa có thời khóa biểu cố định. Liên hệ BGH để import TKB hoặc kiểm tra mã GV trên tài khoản.
              </div>
            )}

            <div className="hidden md:block max-h-[min(70vh,720px)] overflow-auto border border-gray-200 rounded-xl overscroll-contain">
              <table className="min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-primary-700 text-white">
                    <th className="px-2 py-2 font-medium sticky top-0 left-0 z-30 bg-primary-700 shadow-[0_1px_0_0_rgba(0,0,0,0.08)]">
                      Tiết
                    </th>
                    {weekDates.map((d) => (
                      <th
                        key={d.value}
                        className="px-2 py-2 font-medium min-w-[110px] sticky top-0 z-20 bg-primary-700 shadow-[0_1px_0_0_rgba(0,0,0,0.08)]"
                      >
                        <span className="block">{d.label}</span>
                        <span className="block text-[11px] font-normal opacity-80">
                          {d.dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period) => (
                    <tr key={period} className={periodSessionRowClass(period)}>
                      <td
                        className={`px-2 py-2 text-center font-semibold sticky left-0 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.06)] ${periodSessionLabelClass(period)} ${periodSessionBorderClass(period)}`}
                      >
                        {periodHeader(period)}
                      </td>
                      {weekDates.map((d) => {
                        const slot = slotMap.get(`${d.value}-${period}`);
                        const sub = subByDatePeriod.get(`${d.date}-${period}`);
                        const cover = coverByDatePeriod.get(`${d.date}-${period}`);
                        const cellBase = `px-1 py-1 align-top ${periodSessionBorderClass(period)} ${periodSessionRowClass(period)}`;
                        if (sub) {
                          return (
                            <td key={d.value} className={cellBase}>
                              <div className="min-h-[52px] rounded-lg border border-green-300 bg-green-50 px-2 py-1.5">
                                <span className="block font-medium text-green-950 break-words">
                                  {sub.class_name || '—'}
                                </span>
                                <span className="block text-[10px] text-green-800 font-semibold">Dạy thay</span>
                                <span className="block text-[10px] text-gray-600 truncate">
                                  Thay {formatAbsentForUser(sub.absent_teacher_name, sub.absent_teacher_department)}
                                </span>
                              </div>
                            </td>
                          );
                        }
                        if (slot) {
                          const coverPending = cover?.status === 'pending';
                          return (
                            <td key={d.value} className={cellBase}>
                              <div
                                className={`min-h-[52px] rounded-lg border px-2 py-1.5 ${
                                  cover
                                    ? coverPending
                                      ? 'border-amber-300 bg-amber-50'
                                      : 'border-sky-300 bg-sky-50'
                                    : 'border-gray-100 bg-white/80'
                                }`}
                              >
                                <span className="block font-medium text-gray-900 break-words">
                                  {slot.class_name || '—'}
                                </span>
                                {slot.campus_code && (
                                  <span className="block text-[10px] text-gray-500">{slot.campus_code}</span>
                                )}
                                {cover && (
                                  <>
                                    <span className="block text-[10px] font-semibold text-sky-900 mt-0.5">
                                      Người dạy thay: {formatCoverTeacher(cover.substitute_teacher_name, cover.substitute_teacher_department)}
                                    </span>
                                    <span
                                      className={`block text-[10px] font-medium ${
                                        coverPending ? 'text-amber-800' : 'text-green-800'
                                      }`}
                                    >
                                      {statusLabelVi(cover.status)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={d.value} className={cellBase}>
                            <div className="min-h-[52px] rounded-lg bg-gray-50/40" />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: 1 vùng scroll, tiêu đề ngày sticky */}
            <div className="md:hidden max-h-[min(70vh,720px)] overflow-y-auto border border-gray-200 rounded-xl overscroll-contain bg-white">
              {weekDates.map((d) => {
                const daySlots = PERIODS.map((period) => ({
                  period,
                  slot: slotMap.get(`${d.value}-${period}`),
                  sub: subByDatePeriod.get(`${d.date}-${period}`),
                  cover: coverByDatePeriod.get(`${d.date}-${period}`),
                })).filter((x) => x.slot || x.sub);
                return (
                  <section key={d.value} className="border-b border-gray-100 last:border-b-0">
                    <div className="sticky top-0 z-10 px-3 py-2 bg-primary-700 text-white text-sm font-medium shadow-sm">
                      {d.label}{' '}
                      <span className="opacity-80 font-normal">
                        {d.dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                      </span>
                      {daySlots.length > 0 && (
                        <span className="ml-2 text-[11px] font-normal opacity-80">{daySlots.length} tiết</span>
                      )}
                    </div>
                    {daySlots.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-gray-400 italic">Không có tiết</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {daySlots.map(({ period, slot, sub, cover }, idx) => {
                          const prev = daySlots[idx - 1];
                          const sessionBreak = Boolean(prev && prev.period <= 5 && period >= 6);
                          const statusBg = sub
                            ? 'bg-green-50'
                            : cover
                              ? (cover.status === 'pending' ? 'bg-amber-50' : 'bg-sky-50')
                              : periodSessionListClass(period);
                          return (
                            <li
                              key={period}
                              className={`px-3 py-2 text-sm ${statusBg} ${
                                sessionBreak ? 'border-t-2 border-slate-300' : ''
                              }`}
                            >
                              <span className="font-semibold text-primary-800 mr-2">
                                {periodHeader(period)}
                              </span>
                              {sub ? (
                                <>
                                  <span className="font-medium text-green-950">{sub.class_name}</span>
                                  <span className="block text-xs text-green-800 mt-0.5">
                                    Dạy thay · Thay {formatAbsentForUser(sub.absent_teacher_name, sub.absent_teacher_department)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-gray-900">{slot?.class_name}</span>
                                  {cover && (
                                    <span className="block text-xs text-sky-900 mt-0.5">
                                      Người dạy thay: {formatCoverTeacher(cover.substitute_teacher_name, cover.substitute_teacher_department)}
                                      {' · '}
                                      <span className={cover.status === 'confirmed' ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'}>
                                        {statusLabelVi(cover.status)}
                                      </span>
                                    </span>
                                  )}
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Ô xanh = tiết bạn đi dạy thay (đã xác nhận). Ô xanh dương / vàng = tiết bạn nghỉ đã có người dạy thay
              (đã xác nhận / chờ xác nhận).
            </p>
          </>
        )}
      </div>

      {showImport && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Import TKB</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                File lưới: Mã GV, Cơ sở, Giáo viên, Buổi dạy, Thứ 2–6. Ô Mã GV / Cơ sở trống
                sẽ lấy từ hồ sơ user sau khi khớp.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Import sẽ <strong>xóa toàn bộ TKB cũ</strong> rồi ghi file mới.
                Lịch dạy thay từ hôm nay chỉ <strong>hủy khi không còn khớp</strong> TKB mới
                (có thông báo); lịch vẫn đúng được giữ.
                {' '}Ô trống: khớp GV theo mã hoặc họ tên đầy đủ, cơ sở lấy từ hồ sơ nếu thiếu trên file.
                Đổi tên GV mới mà mã trống: không kéo mã / cơ sở của GV phía trên.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={progress.visible}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = '';
                }}
                className="block w-full text-sm"
              />
              <OperationProgressBar visible={progress.visible} percent={progress.percent} label={progress.label} />
              {importResult && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">{importResult.message}</p>
                  {importResult.errors.length > 0 && (
                    <details open>
                      <summary className="text-amber-800 cursor-pointer">
                        {importResult.errors.length + (importResult.errors_omitted || 0)} cảnh báo
                        (xem thêm panel trên trang)
                      </summary>
                      <ul className="mt-1 list-disc pl-5 max-h-48 overflow-y-auto text-amber-800">
                        {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                      {importResult.errors_truncated && !!importResult.errors_omitted && (
                        <p className="mt-1 text-xs text-amber-700">
                          Còn {importResult.errors_omitted} lỗi đã cắt — xem panel trên trang.
                        </p>
                      )}
                    </details>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                disabled={progress.visible}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {showMergeImport && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Thêm TKB</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                File chỉ chứa các GV cần thêm/cập nhật. TKB của GV khác được giữ nguyên.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                Không xóa toàn bộ TKB. Trùng lớp với GV khác → <strong>báo lỗi</strong>.
                Lịch dạy thay chỉ hủy nếu tiết của GV trong file đổi/mất.
              </p>
              <fieldset className="text-sm space-y-2">
                <legend className="font-medium text-gray-800">Nếu GV trong file đã có TKB</legend>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeOverwrite"
                    checked={!mergeOverwrite}
                    onChange={() => setMergeOverwrite(false)}
                    disabled={progress.visible}
                    className="mt-0.5"
                  />
                  <span>Bỏ qua — giữ TKB cũ của GV đó</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeOverwrite"
                    checked={mergeOverwrite}
                    onChange={() => setMergeOverwrite(true)}
                    disabled={progress.visible}
                    className="mt-0.5"
                  />
                  <span>Ghi đè — xóa tiết cũ của đúng GV đó rồi ghi file mới</span>
                </label>
              </fieldset>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={progress.visible}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleMergeImport(f);
                  e.target.value = '';
                }}
                className="block w-full text-sm"
              />
              <OperationProgressBar visible={progress.visible} percent={progress.percent} label={progress.label} />
              {importResult && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">{importResult.message}</p>
                  {importResult.errors.length > 0 && (
                    <details open>
                      <summary className="text-amber-800 cursor-pointer">
                        {importResult.errors.length + (importResult.errors_omitted || 0)} cảnh báo
                        (xem thêm panel trên trang)
                      </summary>
                      <ul className="mt-1 list-disc pl-5 max-h-48 overflow-y-auto text-amber-800">
                        {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                      {importResult.errors_truncated && !!importResult.errors_omitted && (
                        <p className="mt-1 text-xs text-amber-700">
                          Còn {importResult.errors_omitted} lỗi đã cắt — xem panel trên trang.
                        </p>
                      )}
                    </details>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMergeImport(false)}
                disabled={progress.visible}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
