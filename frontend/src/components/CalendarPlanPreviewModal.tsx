import { useState } from 'react';
import { documentsApi, CalendarPreviewPayload, TimelineSlotPreview } from '../api/documents';

type Props = {
  preview: CalendarPreviewPayload;
  onClose: () => void;
  onSaved: () => void;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSlotRange(slot: TimelineSlotPreview): string {
  if (slot.end) return `${slot.start} – ${slot.end}`;
  return slot.start;
}

export default function CalendarPlanPreviewModal({ preview, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const timeline = Array.isArray(preview.timeline) ? preview.timeline : [];
  const emptyTimeline = timeline.length === 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await documentsApi.confirmPlanEvent(preview.document_id, {
        title: preview.plan_title || undefined,
        starts_at: preview.plan_event_at || null,
        ends_at: preview.plan_event_end_at || null,
        location: preview.location || null,
        timeline: emptyTimeline ? [] : timeline,
      });
      onSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detail || 'Không thể lưu sự kiện lên Thời gian biểu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Duyệt lịch trình trước khi lưu</h2>
          <p className="text-sm text-gray-500 mt-0.5 truncate" title={preview.plan_title || undefined}>
            {preview.plan_title || `Tài liệu #${preview.document_id}`}
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Bắt đầu</p>
              <p className="font-medium text-gray-900 mt-0.5">{formatDateTime(preview.plan_event_at)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Kết thúc</p>
              <p className="font-medium text-gray-900 mt-0.5">{formatDateTime(preview.plan_event_end_at)}</p>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Địa điểm</p>
            <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">
              {preview.location?.trim() || '—'}
            </p>
          </div>

          {preview.needs_review && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Chưa tìm thấy ngày/giờ rõ — sự kiện sẽ được đánh dấu cần cập nhật sau khi lưu.
            </p>
          )}

          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">Lịch trình trong ngày</p>
            {emptyTimeline ? (
              <p className="text-sm text-gray-500 italic border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
                Không có lịch trình
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {timeline.map((slot, idx) => (
                  <li key={`${slot.start}-${idx}`} className="flex gap-3 px-3 py-2.5 bg-white text-sm">
                    <span className="shrink-0 w-28 tabular-nums font-semibold text-primary-700">
                      {formatSlotRange(slot)}
                    </span>
                    <span className="text-gray-800 leading-snug">{slot.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
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
            className="px-3.5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu lên Thời gian biểu'}
          </button>
        </div>
      </div>
    </div>
  );
}
