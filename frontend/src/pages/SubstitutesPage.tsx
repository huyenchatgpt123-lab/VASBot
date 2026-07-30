import { useCallback, useEffect, useMemo, useState } from 'react';
import { documentsApi } from '../api/documents';
import {
  substitutesApi,
  TimetableSlot,
  ClassRoom,
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

type Teacher = {
  id: number;
  name: string;
  teacher_code?: string | null;
  department?: string | null;
  campus_id?: number | null;
};

type SlotDraft = {
  slot?: TimetableSlot | null;
  day: number;
  period: number;
};

export default function SubstitutesPage() {
  const [campuses, setCampuses] = useState<{ id: number; code: string; name: string }[]>([]);
  const [campusId, setCampusId] = useState<number | ''>('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState<number | ''>('');
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [draftClassId, setDraftClassId] = useState<number | ''>('');
  const [draftTeacherId, setDraftTeacherId] = useState<number | ''>('');
  const [newClassName, setNewClassName] = useState('');
  const [saving, setSaving] = useState(false);
  const [importResult, setImportResult] = useState<TimetableImportResult | null>(null);
  const [showImport, setShowImport] = useState(false);
  const { progress, start, finish, fail } = useOperationProgress();

  useEffect(() => {
    documentsApi.getCampuses().then((res) => {
      setCampuses(res.campuses);
      if (res.campuses.length && campusId === '') {
        setCampusId(res.campuses[0].id);
      }
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!campusId) return;
    setLoading(true);
    setError('');
    try {
      const [t, c, s] = await Promise.all([
        substitutesApi.listTeachers(Number(campusId)),
        substitutesApi.listClasses(Number(campusId)),
        substitutesApi.listTimetable({
          campus_id: Number(campusId),
          teacher_id: teacherId ? Number(teacherId) : undefined,
        }),
      ]);
      setTeachers(t);
      setClasses(c);
      setSlots(s);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Không tải được thời khóa biểu');
    } finally {
      setLoading(false);
    }
  }, [campusId, teacherId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const slotMap = useMemo(() => {
    const map = new Map<string, TimetableSlot[]>();
    for (const s of slots) {
      const key = `${s.day_of_week}-${s.period}`;
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [slots]);

  const openCell = (day: number, period: number, existing?: TimetableSlot | null) => {
    setDraft({ slot: existing || null, day, period });
    setDraftClassId(existing?.class_id ?? '');
    setDraftTeacherId(existing?.teacher_id ?? (teacherId || ''));
    setNewClassName('');
  };

  const handleSaveSlot = async () => {
    if (!draft || !campusId) return;
    let classId = draftClassId ? Number(draftClassId) : 0;
    const tid = draftTeacherId ? Number(draftTeacherId) : 0;
    if (!tid) {
      alert('Chọn giáo viên');
      return;
    }
    setSaving(true);
    try {
      if (!classId && newClassName.trim()) {
        const created = await substitutesApi.createClass({
          name: newClassName.trim(),
          campus_id: Number(campusId),
        });
        classId = created.id;
        setClasses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (!classId) {
        alert('Chọn hoặc tạo lớp');
        setSaving(false);
        return;
      }
      if (draft.slot) {
        await substitutesApi.updateSlot(draft.slot.id, {
          teacher_id: tid,
          class_id: classId,
          day_of_week: draft.day,
          period: draft.period,
        });
      } else {
        await substitutesApi.createSlot({
          teacher_id: tid,
          class_id: classId,
          campus_id: Number(campusId),
          day_of_week: draft.day,
          period: draft.period,
        });
      }
      setDraft(null);
      await loadData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detail || 'Không lưu được tiết');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!draft?.slot) return;
    if (!confirm('Xóa tiết này?')) return;
    setSaving(true);
    try {
      await substitutesApi.deleteSlot(draft.slot.id);
      setDraft(null);
      await loadData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detail || 'Không xóa được tiết');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!campusId) {
      alert('Chọn cơ sở trước khi import');
      return;
    }
    if (!confirm(
      `Import sẽ THAY TOÀN BỘ thời khóa biểu hiện tại của cơ sở đã chọn. Tiếp tục với file "${file.name}"?`,
    )) {
      return;
    }
    start('Đang import thời khóa biểu...');
    setImportResult(null);
    try {
      const result = await substitutesApi.importTimetable(file, Number(campusId));
      setImportResult(result);
      await finish();
      await loadData();
    } catch (err: unknown) {
      fail();
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detail || 'Import thất bại');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dạy thay</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý thời khóa biểu — nền tảng để sắp giáo viên dạy thay
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium w-full sm:w-auto"
        >
          Import Excel
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={campusId}
          onChange={(e) => {
            setCampusId(e.target.value ? Number(e.target.value) : '');
            setTeacherId('');
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Chọn cơ sở</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.code}</option>
          ))}
        </select>
        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : '')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[200px]"
        >
          <option value="">Tất cả giáo viên</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.teacher_code ? `${t.teacher_code} — ` : ''}{t.name}
              {t.department ? ` (${t.department})` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Tải lại
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      {importResult && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-medium text-amber-900">{importResult.message}</p>
          {importResult.teachers_unmatched.length > 0 && (
            <p className="text-amber-800">
              Chưa khớp: {importResult.teachers_unmatched.slice(0, 10).join(', ')}
              {importResult.teachers_unmatched.length > 10 ? '…' : ''}
            </p>
          )}
          {importResult.errors.length > 0 && (
            <details className="text-amber-800">
              <summary>{importResult.errors.length} cảnh báo / lỗi dòng</summary>
              <ul className="mt-1 list-disc pl-5 max-h-40 overflow-y-auto">
                {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400">Đang tải...</div>
      ) : !campusId ? (
        <div className="py-16 text-center text-gray-400">Chọn cơ sở để xem thời khóa biểu</div>
      ) : (
        <>
          {/* Desktop grid */}
          <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-primary-700 text-white">
                  <th className="px-2 py-2 font-medium sticky left-0 bg-primary-700">Tiết</th>
                  {DAYS.map((d) => (
                    <th key={d.value} className="px-2 py-2 font-medium min-w-[110px]">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((period) => (
                  <tr key={period} className="border-t border-gray-100">
                    <td className="px-2 py-2 text-center font-semibold text-primary-800 bg-primary-50 sticky left-0">
                      {periodHeader(period)}
                      <span className="block text-[10px] font-normal text-gray-500">{period}</span>
                    </td>
                    {DAYS.map((d) => {
                      const cellSlots = slotMap.get(`${d.value}-${period}`) || [];
                      return (
                        <td key={d.value} className="px-1 py-1 align-top">
                          <div className="space-y-1">
                            {cellSlots.map((slot) => (
                              <button
                                key={slot.id}
                                type="button"
                                onClick={() => openCell(d.value, period, slot)}
                                className="w-full min-h-[44px] rounded-lg border text-left px-2 py-1.5 bg-sky-50 border-sky-200 hover:bg-sky-100 transition-colors"
                              >
                                <span className="block font-medium text-gray-900 break-words">{slot.class_name}</span>
                                {!teacherId && (
                                  <span className="block text-[11px] text-gray-500 truncate" title={slot.teacher_name || ''}>
                                    {slot.teacher_name}
                                  </span>
                                )}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => openCell(d.value, period, null)}
                              className="w-full min-h-[28px] rounded-lg border border-dashed border-gray-200 text-gray-300 text-xs hover:border-primary-300 hover:bg-primary-50/40"
                            >
                              +
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden space-y-3">
            {DAYS.map((d) => {
              const daySlots = slots.filter((s) => s.day_of_week === d.value);
              return (
                <div key={d.value} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-primary-50 font-medium text-primary-900 text-sm">{d.label}</div>
                  <ul className="divide-y divide-gray-100">
                    {PERIODS.map((period) => {
                      const cellSlots = daySlots.filter((s) => s.period === period);
                      return (
                        <li key={period} className="px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="w-14 shrink-0 tabular-nums text-primary-700 font-semibold">
                              {periodHeader(period)}
                            </span>
                            <div className="min-w-0 flex-1 space-y-1">
                              {cellSlots.length === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => openCell(d.value, period, null)}
                                  className="text-left text-gray-400 italic hover:text-primary-700"
                                >
                                  Trống — bấm để thêm
                                </button>
                              ) : (
                                cellSlots.map((slot) => (
                                  <button
                                    key={slot.id}
                                    type="button"
                                    onClick={() => openCell(d.value, period, slot)}
                                    className="block w-full text-left break-words text-gray-800 hover:text-primary-700"
                                  >
                                    {slot.class_name}
                                    {!teacherId && slot.teacher_name ? ` · ${slot.teacher_name}` : ''}
                                  </button>
                                ))
                              )}
                              {cellSlots.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openCell(d.value, period, null)}
                                  className="text-xs text-primary-600"
                                >
                                  + Thêm tiết
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Tiết 1–5: buổi sáng · Tiết 6–8: buổi chiều. Bấm ô để thêm / sửa / xóa.
            {teacherId ? '' : ' Đang xem tất cả giáo viên — lọc một người để nhập tay dễ hơn.'}
          </p>
        </>
      )}

      {draft && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {draft.slot ? 'Sửa tiết' : 'Thêm tiết'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Thứ {draft.day} · {periodHeader(draft.period)} (tiết {draft.period})
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giáo viên</label>
                <select
                  value={draftTeacherId}
                  onChange={(e) => setDraftTeacherId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Chọn giáo viên</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.teacher_code ? `${t.teacher_code} — ` : ''}{t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lớp</label>
                <select
                  value={draftClassId}
                  onChange={(e) => {
                    setDraftClassId(e.target.value ? Number(e.target.value) : '');
                    setNewClassName('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Chọn lớp có sẵn</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 my-1.5 text-center">hoặc tạo lớp mới</p>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => {
                    setNewClassName(e.target.value);
                    if (e.target.value) setDraftClassId('');
                  }}
                  placeholder="VD: 6A6"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap justify-between gap-2">
              {draft.slot ? (
                <button
                  type="button"
                  onClick={handleDeleteSlot}
                  disabled={saving}
                  className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Xóa tiết
                </button>
              ) : <span />}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                  className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveSlot}
                  disabled={saving}
                  className="px-3.5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Import thời khóa biểu</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                File Excel bảng phẳng: Mã GV, Họ tên, Cơ sở, Thứ, Tiết (1–8), Lớp
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Import sẽ <strong>xóa và thay</strong> toàn bộ TKB của cơ sở đang chọn
                ({campuses.find((c) => c.id === campusId)?.code || '—'}).
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
              <OperationProgressBar
                visible={progress.visible}
                percent={progress.percent}
                label={progress.label}
              />
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
    </div>
  );
}
