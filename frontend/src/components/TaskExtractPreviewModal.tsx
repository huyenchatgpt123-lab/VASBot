import { useEffect, useMemo, useState } from 'react';
import { tasksApi, TaskExtractResult, TaskUser } from '../api/tasks';
import { useAuth } from '../context/AuthContext';

export type PreviewTaskRow = {
  title: string;
  assignee_name: string;
  assignee_id: number | null;
  match_confidence?: string | null;
  match_candidate_count?: number;
  deadline: string | null;
  has_scheduled_time?: boolean;
  note?: string | null;
};

type Props = {
  preview: TaskExtractResult;
  onClose: () => void;
  onSaved: () => void;
};

type MatchBadge = { label: string; className: string; hint: string; needsReview: boolean };

const MATCH_BADGES: Record<string, MatchBadge> = {
  manual: {
    label: '✓ bạn đã chọn',
    className: 'text-green-700 bg-green-50 border-green-200',
    hint: 'Bạn tự chọn tài khoản này',
    needsReview: false,
  },
  exact: {
    label: '✓ khớp họ tên',
    className: 'text-green-700 bg-green-50 border-green-200',
    hint: 'Trùng đầy đủ họ tên trong tài khoản',
    needsReview: false,
  },
  nickname: {
    label: '✓ khớp biệt danh',
    className: 'text-green-700 bg-green-50 border-green-200',
    hint: 'Trùng biệt danh đã đặt cho tài khoản',
    needsReview: false,
  },
  given_name: {
    label: '✓ khớp tên gọi',
    className: 'text-blue-700 bg-blue-50 border-blue-200',
    hint: 'Kế hoạch ghi tên gọi (không có họ) và chỉ một người trùng',
    needsReview: false,
  },
  last_name: {
    label: '~ khớp tên gọi 1 chữ',
    className: 'text-blue-700 bg-blue-50 border-blue-200',
    hint: 'Kế hoạch chỉ ghi một chữ tên và chỉ có một người trùng — nên xác nhận lại',
    needsReview: true,
  },
  department: {
    label: '~ khớp theo tổ',
    className: 'text-amber-700 bg-amber-50 border-amber-200',
    hint: 'Nhiều người trùng tên, hệ thống chọn người thuộc tổ của kế hoạch',
    needsReview: true,
  },
  ambiguous: {
    label: '⚠ trùng tên',
    className: 'text-red-700 bg-red-50 border-red-200',
    hint: 'Có nhiều người cùng tên, cần bạn chọn đúng người',
    needsReview: true,
  },
};

const NO_MATCH_BADGE: MatchBadge = {
  label: '? chưa khớp',
  className: 'text-amber-700 bg-amber-50 border-amber-200',
  hint: 'Không tìm thấy tài khoản tương ứng',
  needsReview: true,
};

function matchBadge(row: PreviewTaskRow): MatchBadge {
  if (!row.assignee_id) {
    const ambiguous = row.match_confidence === 'ambiguous' ? MATCH_BADGES.ambiguous : null;
    return ambiguous || NO_MATCH_BADGE;
  }
  return MATCH_BADGES[row.match_confidence || ''] || MATCH_BADGES.exact;
}

function toDateInputValue(deadline: string | null | undefined): string {
  if (!deadline) return '';
  return deadline.slice(0, 10);
}

function matchesSearch(u: TaskUser, q: string): boolean {
  if (!q) return true;
  return (
    u.name.toLowerCase().includes(q) ||
    (u.nickname || '').toLowerCase().includes(q) ||
    (u.department || '').toLowerCase().includes(q)
  );
}

function sortByName(a: TaskUser, b: TaskUser): number {
  return a.name.localeCompare(b.name, 'vi');
}

export default function TaskExtractPreviewModal({ preview, onClose, onSaved }: Props) {
  const { user, canManageTasks, scopeAllDepartments } = useAuth();
  const leadDept = user?.department || '';
  const isTeamLead = canManageTasks && !scopeAllDepartments && !!leadDept;

  const [rows, setRows] = useState<PreviewTaskRow[]>(() =>
    (preview.tasks || []).map((t) => ({
      title: t.title || '',
      assignee_name: t.assignee_name || '',
      assignee_id: t.assignee_id ?? null,
      match_confidence: t.match_confidence ?? null,
      match_candidate_count: t.match_candidate_count ?? 0,
      deadline: t.deadline ?? null,
      has_scheduled_time: Boolean(t.has_scheduled_time),
      note: t.note ?? null,
    })),
  );
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showAllDepts, setShowAllDepts] = useState(!isTeamLead);
  const [saving, setSaving] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);

  useEffect(() => {
    tasksApi.getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const { myDeptUsers, otherDeptCount } = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const mine = users.filter((u) => u.department === leadDept).filter((u) => matchesSearch(u, q)).sort(sortByName);
    return {
      myDeptUsers: mine,
      otherDeptCount: users.filter((u) => u.department !== leadDept).length,
    };
  }, [users, userSearch, leadDept]);

  /** Admin / đã mở rộng: nhóm theo phòng ban */
  const groupedAllUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const map = new Map<string, TaskUser[]>();
    for (const u of users) {
      if (!matchesSearch(u, q)) continue;
      const dept = u.department || 'Chưa gán';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(u);
    }
    for (const list of map.values()) list.sort(sortByName);
    const entries = Array.from(map.entries()).sort((a, b) => {
      if (leadDept) {
        if (a[0] === leadDept) return -1;
        if (b[0] === leadDept) return 1;
      }
      return a[0].localeCompare(b[0], 'vi');
    });
    return entries;
  }, [users, userSearch, leadDept]);

  const unmatchedCount = rows.filter((r) => !r.assignee_id).length;
  const reviewCount = rows.filter((r) => r.assignee_id && matchBadge(r).needsReview).length;

  const updateRow = (index: number, patch: Partial<PreviewTaskRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const assignUser = (index: number, userId: number) => {
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    updateRow(index, { assignee_id: u.id, assignee_name: u.name, match_confidence: 'manual' });
  };

  /** Giữ option cho người đã chọn nếu đang thu gọn và họ thuộc tổ khác */
  const selectedOutsidePool = (assigneeId: number | null): TaskUser | null => {
    if (!assigneeId || !isTeamLead || showAllDepts) return null;
    const u = users.find((x) => x.id === assigneeId);
    if (!u || u.department === leadDept) return null;
    return u;
  };

  const handleSave = async () => {
    const cleaned = rows
      .map((r) => ({
        ...r,
        title: r.title.trim(),
        assignee_name: r.assignee_name.trim(),
      }))
      .filter((r) => r.title);

    if (cleaned.length === 0) {
      alert('Không còn công việc nào để lưu. Bỏ qua hoặc thêm lại từ file.');
      return;
    }

    if (cleaned.some((r) => !r.assignee_name)) {
      alert('Mỗi công việc cần có tên người được giao.');
      return;
    }

    const risky = cleaned.filter((r) => !r.assignee_id || matchBadge(r).needsReview);
    if (risky.length > 0) {
      const names = risky.slice(0, 5).map((r) => `• ${r.assignee_name}`).join('\n');
      const more = risky.length > 5 ? `\n… và ${risky.length - 5} dòng khác` : '';
      const ok = confirm(
        `${risky.length} công việc chưa chắc gán đúng người:\n${names}${more}\n\n` +
          'OK = vẫn lưu\nCancel = quay lại chọn tài khoản',
      );
      if (!ok) return;
    }

    if (preview.has_duplicates && !replaceMode) {
      const ok = confirm(
        `Tài liệu này đã có ${preview.duplicate_count} công việc.\n` +
          'OK = Thêm mới (giữ cũ)\nCancel = quay lại chọn «Thay thế» nếu muốn xóa cũ.',
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const payload = cleaned.map((r) => ({
        title: r.title,
        assignee_name: r.assignee_name,
        assignee_id: r.assignee_id ?? undefined,
        deadline: r.deadline || undefined,
        note: r.note || undefined,
        status: 'pending',
        document_id: preview.document_id,
      }));
      const res = await tasksApi.saveTasks(preview.document_id, payload, replaceMode);
      alert(res.message || `Đã lưu ${res.count} công việc`);
      onSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detail || 'Không thể lưu công việc');
    } finally {
      setSaving(false);
    }
  };

  const renderUserOption = (u: TaskUser) => (
    <option key={u.id} value={u.id}>
      {u.name}
      {u.nickname ? ` (${u.nickname})` : ''}
      {!isTeamLead || showAllDepts ? (u.department ? ` · ${u.department}` : '') : ''}
    </option>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Duyệt công việc trước khi lưu</h2>
          <p className="text-sm text-gray-500 mt-0.5 truncate" title={preview.document_name}>
            {preview.document_name || `Tài liệu #${preview.document_id}`}
            {' · '}
            {rows.length} dòng
            {unmatchedCount > 0 ? ` · ${unmatchedCount} chưa khớp tài khoản` : ''}
            {reviewCount > 0 ? ` · ${reviewCount} nên xác nhận lại` : ''}
          </p>
        </div>

        {(unmatchedCount > 0 || reviewCount > 0) && (
          <div className="mx-5 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 shrink-0">
            Dòng có nền vàng là chỗ hệ thống không chắc chắn: kế hoạch chỉ ghi tên gọi, có nhiều
            người cùng tên, hoặc không tìm ra tài khoản. Hãy chọn đúng người trước khi lưu.
          </div>
        )}

        <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap items-center gap-3 shrink-0">
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            Tìm người:
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Tên / biệt danh"
              className="border border-gray-200 rounded-md px-2 py-1 text-sm w-40"
            />
          </label>
          {isTeamLead && (
            <button
              type="button"
              onClick={() => setShowAllDepts((v) => !v)}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
            >
              {showAllDepts
                ? `Thu gọn — chỉ tổ ${leadDept}`
                : `Xem thêm (${otherDeptCount} người tổ khác)`}
            </button>
          )}
          {isTeamLead && !showAllDepts && (
            <span className="text-[11px] text-gray-400">Đang hiện tổ {leadDept}</span>
          )}
          {preview.has_duplicates && (
            <label className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceMode}
                onChange={(e) => setReplaceMode(e.target.checked)}
              />
              Thay thế toàn bộ task cũ của tài liệu ({preview.duplicate_count})
            </label>
          )}
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              Không tìm thấy công việc trong tài liệu. Bạn có thể đóng và tạo tay sau.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row, index) => {
                const outside = selectedOutsidePool(row.assignee_id);
                const badge = matchBadge(row);
                return (
                  <div
                    key={index}
                    className={`grid grid-cols-1 md:grid-cols-[1fr_1fr_140px_auto] gap-2 items-start border rounded-lg p-3 ${
                      badge.needsReview ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'
                    }`}
                  >
                    <div>
                      <label className="text-[11px] text-gray-400">Công việc</label>
                      <input
                        value={row.title}
                        onChange={(e) => updateRow(index, { title: e.target.value })}
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 flex items-center gap-1 flex-wrap">
                        Người nhận
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${badge.className}`}
                          title={badge.hint}
                        >
                          {badge.label}
                          {badge.needsReview && (row.match_candidate_count || 0) > 1
                            ? ` (${row.match_candidate_count} người)`
                            : ''}
                        </span>
                      </label>
                      <input
                        value={row.assignee_name}
                        onChange={(e) =>
                          updateRow(index, {
                            assignee_name: e.target.value,
                            assignee_id: null,
                            match_confidence: null,
                            match_candidate_count: 0,
                          })
                        }
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm mb-1"
                      />
                      <select
                        value={row.assignee_id ?? ''}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null;
                          if (id) assignUser(index, id);
                          else updateRow(index, { assignee_id: null });
                        }}
                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700"
                      >
                        <option value="">— Chọn tài khoản —</option>
                        {outside && (
                          <optgroup label={`Đã chọn · ${outside.department || 'Khác'}`}>
                            {renderUserOption(outside)}
                          </optgroup>
                        )}
                        {isTeamLead && !showAllDepts ? (
                          <optgroup label={`Tổ ${leadDept}`}>
                            {myDeptUsers.map(renderUserOption)}
                          </optgroup>
                        ) : (
                          groupedAllUsers.map(([dept, list]) => (
                            <optgroup
                              key={dept}
                              label={dept === leadDept ? `Tổ ${dept} (của bạn)` : dept}
                            >
                              {list.map(renderUserOption)}
                            </optgroup>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400">Deadline</label>
                      <input
                        type="date"
                        value={toDateInputValue(row.deadline)}
                        onChange={(e) =>
                          updateRow(index, {
                            deadline: e.target.value || null,
                            has_scheduled_time: false,
                          })
                        }
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="md:mt-5 text-xs text-red-600 hover:bg-red-50 rounded-md px-2 py-1.5"
                      title="Bỏ dòng"
                    >
                      Bỏ
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/80 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Bỏ qua (không lưu)
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || rows.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : `Lưu ${rows.length} công việc`}
          </button>
        </div>
      </div>
    </div>
  );
}
