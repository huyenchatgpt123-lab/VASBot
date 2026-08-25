import { useCallback, useEffect, useMemo, useState } from 'react';
import { documentsApi } from '../api/documents';
import { useAuth } from '../context/AuthContext';
import {
  substitutesApi,
  SubstituteAssignment,
  TeacherOption,
  AbsentPeriodItem,
  SuggestTeacherItem,
  TimetableSlot,
} from '../api/substitutes';
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

function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  if (detail && typeof detail === 'object') {
    try {
      return JSON.stringify(detail);
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

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

type RowPick = AbsentPeriodItem & {
  key: string;
  selected: boolean;
  substitute_teacher_id: number | null;
  substitute_teacher_name: string | null;
};

function formatGvName(name: string | null | undefined): string {
  if (!name) return '—';
  return `GV ${name}`;
}

export default function SubstitutesPage() {
  const { user, canAccessSubstitutes, isTeamLead } = useAuth();
  const readOnly = isTeamLead && !canAccessSubstitutes;
  const [campuses, setCampuses] = useState<{ id: number; code: string; name: string }[]>([]);
  const [campusId, setCampusId] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'confirmed' | 'rejected'>('');
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [assignments, setAssignments] = useState<SubstituteAssignment[]>([]);
  const [cellOverflow, setCellOverflow] = useState<{
    label: string;
    items: SubstituteAssignment[];
  } | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create substitute
  const [showCreate, setShowCreate] = useState(false);
  const [absentId, setAbsentId] = useState<number | ''>('');
  const [createWeekStart, setCreateWeekStart] = useState(() => mondayOf(new Date()));
  const [teacherSlots, setTeacherSlots] = useState<TimetableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [metaByDate, setMetaByDate] = useState<Map<string, AbsentPeriodItem>>(new Map());
  const [rows, setRows] = useState<RowPick[]>([]);
  const [pickRow, setPickRow] = useState<RowPick | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestTeacherItem[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<SubstituteAssignment | null>(null);
  const [reassignDetail, setReassignDetail] = useState<SubstituteAssignment | null>(null);
  const [reassignDraft, setReassignDraft] = useState<{ id: number; name: string } | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [createDeptFilter, setCreateDeptFilter] = useState('');
  const [createNameSearch, setCreateNameSearch] = useState('');
  const [showSelectedSummary, setShowSelectedSummary] = useState(false);
  const [pickSearch, setPickSearch] = useState('');

  const weekDates = useMemo(() => {
    return DAYS.map((d, i) => {
      const dt = addDays(weekStart, i);
      return { ...d, date: toISODate(dt), dateObj: dt };
    });
  }, [weekStart]);

  const createWeekDates = useMemo(() => {
    return DAYS.map((d, i) => {
      const dt = addDays(createWeekStart, i);
      return { ...d, date: toISODate(dt), dateObj: dt };
    });
  }, [createWeekStart]);

  const fromDate = weekDates[0]?.date;
  const toDate = weekDates[5]?.date;

  useEffect(() => {
    documentsApi.getCampuses().then((res) => {
      setCampuses(res.campuses);
    }).catch(() => {});
  }, []);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of teachers) {
      if (t.department) set.add(t.department);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const q = createNameSearch.trim().toLowerCase();
    return teachers.filter((t) => {
      if (createDeptFilter && t.department !== createDeptFilter) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.teacher_code || ''} ${t.department || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [teachers, createDeptFilter, createNameSearch]);

  const loadBoard = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError('');
    try {
      const [list, t] = await Promise.all([
        substitutesApi.listAssignments({
          from_date: fromDate,
          to_date: toDate,
          campus_id: campusId ? Number(campusId) : undefined,
        }),
        substitutesApi.listTeachers(campusId ? Number(campusId) : undefined),
      ]);
      setAssignments(list);
      setTeachers(t);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Không tải được lịch dạy thay'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, campusId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const cellMap = useMemo(() => {
    const map = new Map<string, SubstituteAssignment[]>();
    for (const a of assignments) {
      if (statusFilter && a.status !== statusFilter) continue;
      const key = `${a.date}-${a.period}`;
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [assignments, statusFilter]);

  const boardAssignments = useMemo(
    () => (statusFilter ? assignments.filter((a) => a.status === statusFilter) : assignments),
    [assignments, statusFilter],
  );

  const CELL_PREVIEW = 3;

  const openAssignmentDetail = (a: SubstituteAssignment) => {
    setReassignDraft(null);
    setCellOverflow(null);
    setDetail(a);
  };

  const boardStatusClass = (status: string) => {
    if (status === 'pending') return 'border-l-orange-400 border-orange-200 bg-orange-50/90 hover:bg-orange-100';
    if (status === 'confirmed') return 'border-l-green-500 border-green-200 bg-green-50/90 hover:bg-green-100';
    if (status === 'rejected') return 'border-l-red-400 border-red-200 bg-red-50/90 hover:bg-red-100';
    return 'border-l-gray-300 border-gray-200 bg-gray-50 hover:bg-gray-100';
  };

  const boardStatusDot = (status: string) => {
    if (status === 'pending') return 'bg-orange-400';
    if (status === 'confirmed') return 'bg-green-500';
    if (status === 'rejected') return 'bg-red-400';
    return 'bg-gray-400';
  };

  const boardStatusLabel = (status: string) => {
    if (status === 'pending') return 'Chờ xác nhận';
    if (status === 'confirmed') return 'Đã xác nhận';
    if (status === 'rejected') return 'Từ chối';
    return status;
  };

  const CompactBoardCard = ({ a }: { a: SubstituteAssignment }) => (
    <button
      type="button"
      onClick={() => openAssignmentDetail(a)}
      title={`${a.class_name} · ${formatGvName(a.substitute_teacher_name)} · ${boardStatusLabel(a.status)}`}
      className={`w-full text-left rounded-md border border-l-4 px-1.5 py-1 ${boardStatusClass(a.status)}`}
    >
      <span className="flex items-start gap-1.5 min-w-0">
        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${boardStatusDot(a.status)}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-gray-900 text-xs leading-snug truncate">
            {a.class_name || '—'}
            <span className="font-normal text-gray-600"> · {formatGvName(a.absent_teacher_name)}</span>
          </span>
        </span>
      </span>
    </button>
  );

  const teacherSlotMap = useMemo(() => {
    const map = new Map<string, TimetableSlot>();
    for (const s of teacherSlots) {
      map.set(`${s.day_of_week}-${s.period}`, s);
    }
    return map;
  }, [teacherSlots]);

  const selectedKeys = useMemo(() => new Set(rows.filter((r) => r.selected).map((r) => r.key)), [rows]);

  // Load teacher TKB when selected
  useEffect(() => {
    if (!showCreate || !absentId) {
      setTeacherSlots([]);
      setSlotsError('');
      setMetaByDate(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      setSlotsError('');
      try {
        const slots = await substitutesApi.listTimetable({ teacher_id: Number(absentId) });
        if (cancelled) return;
        setTeacherSlots(slots);
        if (slots.length === 0) {
          setSlotsError('Chưa có lịch — hãy Import Excel thời khóa biểu trước.');
        }
      } catch {
        if (!cancelled) {
          setTeacherSlots([]);
          setSlotsError('Không tải được thời khóa biểu của giáo viên.');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreate, absentId]);

  // Refresh already-assigned meta when teacher/week changes
  useEffect(() => {
    if (!showCreate || !absentId || teacherSlots.length === 0) {
      setMetaByDate(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const dates = createWeekDates.map((d) => d.date);
        const periods = await substitutesApi.absentPeriods({
          absent_teacher_id: Number(absentId),
          dates,
        });
        if (cancelled) return;
        const map = new Map<string, AbsentPeriodItem>();
        for (const p of periods) {
          map.set(`${p.date}-${p.period}-${p.class_id}`, p);
        }
        setMetaByDate(map);
      } catch {
        if (!cancelled) setMetaByDate(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreate, absentId, teacherSlots.length, createWeekStart]);

  const openCreate = () => {
    setAbsentId('');
    setTeacherSlots([]);
    setSlotsError('');
    setRows([]);
    setPickRow(null);
    setSuggestions([]);
    setCreateDeptFilter('');
    setCreateNameSearch('');
    setShowSelectedSummary(false);
    setPickSearch('');
    setCreateWeekStart(weekStart);
    setShowCreate(true);
  };

  const openPickForRow = (row: RowPick) => {
    if (!absentId || row.already_assigned) return;
    setReassignDetail(null);
    setPickRow(row);
    setPickSearch('');
    setSuggestions([]);
  };

  const openReassignPick = () => {
    if (!detail) return;
    if (detail.date < toISODate(new Date())) {
      alert('Không thể đổi GV cho lịch dạy thay đã qua ngày');
      return;
    }
    const d = detail;
    const day = new Date(`${d.date}T12:00:00`).getDay();
    const dayOfWeek = day === 0 ? 7 : day + 1;
    setReassignDetail(d);
    setPickRow({
      date: d.date,
      day_of_week: dayOfWeek >= 2 && dayOfWeek <= 7 ? dayOfWeek : 2,
      period: d.period,
      session: d.session,
      period_label: d.period_label,
      class_id: d.class_id,
      class_name: d.class_name ?? null,
      campus_id: d.campus_id,
      campus_code: d.campus_code ?? null,
      already_assigned: false,
      existing_assignment_id: null,
      existing_substitute_name: null,
      key: `reassign-${d.id}`,
      selected: true,
      substitute_teacher_id: reassignDraft?.id ?? d.substitute_teacher_id ?? null,
      substitute_teacher_name: reassignDraft?.name ?? d.substitute_teacher_name ?? null,
    });
    setPickSearch('');
    setSuggestions([]);
  };

  const closePick = () => {
    setPickRow(null);
    setPickSearch('');
    setSuggestions([]);
    setReassignDetail(null);
  };

  const closeDetail = () => {
    setDetail(null);
    setReassignDraft(null);
  };

  // Gợi ý / tìm tên trên server trong popup chọn GV
  useEffect(() => {
    if (!pickRow) return;
    const absentTeacherId = reassignDetail?.absent_teacher_id ?? (absentId ? Number(absentId) : null);
    if (!absentTeacherId) return;
    const row = pickRow;
    const q = pickSearch.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingSuggest(true);
      try {
        const list = await substitutesApi.suggestions({
          absent_teacher_id: absentTeacherId,
          on_date: row.date,
          period: row.period,
          class_id: row.class_id,
          campus_id: row.campus_id,
          limit: q ? 100 : 30,
          q: q || undefined,
        });
        if (!cancelled) {
          const excludeId = reassignDetail?.substitute_teacher_id;
          setSuggestions(
            excludeId ? list.filter((s) => s.user_id !== excludeId) : list,
          );
        }
      } catch (err: unknown) {
        if (!cancelled) {
          alert(apiErrorMessage(err, 'Không lấy được gợi ý'));
          if (!q) closePick();
        }
      } finally {
        if (!cancelled) setLoadingSuggest(false);
      }
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickRow, pickSearch, absentId, reassignDetail]);

  const toggleSlotCell = (dayValue: number, period: number, date: string) => {
    const slot = teacherSlotMap.get(`${dayValue}-${period}`);
    if (!slot || !absentId) return;

    const key = `${date}-${period}-${slot.class_id}`;
    const meta = metaByDate.get(key);
    const already = Boolean(meta?.already_assigned);
    if (already) return;

    const existing = rows.find((r) => r.key === key);
    if (existing) {
      // Đã chọn → mở lại popup để đổi GV
      openPickForRow(existing);
      return;
    }

    const row: RowPick = {
      date,
      day_of_week: dayValue,
      period,
      session: slot.session,
      period_label: slot.period_label,
      class_id: slot.class_id,
      class_name: slot.class_name,
      campus_id: slot.campus_id,
      campus_code: slot.campus_code,
      already_assigned: false,
      existing_assignment_id: null,
      existing_substitute_name: null,
      key,
      selected: true,
      substitute_teacher_id: null,
      substitute_teacher_name: null,
    };
    setRows((prev) => [...prev, row]);
    openPickForRow(row);
  };

  const applyPick = (s: SuggestTeacherItem) => {
    if (!pickRow) return;
    const key = pickRow.key;
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              selected: true,
              substitute_teacher_id: s.user_id,
              substitute_teacher_name: s.name,
            }
          : r,
      ),
    );
    closePick();
  };

  const pickSubstitute = (s: SuggestTeacherItem) => {
    if (!pickRow) return;
    if (s.is_busy) {
      const reason = s.busy_reason || 'Có tiết dạy';
      if (!confirm(`${s.name} đang ${reason.toLowerCase()} vào khung giờ này. Vẫn chọn?`)) {
        return;
      }
    }

    // Đổi GV: chọn xong → đưa về popup chi tiết (chưa lưu API)
    if (reassignDetail) {
      setReassignDraft({ id: s.user_id, name: s.name });
      closePick();
      return;
    }

    applyPick(s);
  };

  const handleUpdateReassign = async () => {
    if (!detail || !reassignDraft) return;
    if (detail.date < toISODate(new Date())) {
      alert('Không thể đổi GV cho lịch dạy thay đã qua ngày');
      return;
    }
    if (reassignDraft.id === detail.substitute_teacher_id && detail.status === 'pending') {
      alert('Giáo viên này đã được xếp dạy thay (đang chờ xác nhận)');
      return;
    }
    if (!confirm(`Cập nhật GV dạy thay thành «${reassignDraft.name}»?\nLịch sẽ về trạng thái chờ xác nhận.`)) {
      return;
    }
    setReassigning(true);
    try {
      const result = await substitutesApi.reassignAssignment(detail.id, reassignDraft.id);
      closeDetail();
      await loadBoard();
      alert(result.notify_message || 'Đã cập nhật giáo viên dạy thay');
    } catch (err: unknown) {
      alert(apiErrorMessage(err, 'Không cập nhật được giáo viên dạy thay'));
    } finally {
      setReassigning(false);
    }
  };

  const handleSave = async () => {
    if (!absentId) return;
    const toSave = rows.filter((r) => r.selected && r.substitute_teacher_id && !r.already_assigned);
    if (toSave.length === 0) {
      alert('Chọn ít nhất một tiết trên lịch và giáo viên dạy thay');
      return;
    }
    const incomplete = rows.filter((r) => r.selected && !r.already_assigned && !r.substitute_teacher_id);
    if (incomplete.length > 0) {
      alert(`Còn ${incomplete.length} tiết chưa chọn giáo viên dạy thay.`);
      return;
    }
    setSaving(true);
    try {
      const result = await substitutesApi.assign(
        toSave.map((r) => ({
          absent_teacher_id: Number(absentId),
          substitute_teacher_id: r.substitute_teacher_id!,
          class_id: r.class_id,
          campus_id: r.campus_id,
          date: r.date,
          period: r.period,
        })),
      );
      if (result.errors.length) {
        alert(`${result.message}\n\n${result.errors.slice(0, 5).join('\n')}`);
      }
      setShowCreate(false);
      await loadBoard();
    } catch (err: unknown) {
      alert(apiErrorMessage(err, 'Không lưu được'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: number) => {
    const reason = window.prompt(
      'Nhập lý do hủy (bắt buộc — sẽ thông báo cho GV dạy thay):',
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      alert('Lý do hủy cần ít nhất 3 ký tự');
      return;
    }
    try {
      await substitutesApi.cancelAssignment(id, reason.trim());
      closeDetail();
      await loadBoard();
    } catch (err: unknown) {
      alert(apiErrorMessage(err, 'Không hủy được'));
    }
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    if (pickRow?.key === key) {
      closePick();
    }
  };

  const selectedCount = rows.filter((r) => r.selected && !r.already_assigned).length;
  const assignedPickCount = rows.filter((r) => r.substitute_teacher_id).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dạy thay</h1>
          <p className="text-sm text-gray-500 mt-1">
            {readOnly
              ? `Xem lịch dạy thay liên quan tổ ${user?.department || ''} (chỉ xem).`
              : 'Lịch dạy thay đã xếp. Tạo lịch bằng nút bên phải.'}
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium w-full sm:w-auto"
            >
              + Tạo lịch dạy thay
            </button>
          </div>
        )}
      </div>

      {readOnly && (
        <div className="mb-4 text-sm text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
          Chế độ tổ trưởng — hiển thị tiết có tổ viên nghỉ hoặc tổ viên đi dạy thay. Không thể xếp / đổi / hủy.
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select
          value={campusId}
          onChange={(e) => setCampusId(e.target.value ? Number(e.target.value) : '')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Tất cả cơ sở</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.code}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | 'pending' | 'confirmed' | 'rejected')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ xác nhận</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="rejected">Từ chối</option>
        </select>
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ← Tuần trước
        </button>
        <span className="text-sm font-medium text-gray-800 tabular-nums">{weekLabelOf(weekStart)}</span>
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          Tuần sau →
        </button>
        <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          Tuần này
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400">Đang tải...</div>
      ) : (
        <>
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
                      className="px-2 py-2 font-medium min-w-[120px] sticky top-0 z-20 bg-primary-700 shadow-[0_1px_0_0_rgba(0,0,0,0.08)]"
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
                      const cells = cellMap.get(`${d.date}-${period}`) || [];
                      const cellBase = `px-1 py-1 align-top ${periodSessionBorderClass(period)} ${periodSessionRowClass(period)}`;
                      const visible = cells.slice(0, CELL_PREVIEW);
                      const overflow = cells.length - visible.length;
                      return (
                        <td key={d.value} className={cellBase}>
                          {cells.length === 0 ? (
                            <div className="min-h-[48px] rounded-lg bg-gray-50/40" />
                          ) : (
                            <div className="space-y-1">
                              {visible.map((a) => (
                                <CompactBoardCard key={a.id} a={a} />
                              ))}
                              {overflow > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCellOverflow({
                                      label: `${d.label} · ${periodHeader(period)} · ${d.dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`,
                                      items: cells,
                                    })
                                  }
                                  className="w-full text-center text-[11px] font-semibold text-primary-700 bg-white/80 border border-primary-200 rounded-md py-1 hover:bg-primary-50"
                                >
                                  +{overflow} lịch nữa
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: 1 vùng scroll, tiêu đề ngày sticky khi lướt nhiều lịch */}
          <div className="md:hidden max-h-[min(70vh,720px)] overflow-y-auto border border-gray-200 rounded-xl overscroll-contain bg-white">
            {weekDates.map((d) => {
              const dayItems = boardAssignments.filter((a) => a.date === d.date);
              return (
                <section key={d.value} className="border-b border-gray-100 last:border-b-0">
                  <div className="sticky top-0 z-10 px-3 py-2 bg-primary-700 text-white text-sm font-medium shadow-sm">
                    {d.label} · {d.dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    {dayItems.length > 0 && (
                      <span className="ml-2 text-[11px] font-normal opacity-80">{dayItems.length} lịch</span>
                    )}
                  </div>
                  {dayItems.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-400 italic">Không có dạy thay</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {dayItems.map((a, idx) => {
                        const prev = dayItems[idx - 1];
                        const sessionBreak = Boolean(prev && prev.period <= 5 && a.period >= 6);
                        return (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => openAssignmentDetail(a)}
                              className={`w-full text-left px-3 py-2 border-l-4 ${boardStatusClass(a.status)} ${periodSessionListClass(a.period)} ${
                                sessionBreak ? 'border-t-2 border-slate-300' : ''
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${boardStatusDot(a.status)}`} aria-hidden />
                                <span className="text-primary-700 font-semibold">{a.period_label}</span>
                                <span className="text-gray-900 truncate">
                                  {a.class_name}
                                  <span className="text-gray-600 font-normal"> · {formatGvName(a.absent_teacher_name)}</span>
                                </span>
                              </span>
                              <span className="block text-[10px] text-gray-500 mt-0.5 pl-3">
                                {boardStatusLabel(a.status)}
                              </span>
                            </button>
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
            Cam = chờ xác nhận · Xanh = đã xác nhận · Đỏ = từ chối. Ô đông: hiện 3 lịch, bấm +N để xem hết. Bấm ô để xem / hủy.
          </p>
        </>
      )}

      {/* Create modal */}
      {!readOnly && showCreate && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Tạo lịch dạy thay</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Chọn GV nghỉ → xem lịch → bấm ô tiết cần dạy thay → chọn người dạy thay
              </p>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tổ</label>
                  <select
                    value={createDeptFilter}
                    onChange={(e) => setCreateDeptFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Tất cả tổ</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giáo viên nghỉ</label>
                  <select
                    value={absentId}
                    onChange={(e) => {
                      setAbsentId(e.target.value ? Number(e.target.value) : '');
                      setRows([]);
                      setPickRow(null);
                      setSuggestions([]);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Chọn giáo viên ({filteredTeachers.length})</option>
                    {filteredTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.department ? ` (${t.department})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tìm tên</label>
                  <input
                    type="search"
                    value={createNameSearch}
                    onChange={(e) => setCreateNameSearch(e.target.value)}
                    placeholder="VD: Hải, An..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              {absentId && (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-sm font-medium text-gray-800">Lịch của giáo viên</span>
                    <button type="button" onClick={() => setCreateWeekStart((w) => addDays(w, -7))} className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">←</button>
                    <span className="text-xs tabular-nums text-gray-600">{weekLabelOf(createWeekStart)}</span>
                    <button type="button" onClick={() => setCreateWeekStart((w) => addDays(w, 7))} className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">→</button>
                    <button type="button" onClick={() => setCreateWeekStart(mondayOf(new Date()))} className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Tuần này</button>
                  </div>

                  {loadingSlots ? (
                    <p className="text-sm text-gray-400">Đang tải lịch...</p>
                  ) : slotsError ? (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{slotsError}</p>
                  ) : (
                    <>
                      <div className="max-h-[min(48vh,420px)] overflow-auto border border-gray-200 rounded-xl overscroll-contain">
                        <table className="min-w-full text-sm border-separate border-spacing-0">
                          <thead>
                            <tr className="bg-sky-700 text-white">
                              <th className="px-2 py-2 font-medium sticky top-0 left-0 z-30 bg-sky-700 shadow-[0_1px_0_0_rgba(0,0,0,0.08)]">
                                Tiết
                              </th>
                              {createWeekDates.map((d) => (
                                <th
                                  key={d.value}
                                  className="px-2 py-2 font-medium min-w-[100px] sticky top-0 z-20 bg-sky-700 shadow-[0_1px_0_0_rgba(0,0,0,0.08)]"
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
                                  className={`px-2 py-1.5 text-center font-semibold sticky left-0 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.06)] ${periodSessionLabelClass(period)} ${periodSessionBorderClass(period)}`}
                                >
                                  {periodHeader(period)}
                                </td>
                                {createWeekDates.map((d) => {
                                  const slot = teacherSlotMap.get(`${d.value}-${period}`);
                                  const cellBase = `px-1 py-1 ${periodSessionBorderClass(period)} ${periodSessionRowClass(period)}`;
                                  if (!slot) {
                                    return (
                                      <td key={d.value} className={cellBase}>
                                        <div className="min-h-[40px] rounded-lg bg-gray-50/50" />
                                      </td>
                                    );
                                  }
                                  const key = `${d.date}-${period}-${slot.class_id}`;
                                  const selected = selectedKeys.has(key);
                                  const row = rows.find((r) => r.key === key);
                                  const meta = metaByDate.get(key);
                                  const already = Boolean(meta?.already_assigned);
                                  return (
                                    <td key={d.value} className={cellBase}>
                                      <button
                                        type="button"
                                        onClick={() => toggleSlotCell(d.value, period, d.date)}
                                        disabled={already}
                                        title={already ? `Đã xếp: ${meta?.existing_substitute_name || ''}` : 'Bấm để chọn giáo viên dạy thay'}
                                        className={`w-full min-h-[40px] rounded-lg border text-left px-2 py-1 transition-colors ${
                                          already
                                            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                            : selected
                                              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
                                              : 'bg-sky-50 border-sky-200 hover:bg-sky-100'
                                        }`}
                                      >
                                        <span className="block font-medium text-gray-900 break-words text-xs">{slot.class_name}</span>
                                        {already && (
                                          <span className="block text-[10px] text-gray-500">Đã xếp</span>
                                        )}
                                        {selected && !already && (
                                          <span className="block text-[10px] text-amber-800 truncate">
                                            {row?.substitute_teacher_name || 'Chưa chọn GV'}
                                          </span>
                                        )}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-500">
                        Bấm ô tiết → popup chọn GV dạy thay. Đổi tuần bằng mũi tên phía trên.
                      </p>
                    </>
                  )}
                </>
              )}

              {selectedCount > 0 && (
                <div className="border border-amber-200 bg-amber-50/60 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowSelectedSummary((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-amber-950"
                  >
                    <span>
                      Đã chọn {selectedCount} tiết
                      {assignedPickCount < selectedCount
                        ? ` · còn ${selectedCount - assignedPickCount} chưa chọn GV`
                        : ' · đủ GV dạy thay'}
                    </span>
                    <span className="text-xs text-amber-700">{showSelectedSummary ? 'Thu gọn' : 'Xem / xóa'}</span>
                  </button>
                  {showSelectedSummary && (
                    <ul className="border-t border-amber-100 divide-y divide-amber-100 bg-white">
                      {rows.filter((r) => r.selected && !r.already_assigned).map((row) => (
                        <li key={row.key} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                          <button
                            type="button"
                            onClick={() => openPickForRow(row)}
                            className="min-w-0 flex-1 text-left hover:text-primary-700"
                          >
                            <span className="font-medium text-gray-900">
                              {row.date} · {row.period_label} · {row.class_name}
                            </span>
                            <span className={`block text-xs ${row.substitute_teacher_name ? 'text-green-700' : 'text-gray-400'}`}>
                              {row.substitute_teacher_name
                                ? `Dạy thay: ${row.substitute_teacher_name}`
                                : 'Chưa chọn — bấm để chọn GV'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            className="shrink-0 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            Bỏ
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
              <button type="button" onClick={() => setShowCreate(false)} disabled={saving} className="px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3.5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Lưu lịch dạy thay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pick substitute teacher popup */}
      {pickRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 shrink-0 space-y-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {reassignDetail ? 'Đổi giáo viên dạy thay' : 'Chọn giáo viên dạy thay'}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {pickRow.date} · {pickRow.period_label} · {pickRow.class_name}
                  {pickRow.campus_code ? ` · ${pickRow.campus_code}` : ''}
                </p>
                {reassignDetail && (
                  <p className="text-xs text-amber-800 mt-1">
                    Hiện tại: {formatGvName(reassignDetail.substitute_teacher_name)}.
                    Chọn GV để đưa về chi tiết, rồi bấm Cập nhật để lưu.
                  </p>
                )}
              </div>
              <input
                type="search"
                value={pickSearch}
                onChange={(e) => setPickSearch(e.target.value)}
                placeholder="Tìm tên GV (kể cả đang có tiết)..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                autoFocus
                disabled={reassigning}
              />
            </div>
            <div className="px-3 py-3 overflow-y-auto flex-1">
              {loadingSuggest ? (
                <p className="text-sm text-gray-400 px-2 py-6 text-center">Đang gợi ý...</p>
              ) : suggestions.length === 0 ? (
                <p className="text-sm text-gray-500 italic px-2 py-6 text-center">
                  {pickSearch.trim()
                    ? 'Không tìm thấy giáo viên phù hợp'
                    : 'Không còn giáo viên trống tiết này — thử tìm tên để chỉ định'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {suggestions.map((s) => (
                    <li key={s.user_id}>
                      <button
                        type="button"
                        onClick={() => pickSubstitute(s)}
                        disabled={reassigning}
                        className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg border border-transparent ${
                          s.is_busy
                            ? 'hover:bg-amber-50 hover:border-amber-100'
                            : 'hover:bg-primary-50 hover:border-primary-100'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">
                            {s.name}{s.department ? ` · ${s.department}` : ''}
                          </span>
                          <span className="block text-[11px] text-gray-500">
                            {s.is_busy
                              ? (s.busy_reason || 'Có tiết dạy')
                              : `${s.tier_label} · ${s.periods_that_day} tiết hôm đó · ${s.substitutes_this_week} lần dạy thay tuần này`}
                          </span>
                        </span>
                        {s.is_busy ? (
                          <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            Có tiết dạy
                          </span>
                        ) : (
                          <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${s.same_department ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                            {s.tier_label}
                          </span>
                        )}
                        <span className="shrink-0 text-xs font-medium text-primary-700">Chọn</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between gap-2 shrink-0">
              {!reassignDetail ? (
                <button
                  type="button"
                  onClick={() => {
                    removeRow(pickRow.key);
                  }}
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Bỏ tiết này
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={closePick}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                {reassignDetail ? 'Hủy' : 'Đóng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cellOverflow && (
        <div className="fixed inset-0 z-[64] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">Lịch trong ô</h2>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{cellOverflow.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{cellOverflow.items.length} lịch</p>
              </div>
              <button
                type="button"
                onClick={() => setCellOverflow(null)}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xl leading-none"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <ul className="overflow-y-auto px-3 py-3 space-y-1.5">
              {cellOverflow.items.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openAssignmentDetail(a)}
                    className={`w-full text-left rounded-lg border border-l-4 px-3 py-2 ${boardStatusClass(a.status)}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${boardStatusDot(a.status)}`} aria-hidden />
                      <span className="font-medium text-gray-900 text-sm">
                        {a.class_name}
                        <span className="font-normal text-gray-600"> · {formatGvName(a.absent_teacher_name)}</span>
                      </span>
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5 pl-3">
                      {boardStatusLabel(a.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Chi tiết dạy thay</h2>
              <button
                type="button"
                onClick={closeDetail}
                disabled={reassigning}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-xl leading-none disabled:opacity-50"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 text-sm space-y-2">
              <p><span className="text-gray-500">Ngày:</span> {detail.date}</p>
              <p><span className="text-gray-500">Tiết:</span> {detail.period_label}</p>
              <p><span className="text-gray-500">Lớp:</span> {detail.class_name}</p>
              <p><span className="text-gray-500">Cơ sở:</span> {detail.campus_code || '—'}</p>
              <p><span className="text-gray-500">GV nghỉ:</span> {formatGvName(detail.absent_teacher_name)}</p>
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950">
                <span className="text-sky-700">GV dạy thay:</span>{' '}
                {reassignDraft ? (
                  <>
                    <span className="line-through text-sky-400/80 mr-1">
                      {formatGvName(detail.substitute_teacher_name)}
                    </span>
                    <span className="font-semibold">
                      {formatGvName(reassignDraft.name)}
                    </span>
                    <span className="ml-1 text-[11px] text-amber-700">(chưa cập nhật)</span>
                  </>
                ) : (
                  <span className="font-semibold">{formatGvName(detail.substitute_teacher_name)}</span>
                )}
              </p>
              <p>
                <span className="text-gray-500">Trạng thái:</span>{' '}
                <span className="font-medium">{boardStatusLabel(detail.status)}</span>
                {reassignDraft && (
                  <span className="ml-1 text-[11px] text-amber-700">→ sẽ về chờ xác nhận sau khi cập nhật</span>
                )}
              </p>
              {detail.status === 'rejected' && detail.rejection_reason && (
                <p className="text-red-700">Lý do từ chối: {detail.rejection_reason}</p>
              )}
              {detail.status === 'cancelled' && detail.cancel_reason && (
                <p className="text-gray-600">Lý do hủy: {detail.cancel_reason}</p>
              )}
              {detail.date < toISODate(new Date()) && (
                <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  Lịch đã qua ngày — không thể đổi giáo viên dạy thay.
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2">
              {!readOnly && detail.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => handleCancel(detail.id)}
                  disabled={reassigning}
                  className="mr-auto px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                >
                  Hủy lịch này
                </button>
              )}
              {!readOnly && detail.date >= toISODate(new Date()) && (
                <>
                  <button
                    type="button"
                    onClick={openReassignPick}
                    disabled={reassigning}
                    className="px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 rounded-lg disabled:opacity-50"
                  >
                    {reassignDraft ? 'Chọn lại GV' : 'Đổi GV dạy thay'}
                  </button>
                  {reassignDraft && (
                    <button
                      type="button"
                      onClick={handleUpdateReassign}
                      disabled={reassigning}
                      className="px-3.5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
                    >
                      {reassigning ? 'Đang cập nhật...' : 'Cập nhật'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
