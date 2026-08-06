import { useState } from 'react';
import {
  documentsApi,
  CalendarPreviewPayload,
  CalendarDayPreview,
  TimelineSlotPreview,
  PlanEventConfirmPayload,
} from '../api/documents';
import { useToast } from '../context/ToastContext';

type Props = {
  preview: CalendarPreviewPayload;
  onClose: () => void;
  onSaved: () => void;
  /** When set, save updates only this event (edit from Lịch hoạt động). */
  eventId?: number | null;
  onReExtract?: () => Promise<CalendarPreviewPayload | null | void> | void;
  reExtracting?: boolean;
};

type SlotRow = TimelineSlotPreview & { end: string | null };

type DayDraft = {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  slots: SlotRow[];
  includeTimeline: boolean;
};

const TIME_RE = /^\d{2}:\d{2}$/;

function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return { date, time: hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '' };
}

function joinDateTime(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || '00:00'}:00`;
}

function dayFromPreviewFields(
  title: string | null | undefined,
  plan_event_at: string | null | undefined,
  plan_event_end_at: string | null | undefined,
  location: string | null | undefined,
  timeline: TimelineSlotPreview[] | null | undefined,
): DayDraft {
  const start = splitDateTime(plan_event_at);
  const end = splitDateTime(plan_event_end_at);
  const slots: SlotRow[] = (Array.isArray(timeline) ? timeline : []).map((slot) => ({
    start: slot.start,
    end: slot.end ?? null,
    title: slot.title,
  }));
  return {
    title: title?.trim() || '',
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    location: location?.trim() || '',
    slots,
    includeTimeline: slots.length > 0,
  };
}

function buildInitialDays(preview: CalendarPreviewPayload): DayDraft[] {
  const events = Array.isArray(preview.events) ? preview.events : [];
  if (events.length > 0) {
    return events.map((ev: CalendarDayPreview) =>
      dayFromPreviewFields(
        ev.plan_title || preview.plan_title,
        ev.plan_event_at,
        ev.plan_event_end_at,
        ev.location ?? preview.location,
        ev.timeline,
      ),
    );
  }
  return [
    dayFromPreviewFields(
      preview.plan_title,
      preview.plan_event_at,
      preview.plan_event_end_at,
      preview.location,
      preview.timeline,
    ),
  ];
}

function formatDayTabLabel(day: DayDraft, index: number): string {
  if (day.startDate) {
    const [y, m, d] = day.startDate.split('-');
    return `${Number(d)}/${Number(m)}`;
  }
  return `Ngày ${index + 1}`;
}

function cleanedSlotsFromDay(day: DayDraft): TimelineSlotPreview[] {
  if (!day.includeTimeline) return [];
  return day.slots
    .filter((s) => TIME_RE.test(s.start) && s.title.trim())
    .map((s) => ({
      start: s.start,
      end: s.end && TIME_RE.test(s.end) ? s.end : null,
      title: s.title.trim(),
    }));
}

export default function CalendarPlanPreviewModal({
  preview,
  onClose,
  onSaved,
  eventId,
  onReExtract,
  reExtracting = false,
}: Props) {
  const toast = useToast();
  const isSingleEventEdit = Boolean(eventId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [includeInCalendar, setIncludeInCalendar] = useState(true);
  const [days, setDays] = useState<DayDraft[]>(() => buildInitialDays(preview));
  const [activeDay, setActiveDay] = useState(0);

  const applyPreview = (next: CalendarPreviewPayload) => {
    const built = buildInitialDays(next);
    if (isSingleEventEdit && built.length > 1) {
      // Prefer day matching current edit date when Trích lại returns multiple days
      const current = days[0]?.startDate;
      const matchIdx = current
        ? built.findIndex((d) => d.startDate === current)
        : -1;
      setDays([built[matchIdx >= 0 ? matchIdx : 0]]);
    } else {
      setDays(built);
    }
    setActiveDay(0);
    setError('');
  };

  const updateActiveDay = (patch: Partial<DayDraft>) => {
    setDays((prev) =>
      prev.map((day, i) => (i === activeDay ? { ...day, ...patch } : day)),
    );
  };

  const updateSlot = (index: number, patch: Partial<SlotRow>) => {
    setDays((prev) =>
      prev.map((day, i) => {
        if (i !== activeDay) return day;
        return {
          ...day,
          slots: day.slots.map((slot, si) => (si === index ? { ...slot, ...patch } : slot)),
        };
      }),
    );
  };

  const removeSlot = (index: number) => {
    setDays((prev) =>
      prev.map((day, i) => {
        if (i !== activeDay) return day;
        return { ...day, slots: day.slots.filter((_, si) => si !== index) };
      }),
    );
  };

  const addSlot = () => {
    setDays((prev) =>
      prev.map((day, i) => {
        if (i !== activeDay) return day;
        return { ...day, slots: [...day.slots, { start: '', end: null, title: '' }] };
      }),
    );
  };

  const handleReExtractClick = async () => {
    if (!onReExtract || saving || reExtracting) return;
    setError('');
    try {
      const result = await onReExtract();
      if (result) applyPreview(result);
    } catch {
      setError('Trích lại thất bại. Vui lòng thử lại.');
    }
  };

  const handleSave = async () => {
    setError('');

    if (!includeInCalendar) {
      const msg = isSingleEventEdit
        ? 'Ngày này sẽ bị BỎ khỏi Lịch hoạt động. Tiếp tục?'
        : 'Kế hoạch này sẽ KHÔNG hiện trên Lịch hoạt động. Tiếp tục?';
      if (!confirm(msg)) return;
    } else {
      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        if (!day.title.trim()) {
          setActiveDay(i);
          setError(`Ngày ${i + 1}: cần có tiêu đề sự kiện.`);
          return;
        }
        if (!day.startDate) {
          setActiveDay(i);
          setError(`Ngày ${i + 1}: cần chọn ngày bắt đầu.`);
          return;
        }
        if (day.endDate && day.endDate < day.startDate) {
          setActiveDay(i);
          setError(`Ngày ${i + 1}: ngày kết thúc không được trước ngày bắt đầu.`);
          return;
        }
        if (day.includeTimeline) {
          const invalid = day.slots.filter((s) => !TIME_RE.test(s.start) || !s.title.trim());
          if (invalid.length > 0) {
            setActiveDay(i);
            setError(`Ngày ${i + 1}: còn ${invalid.length} mốc thiếu giờ hoặc nội dung.`);
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      if (isSingleEventEdit) {
        const day = days[0];
        const payload: PlanEventConfirmPayload = {
          event_id: eventId!,
          include_in_calendar: includeInCalendar,
          title: day.title.trim() || undefined,
          starts_at: joinDateTime(day.startDate, day.startTime),
          ends_at: day.endDate
            ? joinDateTime(day.endDate, day.endTime)
            : day.endTime
              ? joinDateTime(day.startDate, day.endTime)
              : null,
          location: day.location.trim() || null,
          timeline: cleanedSlotsFromDay(day),
        };
        await documentsApi.confirmPlanEvent(preview.document_id, payload);
      } else if (days.length > 1) {
        await documentsApi.confirmPlanEvent(preview.document_id, {
          include_in_calendar: includeInCalendar,
          title: days[0]?.title.trim() || preview.plan_title || undefined,
          events: includeInCalendar
            ? days.map((day) => ({
                title: day.title.trim(),
                starts_at: joinDateTime(day.startDate, day.startTime),
                ends_at: day.endDate
                  ? joinDateTime(day.endDate, day.endTime)
                  : day.endTime
                    ? joinDateTime(day.startDate, day.endTime)
                    : null,
                location: day.location.trim() || null,
                timeline: cleanedSlotsFromDay(day),
              }))
            : undefined,
        });
      } else {
        const day = days[0];
        await documentsApi.confirmPlanEvent(preview.document_id, {
          include_in_calendar: includeInCalendar,
          title: day.title.trim() || undefined,
          starts_at: joinDateTime(day.startDate, day.startTime),
          ends_at: day.endDate
            ? joinDateTime(day.endDate, day.endTime)
            : day.endTime
              ? joinDateTime(day.startDate, day.endTime)
              : null,
          location: day.location.trim() || null,
          timeline: cleanedSlotsFromDay(day),
        });
      }
      toast.success(
        includeInCalendar ? 'Đã cập nhật Lịch hoạt động' : 'Đã bỏ khỏi Lịch hoạt động',
      );
      onSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Không thể lưu sự kiện lên Lịch hoạt động.');
      toast.apiError(err, 'Lưu lịch hoạt động thất bại');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-50 disabled:text-gray-400';
  const fieldsDisabled = saving || reExtracting || !includeInCalendar;
  const day = days[activeDay] || days[0];
  const multiDay = !isSingleEventEdit && days.length > 1;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {isSingleEventEdit
                ? 'Chỉnh lịch trình ngày đang chọn'
                : 'Duyệt và chỉnh lịch trình trước khi lưu'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate" title={preview.plan_title || undefined}>
              {preview.plan_title || `Tài liệu #${preview.document_id}`}
              {multiDay ? ` · ${days.length} ngày` : ''}
            </p>
          </div>
          {preview.document_id ? (
            <button
              type="button"
              onClick={() => void documentsApi.openPreview(preview.document_id)}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50"
            >
              Xem tài liệu
            </button>
          ) : null}
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInCalendar}
              onChange={(e) => setIncludeInCalendar(e.target.checked)}
              disabled={saving || reExtracting}
              className="mt-0.5 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">
                {isSingleEventEdit
                  ? 'Giữ ngày này trên Lịch hoạt động'
                  : 'Đưa kế hoạch lên Lịch hoạt động'}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {isSingleEventEdit
                  ? 'Bỏ chọn để xóa chỉ ngày đang sửa khỏi lịch (các ngày khác của tài liệu vẫn giữ).'
                  : 'Bỏ chọn nếu trích xuất sai hoặc kế hoạch này không cần hiện trên lịch BGH. Sự kiện đã lưu trước đó của tài liệu sẽ được xóa khỏi lịch.'}
              </span>
            </span>
          </label>

          {preview.needs_review && includeInCalendar && !day?.startDate && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Không tìm thấy ngày/giờ trong file — hãy nhập ngày bắt đầu bên dưới, hoặc bỏ chọn đưa
              lên Lịch hoạt động.
            </p>
          )}

          {multiDay && (
            <div className="flex flex-wrap gap-1.5">
              {days.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveDay(i)}
                  disabled={saving || reExtracting}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
                    i === activeDay
                      ? 'bg-primary-50 text-primary-800 border-primary-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {formatDayTabLabel(d, i)}
                </button>
              ))}
            </div>
          )}

          {day && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề sự kiện *</label>
                <input
                  type="text"
                  value={day.title}
                  onChange={(e) => updateActiveDay({ title: e.target.value })}
                  disabled={fieldsDisabled}
                  className={fieldClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu *</label>
                  <input
                    type="date"
                    value={day.startDate}
                    onChange={(e) => updateActiveDay({ startDate: e.target.value })}
                    disabled={fieldsDisabled}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giờ bắt đầu</label>
                  <input
                    type="time"
                    value={day.startTime}
                    onChange={(e) => updateActiveDay({ startTime: e.target.value })}
                    disabled={fieldsDisabled}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                  <input
                    type="date"
                    value={day.endDate}
                    onChange={(e) => updateActiveDay({ endDate: e.target.value })}
                    disabled={fieldsDisabled}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giờ kết thúc</label>
                  <input
                    type="time"
                    value={day.endTime}
                    onChange={(e) => updateActiveDay({ endTime: e.target.value })}
                    disabled={fieldsDisabled}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa điểm</label>
                <input
                  type="text"
                  value={day.location}
                  onChange={(e) => updateActiveDay({ location: e.target.value })}
                  disabled={fieldsDisabled}
                  placeholder="VD: Hội trường A, sân trường..."
                  className={fieldClass}
                />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={day.includeTimeline}
                    onChange={(e) => updateActiveDay({ includeTimeline: e.target.checked })}
                    disabled={fieldsDisabled}
                    className="mt-0.5 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900">Kèm lịch trình trong ngày</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Bỏ chọn nếu các mốc giờ trích sai — sự kiện vẫn lên lịch nhưng không có lịch trình.
                    </span>
                  </span>
                </label>

                {day.includeTimeline && (
                  <div className="mt-3 space-y-2">
                    {day.slots.length === 0 ? (
                      <p className="text-sm text-gray-500 italic border border-dashed border-gray-200 rounded-lg px-4 py-5 text-center">
                        Chưa có mốc nào — bấm «Thêm mốc giờ» để nhập tay.
                      </p>
                    ) : (
                      day.slots.map((slot, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-[1fr_1fr] sm:grid-cols-[110px_110px_1fr_auto] gap-2 items-end border border-gray-100 rounded-lg p-2.5"
                        >
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-0.5">Bắt đầu *</label>
                            <input
                              type="time"
                              value={slot.start}
                              onChange={(e) => updateSlot(index, { start: e.target.value })}
                              disabled={fieldsDisabled}
                              className={fieldClass}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-0.5">Kết thúc</label>
                            <input
                              type="time"
                              value={slot.end || ''}
                              onChange={(e) => updateSlot(index, { end: e.target.value || null })}
                              disabled={fieldsDisabled}
                              className={fieldClass}
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-[11px] text-gray-400 mb-0.5">Nội dung *</label>
                            <input
                              type="text"
                              value={slot.title}
                              onChange={(e) => updateSlot(index, { title: e.target.value })}
                              disabled={fieldsDisabled}
                              maxLength={60}
                              className={fieldClass}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSlot(index)}
                            disabled={fieldsDisabled}
                            className="col-span-2 sm:col-span-1 px-2 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          >
                            Bỏ mốc
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={addSlot}
                      disabled={fieldsDisabled}
                      className="text-sm font-medium text-primary-700 hover:bg-primary-50 border border-dashed border-primary-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                      + Thêm mốc giờ
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="mx-5 mb-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 shrink-0">
            {error}
          </p>
        )}

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {onReExtract ? (
            <button
              type="button"
              onClick={handleReExtractClick}
              disabled={saving || reExtracting}
              title="Trích lại từ tài liệu vào form — chưa lưu cho đến khi bấm Lưu"
              className="px-3 py-2 text-sm font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50"
            >
              {reExtracting ? 'Đang trích...' : 'Trích lại'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap justify-end gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || reExtracting}
              className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || reExtracting}
              className={`px-3.5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
                includeInCalendar ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-700 hover:bg-gray-800'
              }`}
            >
              {saving
                ? 'Đang lưu...'
                : includeInCalendar
                  ? 'Lưu lên Lịch hoạt động'
                  : isSingleEventEdit
                    ? 'Bỏ ngày khỏi lịch'
                    : 'Bỏ khỏi Lịch hoạt động'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
