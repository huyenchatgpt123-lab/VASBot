import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  substitutesApi,
  SubstituteAssignment,
  TeacherOption,
  TimetableSlot,
} from '../api/substitutes';

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

function formatAbsentForUser(
  name: string | null | undefined,
  department: string | null | undefined,
): string {
  if (!name) return '—';
  const base = `GV ${name}`;
  return department ? `${base} · ${department}` : base;
}

export default function TimetablePage() {
  const { user, isAdmin, isBghOnly, homePath } = useAuth();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [subs, setSubs] = useState<SubstituteAssignment[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [teacherId, setTeacherId] = useState<number | ''>('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    return teachers.filter((t) => {
      if (!q) return true;
      return `${t.name} ${t.teacher_code || ''} ${t.department || ''}`.toLowerCase().includes(q);
    });
  }, [teachers, teacherSearch]);

  const load = useCallback(async () => {
    if (!viewingTeacherId) return;
    setLoading(true);
    setError('');
    try {
      const [tt, mine] = await Promise.all([
        substitutesApi.myTimetable(isAdmin ? Number(viewingTeacherId) : undefined),
        substitutesApi.mySubstitutes(
          isAdmin && viewingTeacherId !== user?.id
            ? { teacher_id: Number(viewingTeacherId) }
            : undefined,
        ),
      ]);
      setSlots(tt);
      setSubs(mine.items || []);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Không tải được thời khóa biểu');
    } finally {
      setLoading(false);
    }
  }, [viewingTeacherId, isAdmin, user?.id]);

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

  const subByDatePeriod = useMemo(() => {
    const map = new Map<string, SubstituteAssignment>();
    for (const a of subs) {
      if (a.date < (fromDate || '') || a.date > (toDate || '')) continue;
      map.set(`${a.date}-${a.period}`, a);
    }
    return map;
  }, [subs, fromDate, toDate]);

  const weekSubs = useMemo(
    () => subs.filter((a) => a.date >= (fromDate || '') && a.date <= (toDate || '')),
    [subs, fromDate, toDate],
  );

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
            {' — '}tiết dạy thay được tô nổi.
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
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
            {user && (
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

      {/* Danh sách dạy thay */}
      <div className="mb-6 border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-amber-100 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-amber-900">
            Lịch dạy thay ({subs.length})
          </h2>
          <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            Từ hôm nay
          </span>
        </div>
        {subs.length === 0 ? (
          <p className="px-4 py-3 text-sm text-amber-800/80">Chưa có tiết dạy thay sắp tới.</p>
        ) : (
          <ul className="divide-y divide-amber-100">
            {subs.map((item) => {
              const inWeek = item.date >= (fromDate || '') && item.date <= (toDate || '');
              return (
                <li
                  key={item.id}
                  className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm ${
                    inWeek ? 'bg-amber-100/50' : ''
                  }`}
                >
                  <span className="shrink-0 font-medium text-amber-950 tabular-nums">
                    {new Date(item.date + 'T00:00:00').toLocaleDateString('vi-VN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                  <span className="shrink-0 text-amber-800 font-semibold">{item.period_label}</span>
                  <span className="min-w-0 break-words text-gray-900">
                    Lớp {item.class_name || '—'}
                    {item.campus_code ? ` · ${item.campus_code}` : ''}
                  </span>
                  <span className="text-xs text-gray-500 sm:ml-auto">
                    Thay {formatAbsentForUser(item.absent_teacher_name, item.absent_teacher_department)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Lưới TKB */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Thời khóa biểu tuần</h2>
          {weekSubs.length > 0 && (
            <span className="text-xs text-amber-800 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              {weekSubs.length} tiết dạy thay trong tuần
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Đang tải...</div>
        ) : slots.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl px-4 py-10 text-center text-sm text-gray-500">
            Chưa có thời khóa biểu.
            {subs.length > 0
              ? ' Bạn vẫn xem được lịch dạy thay phía trên.'
              : ' Liên hệ BGH để import TKB hoặc kiểm tra mã GV trên tài khoản.'}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-xl">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-primary-700 text-white">
                    <th className="px-2 py-2 font-medium sticky left-0 bg-primary-700">Tiết</th>
                    {weekDates.map((d) => (
                      <th key={d.value} className="px-2 py-2 font-medium min-w-[110px]">
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
                        const slot = slotMap.get(`${d.value}-${period}`);
                        const sub = subByDatePeriod.get(`${d.date}-${period}`);
                        if (sub) {
                          return (
                            <td key={d.value} className="px-1 py-1 align-top">
                              <div className="min-h-[52px] rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
                                <span className="block font-medium text-amber-950 break-words">
                                  {sub.class_name || '—'}
                                </span>
                                <span className="block text-[10px] text-amber-800 font-semibold">Dạy thay</span>
                                <span className="block text-[10px] text-gray-600 truncate">
                                  Thay {formatAbsentForUser(sub.absent_teacher_name, sub.absent_teacher_department)}
                                </span>
                              </div>
                            </td>
                          );
                        }
                        if (slot) {
                          return (
                            <td key={d.value} className="px-1 py-1 align-top">
                              <div className="min-h-[52px] rounded-lg border border-gray-100 bg-white px-2 py-1.5">
                                <span className="block font-medium text-gray-900 break-words">
                                  {slot.class_name || '—'}
                                </span>
                                {slot.campus_code && (
                                  <span className="block text-[10px] text-gray-500">{slot.campus_code}</span>
                                )}
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={d.value} className="px-1 py-1 align-top">
                            <div className="min-h-[52px] rounded-lg bg-gray-50/60" />
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
                const daySlots = PERIODS.map((period) => ({
                  period,
                  slot: slotMap.get(`${d.value}-${period}`),
                  sub: subByDatePeriod.get(`${d.date}-${period}`),
                })).filter((x) => x.slot || x.sub);
                return (
                  <div key={d.value} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-primary-700 text-white text-sm font-medium">
                      {d.label}{' '}
                      <span className="opacity-80 font-normal">
                        {d.dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                    {daySlots.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-gray-400 italic">Không có tiết</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {daySlots.map(({ period, slot, sub }) => (
                          <li
                            key={period}
                            className={`px-3 py-2 text-sm ${sub ? 'bg-amber-50' : ''}`}
                          >
                            <span className="font-semibold text-primary-800 mr-2">
                              {periodHeader(period)}
                            </span>
                            {sub ? (
                              <>
                                <span className="font-medium text-amber-950">{sub.class_name}</span>
                                <span className="block text-xs text-amber-800 mt-0.5">
                                  Dạy thay · Thay {formatAbsentForUser(sub.absent_teacher_name, sub.absent_teacher_department)}
                                </span>
                              </>
                            ) : (
                              <span className="text-gray-900">{slot?.class_name}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Ô vàng = tiết dạy thay trong tuần đang xem. Tiết thường lấy từ TKB mẫu theo thứ.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
