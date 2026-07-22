import { useState, useEffect, useMemo } from 'react';
import { calendarApi, BghCalendarPlan, Campus } from '../api/calendar';
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
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
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

function displayPlanName(name: string): string {
  return name.replace(/\.(pdf|docx)$/i, '');
}

function openDocumentPreview(documentId: number) {
  window.open(documentsApi.getPreviewUrl(documentId), '_blank');
}

export default function BghCalendarPage() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [showDayModal, setShowDayModal] = useState(false);
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [customDate, setCustomDate] = useState(formatDateKey(new Date()));
  const [campusFilter, setCampusFilter] = useState<number | ''>('');
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [data, setData] = useState<Awaited<ReturnType<typeof calendarApi.getBghCalendar>> | null>(null);
  const [loading, setLoading] = useState(true);

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

  const openDayModal = (dateKey: string) => {
    setSelectedDate(dateKey);
    setActivePreset('custom');
    setCustomDate(dateKey);
    setShowDayModal(true);
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

  const dayPlans = useMemo(() => {
    if (!data) return [];
    return data.scheduled_plans
      .filter((p) => p.date === selectedDate)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [data, selectedDate]);

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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lịch công việc BGH</h1>
        <p className="text-gray-500 mt-1">Tổng quan kế hoạch theo ngày · VA1, VA3, EMC</p>
      </div>

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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
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
            const isSelected = showDayModal && dateKey === selectedDate;
            const isToday = dateKey === todayKey;
            const inWeek = weekHighlightDates.has(dateKey);

            return (
              <button
                key={dateKey}
                onClick={() => openDayModal(dateKey)}
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
        <p className="text-xs text-gray-400 mt-3">Bấm vào ngày để xem kế hoạch · số = số kế hoạch</p>
      </div>

      {data && data.unscheduled_plans.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Chưa xếp giờ</h2>
          <p className="text-xs text-gray-400 mb-4">Kế hoạch chưa trích được giờ bắt đầu từ tài liệu</p>
          <ul className="space-y-2">
            {data.unscheduled_plans.map((plan) => (
              <li
                key={plan.document_id}
                className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100"
              >
                <span className="text-sm text-gray-900 flex-1 min-w-[200px]">
                  {displayPlanName(plan.plan_name)}
                </span>
                <div className="flex flex-wrap gap-1">
                  {plan.campuses.map((code) => (
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

      {showDayModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDayModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {formatDisplayDate(selectedDate)}
                </h3>
                <p className="text-xs text-gray-400 mt-1">Kế hoạch trong ngày</p>
              </div>
              <button
                onClick={() => setShowDayModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg shrink-0"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {dayPlans.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Không có kế hoạch đã xếp giờ trong ngày này.
                </p>
              ) : (
                <ul className="space-y-3">
                  {dayPlans.map((plan) => (
                    <PlanRow key={`${plan.document_id}-${plan.date}`} plan={plan} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanRow({ plan }: { plan: BghCalendarPlan }) {
  return (
    <li className="flex items-center gap-3 px-3 py-3 rounded-lg bg-gray-50 border border-gray-100">
      <span className="text-sm font-semibold text-primary-700 shrink-0 tabular-nums w-12">
        {formatTime(plan.start_time)}
      </span>
      <span className="text-sm text-gray-900 leading-snug flex-1 min-w-0">
        {displayPlanName(plan.plan_name)}
      </span>
      <div className="flex flex-wrap gap-1 shrink-0">
        {plan.campuses.map((code) => (
          <span
            key={code}
            className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-medium"
          >
            {code}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => openDocumentPreview(plan.document_id)}
        title="Xem tài liệu"
        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg shrink-0 transition-colors"
      >
        👁
      </button>
    </li>
  );
}
