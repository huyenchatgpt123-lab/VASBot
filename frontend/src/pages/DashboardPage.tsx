import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import { DashboardStats, ActivityData } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

type PresetKey = '7d' | '30d' | '3m' | '6m' | '1y';

const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: '7d', label: '7 ngày', days: 7 },
  { key: '30d', label: '30 ngày', days: 30 },
  { key: '3m', label: '3 tháng', days: 90 },
  { key: '6m', label: '6 tháng', days: 180 },
  { key: '1y', label: '1 năm', days: 365 },
];

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getPresetDates(days: number): { start_date: string; end_date: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start_date: formatDate(start), end_date: formatDate(end) };
}

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
}

function formatLineItem(label: string): string {
  const map: Record<string, string> = {
    'chat completions': 'Chat (GPT)',
    embeddings: 'Embedding',
    'image generation': 'Tạo ảnh',
    'audio transcriptions': 'Chuyển giọng nói',
    'audio speeches': 'Text-to-speech',
  };
  return map[label.toLowerCase()] ?? label;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingCosts, setRefreshingCosts] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [activePreset, setActivePreset] = useState<PresetKey | 'custom'>('30d');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return formatDate(d);
  });
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));

  useEffect(() => {
    loadDashboard();
  }, [startDate, endDate]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getDashboard({ start_date: startDate, end_date: endDate });
      setStats(data.stats);
      setActivity(data.activity);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const handlePreset = (preset: typeof PRESETS[number]) => {
    setActivePreset(preset.key);
    const { start_date, end_date } = getPresetDates(preset.days);
    setStartDate(start_date);
    setEndDate(end_date);
  };

  const handleCustomDate = (field: 'start' | 'end', value: string) => {
    setActivePreset('custom');
    if (field === 'start') setStartDate(value);
    else setEndDate(value);
  };

  const handleRefreshOpenaiCosts = async () => {
    setRefreshingCosts(true);
    setRefreshMessage(null);
    try {
      const result = await adminApi.refreshOpenaiCosts();
      setRefreshMessage({ text: result.message, ok: result.ok });
      await loadDashboard();
    } catch {
      setRefreshMessage({ text: 'Không thể cập nhật chi phí OpenAI. Vui lòng thử lại.', ok: false });
    } finally {
      setRefreshingCosts(false);
    }
  };

  const formatSyncedAt = (iso?: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch {
      return iso;
    }
  };

  if (loading && !stats) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Thống kê hoạt động hệ thống</p>
      </div>

      {/* Time Filter */}
      <div className="mb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                activePreset === p.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-2">
          <span className="text-sm text-gray-500">Từ:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleCustomDate('start', e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <span className="text-sm text-gray-500">Đến:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleCustomDate('end', e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
        {loading && <span className="text-xs text-gray-400 ml-2">Đang tải...</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Tài liệu" value={stats?.total_documents ?? 0} icon="📄" color="bg-blue-100" />
        <StatCard label="Tổng số trang" value={stats?.total_pages ?? 0} icon="📑" color="bg-indigo-100" />
        <StatCard label="Người dùng" value={stats?.total_users ?? 0} icon="👥" color="bg-green-100" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500">Chi phí OpenAI</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ${(stats?.openai_cost_usd ?? 0).toFixed(4)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                ≈ {formatVnd(stats?.openai_cost_vnd ?? 0)} ₫
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {stats?.openai_cost_source === 'openai_billing'
                  ? 'Theo hóa đơn OpenAI · trong khoảng thời gian đã chọn'
                  : 'Ước tính nội bộ (embedding) · trong khoảng thời gian đã chọn'}
              </p>
              {stats?.openai_cost_synced_at && (
                <p className="text-xs text-gray-400 mt-1">
                  Cập nhật lần cuối: {formatSyncedAt(stats.openai_cost_synced_at)}
                </p>
              )}
              <button
                type="button"
                onClick={handleRefreshOpenaiCosts}
                disabled={refreshingCosts}
                className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-100 text-yellow-900 hover:bg-yellow-200 disabled:opacity-50 transition-colors"
              >
                {refreshingCosts ? 'Đang cập nhật...' : 'Cập nhật chi phí OpenAI'}
              </button>
              {refreshMessage && (
                <p className={`text-xs mt-2 ${refreshMessage.ok ? 'text-green-700' : 'text-red-600'}`}>
                  {refreshMessage.text}
                </p>
              )}
              {stats?.openai_cost_note && (
                <p className="text-xs text-amber-600 mt-2">{stats.openai_cost_note}</p>
              )}
              {stats?.openai_line_items && stats.openai_line_items.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {stats.openai_line_items.map((item) => (
                    <li key={item.line_item} className="flex justify-between text-xs text-gray-500 gap-4">
                      <span>{formatLineItem(item.line_item)}</span>
                      <span className="font-medium text-gray-700">${item.cost_usd.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl bg-yellow-100 shrink-0">
              💰
            </div>
          </div>
        </div>
      </div>

      {stats?.cloudinary && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Cloudinary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              label="Dung lượng lưu trữ"
              value={formatStorageBytes(stats.cloudinary.storage_bytes)}
              icon="☁️"
              color="bg-sky-100"
            />
            <StatCard
              label="Số file tài liệu"
              value={stats.cloudinary.file_count}
              icon="📦"
              color="bg-cyan-100"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">Thống kê thư mục vabot/documents trên Cloudinary</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tài liệu tải lên theo ngày</h2>
        {activity.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={activity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="documents" name="Tài liệu" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-12">Chưa có dữ liệu hoạt động trong khoảng thời gian này.</p>
        )}
      </div>
    </div>
  );
}
