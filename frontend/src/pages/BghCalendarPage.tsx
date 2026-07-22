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

function datesInRange(startKey: string, endKey: string): string[] {
  let start = parseDateKey(startKey);
  let end = parseDateKey(endKey);
  if (start > end) {
    [start, end] = [end, start];
  }
  const keys: string[] = [];
  let current = start;
  while (current <= end) {
    keys.push(formatDateKey(current));
    current = addDays(current, 1);
  }
  return keys;
}

function normalizeRange(startKey: string, endKey: string): { start: string; end: string } {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (start <= end) {
    return { start: startKey, end: endKey };
  }
  return { start: endKey, end: startKey };
}

function formatShortDate(key: string): string {
  return parseDateKey(key).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
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
  const [filterStartDate, setFilterStartDate] = useState(formatDateKey(new Date()));
  const [filterEndDate, setFilterEndDate] = useState(formatDateKey(new Date()));
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

  const filterRange = useMemo(
    () => normalizeRange(filterStartDate, filterEndDate),
    [filterStartDate, filterEndDate],
  );

  const openDayModal = (dateKey: string) => {
    setSelectedDate(dateKey);
    setShowDayModal(true);
  };

  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = formatDateKey(today);

    if (preset === 'today') {
      setViewMonth(startOfMonth(today));
      setFilterStartDate(todayKey);
      setFilterEndDate(todayKey);
      setSelectedDate(todayKey);
      return;
    }
    if (preset === 'tomorrow') {
      const t = addDays(today, 1);
      const tKey = formatDateKey(t);
      setViewMonth(startOfMonth(t));
      setFilterStartDate(tKey);
      setFilterEndDate(tKey);
      setSelectedDate(tKey);
      return;
    }
    if (preset === 'week') {
      const weekEnd = addDays(today, 6);
      setViewMonth(startOfMonth(today));
      setFilterStartDate(todayKey);
      setFilterEndDate(formatDateKey(weekEnd));
      setSelectedDate(todayKey);
    }
  };

  const handleFilterStartDate = (value: string) => {
    setFilterStartDate(value);
    setActivePreset('custom');
    setSelectedDate(value);
    setViewMonth(startOfMonth(parseDateKey(value)));
  };

  const handleFilterEndDate = (value: string) => {
    setFilterEndDate(value);
    setActivePreset('custom');
    const normalized = normalizeRange(filterStartDate, value);
    setViewMonth(startOfMonth(parseDateKey(normalized.start)));
  };

  const weeks = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);

  const dayPlans = useMemo(() => {
    if (!data) return [];
    return data.scheduled_plans
      .filter((p) => p.date === selectedDate)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [data, selectedDate]);

  const rangeHighlightDates = useMemo(
    () => new Set(datesInRange(filterRange.start, filterRange.end)),
    [filterRange.start, filterRange.end],
  );

  const rangePlansGrouped = useMemo(() => {
    if (!data) return [] as { date: string; plans: BghCalendarPlan[] }[];
    const rangeSet = rangeHighlightDates;
    const grouped = new Map<string, BghCalendarPlan[]>();
    for (const plan of data.scheduled_plans) {
      if (!plan.date || !rangeSet.has(plan.date)) continue;
      const list = grouped.get(plan.date) || [];
      list.push(plan);
      grouped.set(plan.date, list);
    }
    return datesInRange(filterRange.start, filterRange.end)
      .filter((date) => grouped.has(date))
      .map((date) => ({
        date,
        plans: (grouped.get(date) || []).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
      }));
  }, [data, filterRange.start, filterRange.end, rangeHighlightDates]);

  const totalRangePlans = useMemo(
    () => rangePlansGrouped.reduce((sum, g) => sum + g.plans.length, 0),
    [rangePlansGrouped],
  );

  const todayKey = formatDateKey(new Date());

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-5 text-center sm:text-left">
        <h1 className="text-2xl font-bold text-gray-900">Lịch công việc BGH</h1>
        <p className="text-gray-500 mt-1">Tổng quan kế hoạch theo ngày · VA1, VA3, EMC</p>
      </div>

      <div className="mb-6 flex flex-col items-center gap-4 w-full max-w-xl sm:max-w-2xl mx-auto">
        <div className="w-full flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
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
          <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
            <span className="text-sm text-gray-500">Từ ngày:</span>
            <input
              type="date"
              value={filterRange.start}
              onChange={(e) => handleFilterStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <span className="text-sm text-gray-500">Đến ngày:</span>
            <input
              type="date"
              value={filterRange.end}
              onChange={(e) => handleFilterEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
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
      </div>

      <div className="flex justify-center px-1">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 w-full max-w-xl sm:max-w-2xl">
          <div className="flex items-center justify-between mb-5">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Tháng trước"
            >
              ←
            </button>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 capitalize px-2 text-center">
              {monthLabel(viewMonth)}
            </h2>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Tháng sau"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-sm font-semibold text-gray-500 py-1.5">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weeks.flat().map((dateKey, idx) => {
              if (!dateKey) {
                return <div key={`empty-${idx}`} className="aspect-square min-h-[52px] sm:min-h-[56px]" />;
              }
              const count = data?.day_counts[dateKey] ?? 0;
              const isSelected = showDayModal && dateKey === selectedDate;
              const isToday = dateKey === todayKey;
              const inRange = rangeHighlightDates.has(dateKey);
              const hasPlans = count > 0;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => openDayModal(dateKey)}
                  className={`aspect-square min-h-[52px] sm:min-h-[56px] rounded-xl flex flex-col items-center justify-center transition-all relative ${
                    isSelected
                      ? 'bg-primary-600 text-white shadow-md scale-[1.02]'
                      : inRange
                        ? 'bg-primary-50 text-primary-900 hover:bg-primary-100 ring-1 ring-primary-200'
                        : hasPlans
                          ? 'bg-primary-50/60 text-gray-900 hover:bg-primary-50'
                          : 'text-gray-800 hover:bg-gray-100'
                  } ${isToday && !isSelected ? 'ring-2 ring-primary-400 ring-offset-1' : ''}`}
                >
                  <span className="text-base sm:text-lg font-semibold leading-none">{parseDateKey(dateKey).getDate()}</span>
                  {hasPlans && (
                    <span className={`mt-1.5 min-w-[20px] px-2 py-0.5 rounded-full text-xs font-bold leading-none ${
                      isSelected ? 'bg-white/30 text-white' : 'bg-primary-600 text-white'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-gray-400 mt-5 text-center">Chọn khoảng ngày phía trên · chạm ô ngày để xem chi tiết</p>
        </div>
      </div>

      {data && (
        <div className="mt-8 mx-auto max-w-xl sm:max-w-2xl w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Kế hoạch từ {formatShortDate(filterRange.start)} đến {formatShortDate(filterRange.end)}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {totalRangePlans > 0
                ? `${totalRangePlans} lượt kế hoạch trong khoảng đã chọn`
                : 'Không có kế hoạch trong khoảng ngày này'}
            </p>
          </div>

          {rangePlansGrouped.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              Thử chọn khoảng ngày khác hoặc bấm Admin → Trích lại trên trang Tài liệu.
            </p>
          ) : (
            <div className="space-y-6">
              {rangePlansGrouped.map(({ date, plans }) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-primary-700 mb-2 capitalize">
                    {formatDisplayDate(date)}
                  </h3>
                  <ul className="space-y-2">
                    {plans.map((plan) => (
                      <PlanRow
                        key={`${plan.document_id}-${plan.date}-${plan.start_time}`}
                        plan={plan}
                        compact
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data && data.unscheduled_plans.length > 0 && (
        <div className="mt-8 mx-auto max-w-xl sm:max-w-2xl w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Chưa xếp giờ</h2>
          <p className="text-xs text-gray-400 mb-4">Kế hoạch chưa trích được dòng Thời gian: hoặc Ngày: từ tài liệu</p>
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
            className="bg-white rounded-2xl shadow-xl w-[75vw] max-w-3xl h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {formatDisplayDate(selectedDate)}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {dayPlans.length > 0
                    ? `${dayPlans.length} kế hoạch trong ngày`
                    : 'Không có kế hoạch đã xếp giờ'}
                </p>
              </div>
              <button
                onClick={() => setShowDayModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg shrink-0"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {dayPlans.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Không có kế hoạch đã xếp giờ trong ngày này.
                </p>
              ) : (
                <ul className="space-y-3 max-w-2xl mx-auto">
                  {dayPlans.map((plan) => (
                    <PlanRow key={`${plan.document_id}-${plan.date}-${plan.start_time}`} plan={plan} />
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

function PlanRow({ plan, compact = false }: { plan: BghCalendarPlan; compact?: boolean }) {
  const timeLabel = plan.is_continuation
    ? 'Tiếp diễn'
    : formatTime(plan.start_time);

  return (
    <li className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-primary-200 transition-colors ${
      compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
    }`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`font-bold shrink-0 tabular-nums w-16 ${
          plan.is_continuation ? 'text-xs text-gray-500' : 'text-base text-primary-700'
        }`}>
          {timeLabel}
        </span>
        <div className="flex-1 min-w-0">
          <span className={`text-gray-900 leading-snug ${compact ? 'text-sm' : 'text-base'}`}>
            {displayPlanName(plan.plan_name)}
          </span>
          {plan.event_end_date && !plan.is_continuation && (
            <span className="block text-xs text-gray-400 mt-0.5">
              Đến {formatShortDate(plan.event_end_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[3.75rem] sm:pl-0 shrink-0">
        <div className="flex flex-wrap gap-1.5 flex-1 sm:flex-none">
          {plan.campuses.map((code) => (
            <span
              key={code}
              className="text-xs px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 font-semibold"
            >
              {code}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => openDocumentPreview(plan.document_id)}
          title="Xem tài liệu"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl shrink-0 transition-colors text-lg"
        >
          👁
        </button>
      </div>
    </li>
  );
}
