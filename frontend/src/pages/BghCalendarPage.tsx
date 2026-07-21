import { useState, useEffect, useMemo } from 'react';
import { calendarApi, BghCalendarTask, Campus } from '../api/calendar';
import { documentsApi } from '../api/documents';

type DatePreset = 'today' | 'tomorrow' | 'week' | 'custom';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDisplayDate(key: string): string {
  const d = parseDateKey(key);
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}

function buildCalendarGrid(viewMonth: Date): (string | null)[][] {
  const first = startOfMonth(viewMonth);
  const last = endOfMonth(viewMonth);
  let startOffset = first.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const weeks: (string | null)[][] = [];
  let current = addDays(first, -startOffset);

  while (current <= last || current.getDay() !== 1) {
    const week: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      if (current.getMonth() !== viewMonth.getMonth()) {
        week.push(null);
      } else {
        week.push(formatDateKey(current));
      }
      current = addDays(current, 1);
    }
    weeks.push(week);
    if (current > last && current.getDay() === 1) break;
  }
  return weeks;
}

export default function BghCalendarPage() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [customDate, setCustomDate] = useState(formatDateKey(new Date()));
  const [campusFilter, setCampusFilter] = useState<number | ''>('');
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [data, setData] = useState<Awaited<ReturnType<typeof calendarApi.getBghCalendar>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<BghCalendarTask | null>(null);

  const range = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    return { start_date: formatDateKey(start), end_date: formatDateKey(end) };
  }, [viewMonth]);

  useEffect(() => {
    documentsApi.getCampuses().then((res) => setCampuses(res.campuses)).catch(() => {});
  }, []);

  useEffect(() => {
    loadCalendar();
  }, [range.start_date, range.end_date, campusFilter]);

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const result = await calendarApi.getBghCalendar({
        start_date: range.start_date,
        end_date: range.end_date,
        campus_id: campusFilter || undefined,
      });
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (preset === 'today') {
      setViewMonth(startOfMonth(today));
      setSelectedDate(formatDateKey(today));
      return;
    }
    if (preset === 'tomorrow') {
      const t = addDays(today, 1);
      setViewMonth(startOfMonth(t));
      setSelectedDate(formatDateKey(t));
      return;
    }
    if (preset === 'week') {
      setViewMonth(startOfMonth(today));
      setSelectedDate(formatDateKey(today));
      return;
    }
  };

  const handleCustomDate = (value: string) => {
    setCustomDate(value);
    setActivePreset('custom');
    const d = parseDateKey(value);
    setViewMonth(startOfMonth(d));
    setSelectedDate(value);
  };

  const weeks = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);

  const dayTasks = useMemo(() => {
    if (!data) return [];
    return data.scheduled_tasks.filter((t) => {
      if (!t.deadline) return false;
      return t.deadline.slice(0, 10) === selectedDate;
    });
  }, [data, selectedDate]);

  const uniqueDayTitles = useMemo(() => {
    const seen = new Set<number>();
    const items: BghCalendarTask[] = [];
    for (const t of dayTasks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      items.push(t);
    }
    const byTitle = new Map<string, BghCalendarTask>();
    for (const t of items) {
      if (!byTitle.has(t.title)) byTitle.set(t.title, t);
    }
    return Array.from(byTitle.values());
  }, [dayTasks]);

  const weekHighlightDates = useMemo(() => {
    if (activePreset !== 'week') return new Set<string>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const set = new Set<string>();
    for (let i = 0; i < 7; i++) set.add(formatDateKey(addDays(today, i)));
    return set;
  }, [activePreset]);

  const todayKey = formatDateKey(new Date());

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lịch công việc BGH</h1>
        <p className="text-gray-500 mt-1">Theo kế hoạch tài liệu và trường (VA1, VA3, EMC)</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ['today', 'Hôm nay'],
            ['tomorrow', 'Ngày mai'],
            ['week', 'Tuần này'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                activePreset === key
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Chọn ngày:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => handleCustomDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Trường:</span>
          <select
            value={campusFilter}
            onChange={(e) => setCampusFilter(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">Tất cả trường</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </select>
          {loading && <span className="text-xs text-gray-400">Đang tải...</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              ←
            </button>
            <h2 className="text-lg font-semibold text-gray-900 capitalize">{monthLabel(viewMonth)}</h2>
            <button
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((dateKey, idx) => {
              if (!dateKey) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }
              const count = data?.day_counts[dateKey] ?? 0;
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === todayKey;
              const inWeek = weekHighlightDates.has(dateKey);

              return (
                <button
                  key={dateKey}
                  onClick={() => {
                    setSelectedDate(dateKey);
                    setSelectedTask(null);
                    setActivePreset('custom');
                    setCustomDate(dateKey);
                  }}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-colors relative ${
                    isSelected
                      ? 'bg-primary-600 text-white'
                      : inWeek
                        ? 'bg-primary-50 text-primary-800 hover:bg-primary-100'
                        : 'hover:bg-gray-100 text-gray-800'
                  } ${isToday && !isSelected ? 'ring-2 ring-primary-300' : ''}`}
                >
                  <span className="font-medium">{parseDateKey(dateKey).getDate()}</span>
                  {count > 0 && (
                    <span className={`text-[10px] mt-0.5 px-1.5 rounded-full ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-primary-100 text-primary-700'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col min-h-[320px]">
          <h3 className="text-base font-semibold text-gray-900 mb-1 capitalize">
            {formatDisplayDate(selectedDate)}
          </h3>
          <p className="text-xs text-gray-400 mb-4">Danh sách công việc trong ngày</p>

          {uniqueDayTitles.length === 0 ? (
            <p className="text-sm text-gray-500 flex-1">Không có công việc đã xếp giờ trong ngày này.</p>
          ) : (
            <ul className="space-y-1 flex-1 overflow-y-auto">
              {uniqueDayTitles.map((task) => (
                <li key={task.id}>
                  <button
                    onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedTask?.id === task.id
                        ? 'bg-primary-50 text-primary-800 border border-primary-200'
                        : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    {task.title}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedTask && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-900">{selectedTask.title}</p>
              <p className="text-sm text-gray-600 mt-2">
                🕐 {formatTime(selectedTask.deadline) || '—'}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedTask.campuses.map((code) => (
                  <span
                    key={code}
                    className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-medium"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unscheduled */}
      {data && data.unscheduled_tasks.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Chưa xếp giờ</h2>
          <p className="text-xs text-gray-400 mb-4">Công việc từ kế hoạch chưa trích được giờ cụ thể từ tài liệu</p>
          <ul className="space-y-2">
            {data.unscheduled_tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100"
              >
                <span className="text-sm text-gray-900 flex-1 min-w-[200px]">{task.title}</span>
                {task.deadline && (
                  <span className="text-xs text-gray-500">
                    📅 {task.deadline.slice(0, 10).split('-').reverse().join('/')}
                  </span>
                )}
                <div className="flex flex-wrap gap-1">
                  {task.campuses.map((code) => (
                    <span key={code} className="text-xs px-2 py-0.5 rounded-full bg-white text-amber-800 border border-amber-200">
                      {code}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
