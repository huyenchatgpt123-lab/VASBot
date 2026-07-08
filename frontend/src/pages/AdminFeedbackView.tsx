import { useState, useEffect } from 'react';
import { feedbackApi, FeedbackItem } from '../api/feedback';

export default function AdminFeedbackView() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedbacks();
  }, [statusFilter]);

  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await feedbackApi.getAll(statusFilter || undefined);
      setFeedbacks(res.feedbacks);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await feedbackApi.markRead(id);
      await loadFeedbacks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể cập nhật');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý góp ý từ người dùng</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Tất cả</option>
          <option value="new">Chưa đọc</option>
          <option value="read">Đã đọc</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Đang tải...</div>
        ) : feedbacks.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Không có feedback nào</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {feedbacks.map((fb) => (
              <div key={fb.id} className={`px-5 py-4 ${fb.status === 'new' ? 'bg-blue-50/50' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{fb.user_name}</span>
                      <span className="text-xs text-gray-400">{fb.user_email}</span>
                      {fb.status === 'new' && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Mới</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{fb.content}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(fb.created_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  {fb.status === 'new' && (
                    <button
                      onClick={() => handleMarkRead(fb.id)}
                      className="shrink-0 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-white"
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
