import { useState, useEffect } from 'react';
import { feedbackApi, FeedbackItem } from '../api/feedback';

export default function UserFeedbackView() {
  const [content, setContent] = useState('');
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await feedbackApi.create(content.trim());
      setContent('');
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
              <div key={fb.id} className="px-5 py-4">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{fb.content}</p>
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
