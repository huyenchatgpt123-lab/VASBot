import { useState, useEffect, useRef } from 'react';
import { feedbackApi, FeedbackItem, formatFileSize } from '../api/feedback';

const MAX_FILES = 5;
const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.m4v';

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    /\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)$/.test(name)
    || file.type.startsWith('image/')
    || file.type.startsWith('video/')
  );
}

function FeedbackAttachments({
  feedbackId,
  attachments,
}: {
  feedbackId: number;
  attachments?: FeedbackItem['attachments'];
}) {
  if (!attachments?.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {attachments.map((a) => {
        const isMedia = (a.content_type || '').startsWith('image/') || (a.content_type || '').startsWith('video/')
          || /\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)$/i.test(a.filename);
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-700 truncate max-w-[220px]" title={a.filename}>
              📎 {a.filename}
            </span>
            <span className="text-gray-400">{formatFileSize(a.size_bytes)}</span>
            {isMedia && (
              <button
                type="button"
                onClick={() => feedbackApi.openAttachment(feedbackId, a.id).catch(() => alert('Không mở được file'))}
                className="text-primary-600 hover:underline font-medium"
              >
                Xem
              </button>
            )}
            <button
              type="button"
              onClick={() => feedbackApi.downloadAttachment(feedbackId, a.id, a.filename).catch(() => alert('Không tải được file'))}
              className="text-primary-600 hover:underline font-medium"
            >
              Tải
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function UserFeedbackView() {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFeedbacks();
  }, []);

  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await feedbackApi.getMine();
      setFeedbacks(res.feedbacks);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setFileError('');
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!isAllowedFile(file)) {
        setFileError(`«${file.name}» không hỗ trợ — chỉ ảnh hoặc video.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setFileError(`«${file.name}» vượt 50MB.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileError(`Tối đa ${MAX_FILES} file minh chứng.`);
        break;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
      next.push(file);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setFileError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setFileError('');
    try {
      await feedbackApi.create(content.trim(), files);
      setContent('');
      setFiles([]);
      await loadFeedbacks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể gửi feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
        <p className="text-sm text-gray-500 mt-1">Gửi góp ý hoặc báo lỗi cho Admin</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Nội dung feedback *</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 min-h-[120px]"
          placeholder="Mô tả vấn đề hoặc góp ý của bạn..."
          maxLength={2000}
        />

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            File minh chứng <span className="font-normal text-gray-400">(tuỳ chọn)</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Ảnh hoặc video · tối đa {MAX_FILES} file · mỗi file ≤ 50MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
            onChange={(e) => addFiles(e.target.files)}
            disabled={submitting}
          />
          {fileError && <p className="mt-1.5 text-xs text-red-600">{fileError}</p>}
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <span className="truncate flex-1 min-w-0">{f.name}</span>
                  <span className="text-gray-400 shrink-0">{formatFileSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={submitting}
                    className="text-red-600 hover:underline shrink-0"
                  >
                    Xóa
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-between items-center mt-3">
          <span className="text-xs text-gray-400">{content.length}/2000</span>
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Đang gửi...' : 'Gửi feedback'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-800">Lịch sử feedback của bạn</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Đang tải...</div>
        ) : feedbacks.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Chưa có feedback nào</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {feedbacks.map((fb) => (
              <div key={fb.id} className="px-4 sm:px-5 py-4">
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{fb.content}</p>
                <FeedbackAttachments feedbackId={fb.id} attachments={fb.attachments} />
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(fb.created_at).toLocaleString('vi-VN')}
                  {fb.status === 'read' && <span className="ml-2 text-green-600">· Admin đã xem</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
