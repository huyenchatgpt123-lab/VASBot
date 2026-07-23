import { useState, useEffect, useMemo } from 'react';
import { adminApi } from '../api/admin';
import { DashboardStats, ActivityData, OpenAILineItemCost } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COST_CHART_COLORS = [
  '#2563eb',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#64748b',
];

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
  const lower = label.toLowerCase();
  const map: Record<string, string> = {
    'chat completions': 'Chat (GPT)',
    embeddings: 'Embedding',
    'image generation': 'Tạo ảnh',
    'audio transcriptions': 'Chuyển giọng nói',
    'audio speeches': 'Text-to-speech',
  };
  if (map[lower]) return map[lower];
  if (lower.includes('embedding')) return 'Embedding';
  if (lower.includes('image')) return 'Tạo ảnh';
  if (lower.includes('audio') && lower.includes('transcription')) return 'Chuyển giọng nói';
  if (lower.includes('audio') || lower.includes('speech') || lower.includes('tts')) return 'Text-to-speech';
  if (lower.includes('chat') || lower.includes('gpt') || lower.includes('completion')) return 'Chat (GPT)';
  return label;
}

/** Group OpenAI line items into readable categories, keep top N, merge rest as "Khác". */
function summarizeCostItems(items: OpenAILineItemCost[], topN = 6) {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const name = formatLineItem(item.line_item);
    grouped.set(name, (grouped.get(name) ?? 0) + item.cost_usd);
  }

  const sorted = [...grouped.entries()]
    .map(([name, cost_usd]) => ({ name, cost_usd }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const total = sorted.reduce((sum, row) => sum + row.cost_usd, 0);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const restTotal = rest.reduce((sum, row) => sum + row.cost_usd, 0);

  const rows =
    restTotal > 0
      ? [...top, { name: `Khác (${rest.length} khoản)`, cost_usd: restTotal }]
      : top;

  return rows.map((row, index) => ({
    ...row,
    pct: total > 0 ? (row.cost_usd / total) * 100 : 0,
    color: COST_CHART_COLORS[index % COST_CHART_COLORS.length],
  }));
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

  const costBreakdown = useMemo(
    () => summarizeCostItems(stats?.openai_line_items ?? []),
    [stats?.openai_line_items],
  );

  const usdToVnd =
    stats?.openai_cost_usd && stats.openai_cost_usd > 0
      ? stats.openai_cost_vnd / stats.openai_cost_usd
      : 25000;

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
        <StatCard
          label="Chi phí OpenAI"
          value={`$${(stats?.openai_cost_usd ?? 0).toFixed(2)}`}
          icon="💰"
          color="bg-yellow-100"
        />
      </div>

      {/* OpenAI cost section — separated for readability */}
      <div className="mb-8 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Chi phí OpenAI</h2>
            <p className="text-sm text-gray-500 mt-1">
              ${(stats?.openai_cost_usd ?? 0).toFixed(4)}
              <span className="text-gray-400"> · </span>
              ≈ {formatVnd(stats?.openai_cost_vnd ?? 0)} ₫
              <span className="text-gray-400"> · </span>
              {stats?.openai_cost_source === 'openai_billing'
                ? 'Theo hóa đơn OpenAI'
                : 'Ước tính nội bộ (embedding)'}
            </p>
            {stats?.openai_cost_synced_at && (
              <p className="text-xs text-gray-400 mt-1">
                Cập nhật lần cuối: {formatSyncedAt(stats.openai_cost_synced_at)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefreshOpenaiCosts}
            disabled={refreshingCosts}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-100 text-yellow-900 hover:bg-yellow-200 disabled:opacity-50 transition-colors"
          >
            {refreshingCosts ? 'Đang cập nhật...' : 'Cập nhật chi phí'}
          </button>
        </div>

        {refreshMessage && (
          <p className={`text-xs mb-4 ${refreshMessage.ok ? 'text-green-700' : 'text-red-600'}`}>
            {refreshMessage.text}
          </p>
        )}
        {stats?.openai_cost_note && (
          <p className="text-xs text-amber-600 mb-4">{stats.openai_cost_note}</p>
        )}

        {costBreakdown.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={costBreakdown}
                    dataKey="cost_usd"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {costBreakdown.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string) => [
                      `$${Number(value).toFixed(4)}`,
                      'Chi phí',
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-2 font-medium">Khoản mục</th>
                    <th className="pb-2 font-medium text-right">USD</th>
                    <th className="pb-2 font-medium text-right">VND</th>
                    <th className="pb-2 font-medium text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {costBreakdown.map((row) => (
                    <tr key={row.name} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-gray-800">{row.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-medium text-gray-900 tabular-nums">
                        ${row.cost_usd.toFixed(4)}
                      </td>
                      <td className="py-2.5 text-right text-gray-600 tabular-nums">
                        {formatVnd(row.cost_usd * usdToVnd)} ₫
                      </td>
                      <td className="py-2.5 text-right text-gray-500 tabular-nums">
                        {row.pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">
            Chưa có chi tiết khoản mục. Nhấn «Cập nhật chi phí» để đồng bộ từ OpenAI.
          </p>
        )}
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
