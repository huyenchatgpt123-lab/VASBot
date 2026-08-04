import { useState } from 'react';
import { documentsApi, CalendarPreviewPayload, TimelineSlotPreview } from '../api/documents';

type Props = {
  preview: CalendarPreviewPayload;
  onClose: () => void;
  onSaved: () => void;
};

type SlotRow = TimelineSlotPreview & { end: string | null };

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

export default function CalendarPlanPreviewModal({ preview, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const initialStart = splitDateTime(preview.plan_event_at);
  const initialEnd = splitDateTime(preview.plan_event_end_at);

  const [includeInCalendar, setIncludeInCalendar] = useState(true);
  const [title, setTitle] = useState(preview.plan_title?.trim() || '');
  const [startDate, setStartDate] = useState(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [location, setLocation] = useState(preview.location?.trim() || '');

  const extractedSlots: SlotRow[] = (Array.isArray(preview.timeline) ? preview.timeline : []).map(
    (slot) => ({ start: slot.start, end: slot.end ?? null, title: slot.title }),
  );
  const [slots, setSlots] = useState<SlotRow[]>(extractedSlots);
  const [includeTimeline, setIncludeTimeline] = useState(extractedSlots.length > 0);

  const updateSlot = (index: number, patch: Partial<SlotRow>) => {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const addSlot = () => {
    setSlots((prev) => [...prev, { start: '', end: null, title: '' }]);
  };

  const handleSave = async () => {
    setError('');

    if (!includeInCalendar) {
      if (!confirm('Kế hoạch này sẽ KHÔNG hiện trên Lịch hoạt động. Tiếp tục?')) return;
    } else {
      if (!title.trim()) {
        setError('Cần có tiêu đề sự kiện.');
        return;
      }
      if (!startDate) {
        setError('Cần chọn ngày bắt đầu để đưa kế hoạch lên Lịch hoạt động.');
        return;
      }
      if (endDate && endDate < startDate) {
        setError('Ngày kết thúc không được trước ngày bắt đầu.');
        return;
      }
      if (includeTimeline) {
        const invalid = slots.filter((s) => !TIME_RE.test(s.start) || !s.title.trim());
        if (invalid.length > 0) {
          setError(`Còn ${invalid.length} mốc lịch trình thiếu giờ bắt đầu hoặc nội dung.`);
          return;
        }
      }
    }

    const cleanedSlots = includeTimeline
      ? slots
          .filter((s) => TIME_RE.test(s.start) && s.title.trim())
          .map((s) => ({
            start: s.start,
            end: s.end && TIME_RE.test(s.end) ? s.end : null,
            title: s.title.trim(),
          }))
      : [];

    setSaving(true);
    try {
      await documentsApi.confirmPlanEvent(preview.document_id, {
        include_in_calendar: includeInCalendar,
        title: title.trim() || undefined,
        starts_at: joinDateTime(startDate, startTime),
        ends_at: endDate ? joinDateTime(endDate, endTime) : endTime ? joinDateTime(startDate, endTime) : null,
        location: location.trim() || null,
        timeline: cleanedSlots,
      });
      onSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Không thể lưu sự kiện lên Lịch hoạt động.');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-gray-50 disabled:text-gray-400';
  const fieldsDisabled = saving || !includeInCalendar;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Duyệt và chỉnh lịch trình trước khi lưu</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate" title={preview.plan_title || undefined}>
              {preview.plan_title || `Tài liệu #${preview.document_id}`}
            </p>
          </div>
          {preview.document_id ? (
            <button
              type="button"
              onClick={() => window.open(documentsApi.getPreviewUrl(preview.document_id), '_blank')}
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
              disabled={saving}
              className="mt-0.5 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">Đưa kế hoạch lên Lịch hoạt động</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Bỏ chọn nếu trích xuất sai hoặc kế hoạch này không cần hiện trên lịch BGH. Sự kiện đã
                lưu trước đó của tài liệu sẽ được xóa khỏi lịch.
              </span>
            </span>
          </label>

          {preview.needs_review && includeInCalendar && !startDate && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Không tìm thấy ngày/giờ trong file — hãy nhập ngày bắt đầu bên dưới, hoặc bỏ chọn đưa
              lên Lịch hoạt động.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề sự kiện *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={fieldsDisabled}
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={fieldsDisabled}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giờ bắt đầu</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={fieldsDisabled}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={fieldsDisabled}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giờ kết thúc</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={fieldsDisabled}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Địa điểm</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={fieldsDisabled}
              placeholder="VD: Hội trường A, sân trường..."
              className={fieldClass}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTimeline}
                onChange={(e) => setIncludeTimeline(e.target.checked)}
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

            {includeTimeline && (
              <div className="mt-3 space-y-2">
                {slots.length === 0 ? (
                  <p className="text-sm text-gray-500 italic border border-dashed border-gray-200 rounded-lg px-4 py-5 text-center">
                    Chưa có mốc nào — bấm «Thêm mốc giờ» để nhập tay.
                  </p>
                ) : (
                  slots.map((slot, index) => (
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
        </div>

        {error && (
          <p className="mx-5 mb-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 shrink-0">
            {error}
          </p>
        )}

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-3.5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
              includeInCalendar ? 'bg-primary-600 hover:bg-primary-700' : 'bg-gray-700 hover:bg-gray-800'
            }`}
          >
            {saving
              ? 'Đang lưu...'
              : includeInCalendar
                ? 'Lưu lên Lịch hoạt động'
                : 'Bỏ khỏi Lịch hoạt động'}
          </button>
        </div>
      </div>
    </div>
  );
}
