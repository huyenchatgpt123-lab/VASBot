import { useCallback, useEffect, useMemo, useState } from 'react';
import { documentsApi } from '../api/documents';
import {
  substitutesApi,
  SubstituteAssignment,
  TeacherOption,
  AbsentPeriodItem,
  SuggestTeacherItem,
  TimetableSlot,
  TimetableImportResult,
} from '../api/substitutes';
import OperationProgressBar from '../components/OperationProgressBar';
import { useOperationProgress } from '../hooks/useOperationProgress';

const DAYS = [
  { value: 2, label: 'Thứ 2' },
  { value: 3, label: 'Thứ 3' },
  { value: 4, label: 'Thứ 4' },
  { value: 5, label: 'Thứ 5' },
  { value: 6, label: 'Thứ 6' },
  { value: 7, label: 'Thứ 7' },
];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function periodHeader(p: number): string {
  return p <= 5 ? `S${p}` : `C${p - 5}`;
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

export default function SubstitutesPage() {
  const [campuses, setCampuses] = useState<{ id: number; code: string; name: string }[]>([]);
  const [campusId, setCampusId] = useState<number | ''>('');
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [assignments, setAssignments] = useState<SubstituteAssignment[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Import TKB
  const [showImport, setShowImport] = useState(false);
  const [importCampusId, setImportCampusId] = useState<number | ''>('');
  const [importResult, setImportResult] = useState<TimetableImportResult | null>(null);
  const { progress, start, finish, fail } = useOperationProgress();

  // Create substitute
  const [showCreate, setShowCreate] = useState(false);
  const [absentId, setAbsentId] = useState<number | ''>('');
  const [createWeekStart, setCreateWeekStart] = useState(() => mondayOf(new Date()));
  const [teacherSlots, setTeacherSlots] = useState<TimetableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [metaByDate, setMetaByDate] = useState<Map<string, AbsentPeriodItem>>(new Map());
  const [rows, setRows] = useState<RowPick[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestTeacherItem[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<SubstituteAssignment | null>(null);

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
      if (res.campuses.length && campusId === '') setCampusId(res.campuses[0].id);
      if (res.campuses.length && importCampusId === '') setImportCampusId(res.campuses[0].id);
    }).catch(() => {});
  }, []);

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
      const detailMsg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detailMsg || 'Không tải được lịch dạy thay');
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
      const key = `${a.date}-${a.period}`;
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [assignments]);

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
    setActiveKey(null);
    setSuggestions([]);
    setCreateWeekStart(weekStart);
    setShowCreate(true);
  };

  const openImport = () => {
    setImportResult(null);
    if (campusId) setImportCampusId(campusId);
    else if (campuses[0]) setImportCampusId(campuses[0].id);
    setShowImport(true);
  };

  const handleImport = async (file: File) => {
    if (!importCampusId) {
      alert('Chọn cơ sở trước khi import');
      return;
    }
    const code = campuses.find((c) => c.id === importCampusId)?.code || String(importCampusId);
    if (!confirm(
      `Import sẽ THAY TOÀN BỘ thời khóa biểu hiện tại của cơ sở ${code}. Tiếp tục với "${file.name}"?`,
    )) {
      return;
    }
    start('Đang import thời khóa biểu...');
    setImportResult(null);
    try {
      const result = await substitutesApi.importTimetable(file, Number(importCampusId));
      setImportResult(result);
      await finish();
      await loadBoard();
    } catch (err: unknown) {
      fail();
      const detailMsg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detailMsg || 'Import thất bại');
    }
  };

  const toggleSlotCell = (dayValue: number, period: number, date: string) => {
    const slot = teacherSlotMap.get(`${dayValue}-${period}`);
    if (!slot || !absentId) return;

    const key = `${date}-${period}-${slot.class_id}`;
    const meta = metaByDate.get(key);
    const already = Boolean(meta?.already_assigned);

    setRows((prev) => {
      const existing = prev.find((r) => r.key === key);
      if (existing) {
        // toggle off
        const next = prev.filter((r) => r.key !== key);
        if (activeKey === key) {
          setActiveKey(null);
          setSuggestions([]);
        }
        return next;
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
        already_assigned: already,
        existing_assignment_id: meta?.existing_assignment_id ?? null,
        existing_substitute_name: meta?.existing_substitute_name ?? null,
        key,
        selected: !already,
        substitute_teacher_id: null,
        substitute_teacher_name: null,
      };
      if (!already) {
        // defer suggestion load outside setState
        setTimeout(() => loadSuggestionsFor(row), 0);
      }
      return [...prev, row];
    });
  };

  const loadSuggestionsFor = async (row: RowPick) => {
    if (!absentId || row.already_assigned) return;
    setActiveKey(row.key);
    setLoadingSuggest(true);
    setSuggestions([]);
    try {
      const list = await substitutesApi.suggestions({
        absent_teacher_id: Number(absentId),
        on_date: row.date,
        period: row.period,
        class_id: row.class_id,
        campus_id: row.campus_id,
      });
      setSuggestions(list);
    } catch (err: unknown) {
      const detailMsg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detailMsg || 'Không lấy được gợi ý');
    } finally {
      setLoadingSuggest(false);
    }
  };

  const pickSubstitute = (rowKey: string, s: SuggestTeacherItem) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? {
              ...r,
              selected: true,
              substitute_teacher_id: s.user_id,
              substitute_teacher_name: s.name,
            }
          : r,
      ),
    );
  };

  const handleSave = async () => {
    if (!absentId) return;
    const toSave = rows.filter((r) => r.selected && r.substitute_teacher_id && !r.already_assigned);
    if (toSave.length === 0) {
      alert('Chọn ít nhất một tiết trên lịch và giáo viên dạy thay');
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
      const detailMsg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detailMsg || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Hủy lịch dạy thay này?')) return;
    try {
      await substitutesApi.cancelAssignment(id);
      setDetail(null);
      await loadBoard();
    } catch (err: unknown) {
      const detailMsg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detailMsg || 'Không hủy được');
    }
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    if (activeKey === key) {
      setActiveKey(null);
      setSuggestions([]);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dạy thay</h1>
          <p className="text-sm text-gray-500 mt-1">
            Lịch dạy thay đã xếp — chỉ xem. Import TKB hoặc tạo lịch bằng nút bên phải.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={openImport}
            className="px-4 py-2 border border-primary-300 text-primary-700 bg-white hover:bg-primary-50 rounded-lg text-sm font-medium w-full sm:w-auto"
          >
            Import Excel TKB
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium w-full sm:w-auto"
          >
            + Tạo lịch dạy thay
          </button>
        </div>
      </div>

      {importResult && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-medium text-amber-900">{importResult.message}</p>
          {importResult.teachers_unmatched.length > 0 && (
            <p className="text-amber-800">
              Chưa khớp: {importResult.teachers_unmatched.slice(0, 10).join(', ')}
              {importResult.teachers_unmatched.length > 10 ? '…' : ''}
            </p>
          )}
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
          <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-primary-700 text-white">
                  <th className="px-2 py-2 font-medium sticky left-0 bg-primary-700">Tiết</th>
                  {weekDates.map((d) => (
                    <th key={d.value} className="px-2 py-2 font-medium min-w-[120px]">
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
                  <tr key={period} className="border-t border-gray-100">
                    <td className="px-2 py-2 text-center font-semibold text-primary-800 bg-primary-50 sticky left-0">
                      {periodHeader(period)}
                    </td>
                    {weekDates.map((d) => {
                      const cells = cellMap.get(`${d.date}-${period}`) || [];
                      return (
                        <td key={d.value} className="px-1 py-1 align-top">
                          {cells.length === 0 ? (
                            <div className="min-h-[48px] rounded-lg bg-gray-50/60" />
                          ) : (
                            <div className="space-y-1">
                              {cells.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => setDetail(a)}
                                  className="w-full text-left rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 px-2 py-1.5"
                                >
                                  <span className="block font-medium text-gray-900 break-words">{a.class_name}</span>
                                  <span className="block text-[11px] text-amber-900 truncate">{a.substitute_teacher_name || '—'}</span>
                                  <span className="block text-[10px] text-gray-500 truncate">thay {a.absent_teacher_name || '—'}</span>
                                </button>
                              ))}
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

          <div className="md:hidden space-y-3">
            {weekDates.map((d) => {
              const dayItems = assignments.filter((a) => a.date === d.date);
              return (
                <div key={d.value} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-primary-50 font-medium text-primary-900 text-sm">
                    {d.label} · {d.dateObj.toLocaleDateString('vi-VN')}
                  </div>
                  {dayItems.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-400 italic">Không có dạy thay</p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {dayItems.map((a) => (
                        <li key={a.id}>
                          <button type="button" onClick={() => setDetail(a)} className="w-full text-left px-3 py-2.5 hover:bg-amber-50">
                            <span className="text-primary-700 font-semibold mr-2">{a.period_label}</span>
                            <span className="text-gray-900">{a.class_name}</span>
                            <span className="block text-xs text-amber-800 mt-0.5">
                              {a.substitute_teacher_name} thay {a.absent_teacher_name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-gray-500">Ô vàng = đã xếp dạy thay. Bấm ô để xem / hủy.</p>
        </>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Import thời khóa biểu</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                File: Mã GV, Họ tên, Cơ sở, Thứ, Tiết (1–8), Lớp
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cơ sở</label>
                <select
                  value={importCampusId}
                  onChange={(e) => setImportCampusId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  disabled={progress.visible}
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Import sẽ <strong>xóa và thay</strong> toàn bộ TKB của cơ sở đang chọn.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={progress.visible || !importCampusId}
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
                    <details>
                      <summary className="text-amber-800 cursor-pointer">{importResult.errors.length} cảnh báo</summary>
                      <ul className="mt-1 list-disc pl-5 max-h-32 overflow-y-auto text-amber-800">
                        {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
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

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Tạo lịch dạy thay</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Chọn GV nghỉ → xem lịch → bấm ô tiết cần dạy thay → chọn người dạy thay
              </p>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giáo viên nghỉ</label>
                <select
                  value={absentId}
                  onChange={(e) => {
                    setAbsentId(e.target.value ? Number(e.target.value) : '');
                    setRows([]);
                    setActiveKey(null);
                    setSuggestions([]);
                  }}
                  className="w-full sm:max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Chọn giáo viên</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.teacher_code ? `${t.teacher_code} — ` : ''}{t.name}
                      {t.department ? ` (${t.department})` : ''}
                    </option>
                  ))}
                </select>
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
                      <div className="overflow-x-auto border border-gray-200 rounded-xl">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-sky-700 text-white">
                              <th className="px-2 py-2 font-medium sticky left-0 bg-sky-700">Tiết</th>
                              {createWeekDates.map((d) => (
                                <th key={d.value} className="px-2 py-2 font-medium min-w-[100px]">
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
                              <tr key={period} className="border-t border-gray-100">
                                <td className="px-2 py-1.5 text-center font-semibold text-sky-800 bg-sky-50 sticky left-0">
                                  {periodHeader(period)}
                                </td>
                                {createWeekDates.map((d) => {
                                  const slot = teacherSlotMap.get(`${d.value}-${period}`);
                                  if (!slot) {
                                    return (
                                      <td key={d.value} className="px-1 py-1">
                                        <div className="min-h-[40px] rounded-lg bg-gray-50/80" />
                                      </td>
                                    );
                                  }
                                  const key = `${d.date}-${period}-${slot.class_id}`;
                                  const selected = selectedKeys.has(key);
                                  const meta = metaByDate.get(key);
                                  const already = Boolean(meta?.already_assigned);
                                  return (
                                    <td key={d.value} className="px-1 py-1">
                                      <button
                                        type="button"
                                        onClick={() => toggleSlotCell(d.value, period, d.date)}
                                        disabled={already}
                                        title={already ? `Đã xếp: ${meta?.existing_substitute_name || ''}` : 'Bấm để chọn / bỏ chọn tiết này'}
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
                                          <span className="block text-[10px] text-amber-800">Đã chọn</span>
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
                        Ô xanh = tiết dạy chính. Bấm để chọn ngày/tiết cần dạy thay (đổi tuần bằng mũi tên phía trên).
                      </p>
                    </>
                  )}
                </>
              )}

              {rows.length > 0 && (
                <div className="space-y-2 border-t border-gray-100 pt-4">
                  <p className="text-sm font-medium text-gray-800">
                    Tiết đã chọn — chọn GV dạy thay từng tiết ({rows.filter((r) => r.substitute_teacher_id).length}/{rows.filter((r) => !r.already_assigned).length})
                  </p>
                  {rows.map((row) => (
                    <div
                      key={row.key}
                      className={`border rounded-lg p-3 ${
                        row.already_assigned
                          ? 'border-gray-100 bg-gray-50 opacity-70'
                          : activeKey === row.key
                            ? 'border-primary-300 bg-primary-50/40'
                            : 'border-gray-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="font-medium text-gray-900">
                            {row.date} · {row.period_label} · {row.class_name}
                          </span>
                          {row.campus_code && <span className="text-gray-500"> · {row.campus_code}</span>}
                          {row.substitute_teacher_name ? (
                            <span className="block text-xs text-green-700">Dạy thay: {row.substitute_teacher_name}</span>
                          ) : (
                            <span className="block text-xs text-gray-400">Chưa chọn người dạy thay</span>
                          )}
                        </span>
                        <div className="flex gap-2 shrink-0">
                          {!row.already_assigned && (
                            <button
                              type="button"
                              onClick={() => loadSuggestionsFor(row)}
                              className="px-3 py-1.5 text-xs font-medium text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50"
                            >
                              Gợi ý GV
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            Bỏ
                          </button>
                        </div>
                      </div>

                      {activeKey === row.key && (
                        <div className="mt-3 border-t border-primary-100 pt-3">
                          {loadingSuggest ? (
                            <p className="text-sm text-gray-400">Đang gợi ý...</p>
                          ) : suggestions.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">Không còn giáo viên trống tiết này</p>
                          ) : (
                            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                              {suggestions.map((s) => (
                                <li key={s.user_id}>
                                  <button
                                    type="button"
                                    onClick={() => pickSubstitute(row.key, s)}
                                    className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200"
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-medium text-gray-900">
                                        {s.name}{s.department ? ` · ${s.department}` : ''}
                                      </span>
                                      <span className="block text-[11px] text-gray-500">
                                        {s.tier_label} · {s.periods_that_day} tiết hôm đó · {s.substitutes_this_week} lần dạy thay tuần này
                                      </span>
                                    </span>
                                    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${s.same_department ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                                      {s.tier_label}
                                    </span>
                                    <span className="shrink-0 text-xs font-medium text-primary-700">Chọn</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
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

      {detail && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Chi tiết dạy thay</h2>
            </div>
            <div className="px-5 py-4 text-sm space-y-2">
              <p><span className="text-gray-500">Ngày:</span> {detail.date}</p>
              <p><span className="text-gray-500">Tiết:</span> {detail.period_label}</p>
              <p><span className="text-gray-500">Lớp:</span> {detail.class_name}</p>
              <p><span className="text-gray-500">Cơ sở:</span> {detail.campus_code || '—'}</p>
              <p><span className="text-gray-500">GV nghỉ:</span> {detail.absent_teacher_name}</p>
              <p><span className="text-gray-500">GV dạy thay:</span> {detail.substitute_teacher_name}</p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-between gap-2">
              <button type="button" onClick={() => handleCancel(detail.id)} className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">
                Hủy lịch này
              </button>
              <button type="button" onClick={() => setDetail(null)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
