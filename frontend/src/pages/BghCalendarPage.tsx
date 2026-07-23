import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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

/** Monday of the ISO-style week (T2–CN) containing `d`. */
function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  let offset = r.getDay() - 1;
  if (offset < 0) offset = 6;
  return addDays(r, -offset);
}

function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
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
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [filterStartDate, setFilterStartDate] = useState(formatDateKey(new Date()));
  const [filterEndDate, setFilterEndDate] = useState(formatDateKey(new Date()));
  const [anchorDate, setAnchorDate] = useState(formatDateKey(new Date()));
  const [campusFilter, setCampusFilter] = useState<number | ''>('');
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [data, setData] = useState<Awaited<ReturnType<typeof calendarApi.getBghCalendar>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const listPanelRef = useRef<HTMLDivElement>(null);
  const daySectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const range = useMemo(() => {
    const monthStart = formatDateKey(startOfMonth(viewMonth));
    const monthEnd = formatDateKey(endOfMonth(viewMonth));
    const normalized = normalizeRange(filterStartDate, filterEndDate);
    return {
      start_date: normalized.start < monthStart ? normalized.start : monthStart,
      end_date: normalized.end > monthEnd ? normalized.end : monthEnd,
    };
  }, [viewMonth, filterStartDate, filterEndDate]);

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

  const scrollToDay = useCallback((dateKey: string) => {
    const el = daySectionRefs.current[dateKey];
    if (el && listPanelRef.current) {
      const panelTop = listPanelRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      listPanelRef.current.scrollBy({ top: elTop - panelTop - 12, behavior: 'smooth' });
    }
  }, []);

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
      setAnchorDate(todayKey);
      return;
    }
    if (preset === 'tomorrow') {
      const t = addDays(today, 1);
      const tKey = formatDateKey(t);
      setViewMonth(startOfMonth(t));
      setFilterStartDate(tKey);
      setFilterEndDate(tKey);
      setSelectedDate(tKey);
      setAnchorDate(tKey);
      return;
    }
    if (preset === 'week') {
      const weekStart = startOfWeek(today);
      const weekEnd = endOfWeek(today);
      const weekStartKey = formatDateKey(weekStart);
      const weekEndKey = formatDateKey(weekEnd);
      setViewMonth(startOfMonth(today));
      setFilterStartDate(weekStartKey);
      setFilterEndDate(weekEndKey);
      setSelectedDate(todayKey);
      setAnchorDate(weekStartKey);
    }
  };

  const handleFilterStartDate = (value: string) => {
    setFilterStartDate(value);
    setActivePreset('custom');
    setSelectedDate(value);
    setAnchorDate(value);
    setViewMonth(startOfMonth(parseDateKey(value)));
  };

  const handleFilterEndDate = (value: string) => {
    setFilterEndDate(value);
    setActivePreset('custom');
    const normalized = normalizeRange(filterStartDate, value);
    setAnchorDate(normalized.start);
    setViewMonth(startOfMonth(parseDateKey(normalized.start)));
  };

  const weeks = useMemo(() => buildCalendarGrid(viewMonth), [viewMonth]);

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

  const selectCalendarDay = (dateKey: string, shiftKey: boolean) => {
    setActivePreset('custom');
    setSelectedDate(dateKey);
    setViewMonth(startOfMonth(parseDateKey(dateKey)));

    if (shiftKey) {
      const from = anchorDate || filterRange.start;
      const normalized = normalizeRange(from, dateKey);
      setFilterStartDate(normalized.start);
      setFilterEndDate(normalized.end);
      if (normalized.start !== normalized.end) {
        requestAnimationFrame(() => scrollToDay(dateKey));
      }
      return;
    }

    setAnchorDate(dateKey);
    setFilterStartDate(dateKey);
    setFilterEndDate(dateKey);
  };

  const isSingleDayRange = filterRange.start === filterRange.end;
  const todayKey = formatDateKey(new Date());

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="mb-5 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Thời gian biểu</h1>
        <p className="text-gray-500 mt-1">Lịch hoạt động và kế hoạch diễn ra tại trường</p>
      </div>

      {/* Toolbar */}
      <div className="mb-5 shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {([
              ['today', 'Hôm nay'],
              ['tomorrow', 'Ngày mai'],
              ['week', 'Tuần này'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`px-3.5 py-2 text-sm rounded-lg font-medium transition-colors ${
                  activePreset === key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">Từ</label>
              <input
                type="date"
                value={filterRange.start}
                onChange={(e) => handleFilterStartDate(e.target.value)}
                className="px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">Đến</label>
              <input
                type="date"
                value={filterRange.end}
                onChange={(e) => handleFilterEndDate(e.target.value)}
                className="px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">Trường</label>
              <select
                value={campusFilter}
                onChange={(e) => setCampusFilter(e.target.value ? Number(e.target.value) : '')}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none min-w-[120px]"
              >
                <option value="">Tất cả</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.code}</option>
                ))}
              </select>
            </div>
            {loading && (
              <span className="text-xs text-gray-400 animate-pulse">Đang tải...</span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(320px,400px)_1fr] gap-5 lg:gap-6 min-h-0">
        {/* Left — Calendar */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Lịch tháng</p>
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                aria-label="Tháng trước"
              >
                ←
              </button>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 capitalize">
                {monthLabel(viewMonth)}
              </h2>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                aria-label="Tháng sau"
              >
                →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {weeks.flat().map((dateKey, idx) => {
                if (!dateKey) {
                  return <div key={`empty-${idx}`} className="aspect-square min-h-[40px]" />;
                }
                const count = data?.day_counts[dateKey] ?? 0;
                const isFocused = dateKey === selectedDate;
                const isToday = dateKey === todayKey;
                const inRange = rangeHighlightDates.has(dateKey);
                const hasPlans = count > 0;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={(e) => selectCalendarDay(dateKey, e.shiftKey)}
                    className={`aspect-square min-h-[40px] sm:min-h-[44px] rounded-lg flex flex-col items-center justify-center transition-all relative ${
                      isFocused
                        ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-300 ring-offset-1 z-10'
                        : inRange
                          ? 'bg-primary-50 text-primary-900 hover:bg-primary-100'
                          : hasPlans
                            ? 'bg-gray-50 text-gray-900 hover:bg-primary-50'
                            : 'text-gray-700 hover:bg-gray-100'
                    } ${isToday && !isFocused ? 'font-bold' : ''}`}
                  >
                    <span className="text-sm font-semibold leading-none">{parseDateKey(dateKey).getDate()}</span>
                    {hasPlans && (
                      <span className={`mt-1 min-w-[16px] px-1 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                        isFocused ? 'bg-white/25 text-white' : 'bg-primary-600 text-white'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-primary-50 ring-1 ring-primary-200" />
                <span>Khoảng ngày đang chọn</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-primary-600" />
                <span>Ngày đang xem</span>
              </div>
              <p className="text-gray-400 pt-1">Bấm ngày để xem · Giữ Shift + bấm để chọn nhiều ngày</p>
            </div>
          </div>
        </aside>

        {/* Right — Timetable list */}
        <main className="flex flex-col min-h-[480px] lg:min-h-0 lg:max-h-[calc(100vh-13rem)]">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* List header */}
            <div className="px-5 py-4 border-b border-gray-100 shrink-0 bg-gray-50/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Danh sách hoạt động</p>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {isSingleDayRange
                      ? formatDisplayDate(filterRange.start)
                      : `${formatShortDate(filterRange.start)} – ${formatShortDate(filterRange.end)}`}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {totalRangePlans > 0
                      ? `${totalRangePlans} hoạt động`
                      : isSingleDayRange
                        ? 'Không có hoạt động nào trong ngày này'
                        : 'Không có hoạt động nào trong khoảng đã chọn'}
                  </p>
                </div>
                {data && data.unscheduled_plans.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowUnscheduled((v) => !v)}
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    Chưa có thời gian ({data.unscheduled_plans.length})
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable activity list */}
            <div ref={listPanelRef} className="flex-1 overflow-y-auto p-4 sm:p-5">
              {!data || loading ? (
                <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                  {loading ? 'Đang tải thời gian biểu...' : 'Không tải được dữ liệu'}
                </div>
              ) : rangePlansGrouped.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                  <p className="text-sm text-gray-500">Không có hoạt động nào trong khoảng ngày này.</p>
                  <p className="text-xs text-gray-400 mt-1">Thử đổi bộ lọc hoặc chọn ngày khác.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {rangePlansGrouped.map(({ date, plans }) => {
                    const isFocusedDay = date === selectedDate;
                    return (
                      <div
                        key={date}
                        ref={(el) => { daySectionRefs.current[date] = el; }}
                        className={`rounded-xl transition-colors ${
                          isFocusedDay ? 'ring-2 ring-primary-200 bg-primary-50/30 p-3 -mx-1' : ''
                        }`}
                      >
                        {!isSingleDayRange && (
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`w-1 h-5 rounded-full ${isFocusedDay ? 'bg-primary-600' : 'bg-primary-300'}`} />
                            <h3 className="text-sm font-semibold text-gray-800 capitalize">
                              {formatDisplayDate(date)}
                            </h3>
                            <span className="text-xs text-gray-400">({plans.length} hoạt động)</span>
                          </div>
                        )}
                        <ul className="space-y-2">
                          {plans.map((plan) => (
                            <PlanRow
                              key={`${plan.event_id ?? 'doc'}-${plan.document_id}-${plan.date}-${plan.start_time}`}
                              plan={plan}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unscheduled collapsible */}
              {showUnscheduled && data && data.unscheduled_plans.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-amber-800 mb-1">Chưa có thời gian</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Cần Admin chỉnh sửa ngày/giờ (AI chưa trích được hoặc thiếu thông tin)
                  </p>
                  <ul className="space-y-2">
                    {data.unscheduled_plans.map((plan) => (
                      <li
                        key={plan.event_id ?? `doc-${plan.document_id}`}
                        className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100"
                      >
                        <span className="text-sm text-gray-900 flex-1 min-w-0">
                          {displayPlanName(plan.plan_name)}
                        </span>
                        {plan.needs_review && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-medium">
                            Cần chỉnh sửa
                          </span>
                        )}
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
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PlanRow({ plan }: { plan: BghCalendarPlan }) {
  const timeLabel = plan.is_continuation
    ? 'Tiếp diễn'
    : plan.end_time
      ? `${formatTime(plan.start_time)}–${formatTime(plan.end_time)}`
      : formatTime(plan.start_time);

  return (
    <li className={`group flex items-start gap-3 px-4 py-3 rounded-xl bg-white border hover:shadow-sm transition-all ${
      plan.needs_review ? 'border-amber-200 hover:border-amber-300' : 'border-gray-100 hover:border-primary-200'
    }`}>
      <div className={`shrink-0 min-w-[3.5rem] pt-0.5 text-right tabular-nums font-bold ${
        plan.is_continuation ? 'text-xs text-gray-400' : 'text-sm text-primary-700'
      }`}>
        {timeLabel}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-snug group-hover:text-primary-900 transition-colors">
          {displayPlanName(plan.plan_name)}
        </p>
        {plan.needs_review && (
          <p className="text-xs text-amber-700 mt-0.5">Cần Admin chỉnh sửa</p>
        )}
        {plan.event_end_date && !plan.is_continuation && (
          <p className="text-xs text-gray-400 mt-0.5">
            Đến {formatShortDate(plan.event_end_date)}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {plan.campuses.map((code) => (
            <span
              key={code}
              className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 font-medium"
            >
              {code}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => openDocumentPreview(plan.document_id)}
        title="Xem tài liệu"
        className="shrink-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors opacity-70 group-hover:opacity-100"
      >
        👁
      </button>
    </li>
  );
}
