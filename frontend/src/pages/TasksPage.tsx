import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { tasksApi, TaskItem, TaskUser } from '../api/tasks';
import { documentsApi } from '../api/documents';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'pending', label: 'Chưa làm' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'cancelled', label: 'Đã hủy' },
];

const STATUS_ICONS: Record<string, string> = {
  pending: '❌',
  in_progress: '⏳',
  completed: '✅',
  overdue: '🔴',
  cancelled: '⛔',
};

const STATUS_TAG_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700 border-gray-300',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-300',
  completed: 'bg-green-50 text-green-700 border-green-300',
  overdue: 'bg-red-50 text-red-700 border-red-300',
  cancelled: 'bg-yellow-50 text-yellow-700 border-yellow-300',
};

interface TaskGroup {
  title: string;
  deadline: string | null;
  items: TaskItem[];
}

interface DocumentGroup {
  document_name: string;
  document_id: number | null;
  taskGroups: TaskGroup[];
  completedCount: number;
  totalCount: number;
}

interface EditingGroup {
  title: string;
  deadline: string;
  note: string;
  document_id: number | null;
  task_ids: number[];
  assignee_ids: number[];
}

export default function TasksPage() {
  const { user, isAdmin, canManageTasks } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [taskUsers, setTaskUsers] = useState<TaskUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<EditingGroup | null>(null);
  const [newTask, setNewTask] = useState({ title: '', deadline: '', note: '', document_id: null as number | null });
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<number[]>([]);
  const [userDeptFilter, setUserDeptFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [existingAssigneeIds, setExistingAssigneeIds] = useState<number[]>([]);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [showNotif, setShowNotif] = useState(true);
  const [changingStatus, setChangingStatus] = useState<number | null>(null);

  useEffect(() => {
    loadTasks();
  }, [page, statusFilter, assigneeFilter]);

  useEffect(() => {
    if (canManageTasks) {
      tasksApi.getAssignees().then((res) => setAssignees(res.assignees));
      tasksApi.getUsers().then(setTaskUsers).catch(() => {});
    }
  }, [canManageTasks]);

  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    taskUsers.forEach((u) => { if (u.department) depts.add(u.department); });
    return Array.from(depts).sort();
  }, [taskUsers]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return taskUsers.filter((u) => {
      if (userDeptFilter && u.department !== userDeptFilter) return false;
      if (!q) return true;
      const name = u.name.toLowerCase();
      const nick = (u.nickname || '').toLowerCase();
      return name.includes(q) || nick.includes(q);
    });
  }, [taskUsers, userDeptFilter, userSearch]);

  const resetAssigneePicker = (defaultDept = '') => {
    setSelectedAssigneeIds([]);
    setUserDeptFilter(defaultDept);
    setUserSearch('');
    setExistingAssigneeIds([]);
  };

  const toggleAssignee = (userId: number, target: 'create' | 'edit') => {
    if (target === 'create') {
      setSelectedAssigneeIds((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      );
    } else if (editingGroup) {
      setEditingGroup({
        ...editingGroup,
        assignee_ids: editingGroup.assignee_ids.includes(userId)
          ? editingGroup.assignee_ids.filter((id) => id !== userId)
          : [...editingGroup.assignee_ids, userId],
      });
    }
  };

  useEffect(() => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentTasks = tasks.filter((t) => {
      const created = new Date(t.created_at);
      return created > oneDayAgo && t.status === 'pending';
    });
    setNewTaskCount(recentTasks.length);
  }, [tasks]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: pageSize, sort_by: 'deadline', order: 'asc' };
      if (statusFilter) params.status = statusFilter;
      if (assigneeFilter) params.assignee_name = assigneeFilter;
      const res = await tasksApi.getAll(params);
      setTasks(res.tasks);
      setTotal(res.total);
      const docs = new Set<string>();
      res.tasks.forEach((t) => docs.add(t.document_name || '_manual'));
      setExpandedDocs(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Group: Document → Task title → People (tags)
  const documentGroups: DocumentGroup[] = (() => {
    const docMap: Record<string, DocumentGroup> = {};

    tasks.forEach((task) => {
      const docKey = task.document_name || 'Công việc thủ công';
      if (!docMap[docKey]) {
        docMap[docKey] = {
          document_name: docKey,
          document_id: task.document_id,
          taskGroups: [],
          completedCount: 0,
          totalCount: 0,
        };
      }

      docMap[docKey].totalCount++;
      if (task.status === 'completed') docMap[docKey].completedCount++;

      // Find or create task group by title
      let taskGroup = docMap[docKey].taskGroups.find((g) => g.title === task.title);
      if (!taskGroup) {
        taskGroup = { title: task.title, deadline: task.deadline, items: [] };
        docMap[docKey].taskGroups.push(taskGroup);
      }
      taskGroup.items.push(task);
    });

    return Object.values(docMap);
  })();

  const toggleDoc = (name: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    try {
      setChangingStatus(taskId);
      await tasksApi.updateStatus(taskId, newStatus);
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể cập nhật');
    } finally {
      setChangingStatus(null);
    }
  };

  const handleDelete = async (taskId: number, assigneeName?: string) => {
    const msg = assigneeName
      ? `Xóa công việc của ${assigneeName}?`
      : 'Bạn có chắc muốn xóa công việc này?';
    if (!confirm(msg)) return;
    try {
      await tasksApi.delete(taskId);
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể xóa');
    }
  };

  const handleDeleteDocument = async (docGroup: DocumentGroup) => {
    const msg = `Bạn có chắc muốn xóa toàn bộ ${docGroup.totalCount} công việc trong "${docGroup.document_name}"?\nHành động không thể hoàn tác.`;
    if (!confirm(msg)) return;
    try {
      await tasksApi.deleteByDocument(docGroup.document_id);
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể xóa');
    }
  };

  const handleCreate = async () => {
    if (!newTask.title) {
      alert('Vui lòng nhập tên công việc');
      return;
    }
    let assigneeIds = selectedAssigneeIds;
    if (isAddingPerson) {
      assigneeIds = selectedAssigneeIds.filter((id) => !existingAssigneeIds.includes(id));
      if (assigneeIds.length === 0) {
        alert('Chọn ít nhất một người mới chưa có trong nhóm');
        return;
      }
    } else if (assigneeIds.length === 0) {
      alert('Vui lòng chọn ít nhất một người được giao');
      return;
    }
    try {
      await tasksApi.createBatch({
        title: newTask.title,
        assignee_ids: assigneeIds,
        deadline: newTask.deadline || undefined,
        note: newTask.note || undefined,
        document_id: newTask.document_id ?? undefined,
      });
      setShowCreateModal(false);
      setIsAddingPerson(false);
      setNewTask({ title: '', deadline: '', note: '', document_id: null });
      resetAssigneePicker();
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể tạo');
    }
  };

  const handleRematch = async () => {
    if (!confirm('Cập nhật phân công cho các công việc chưa gán tài khoản?')) return;
    setRematching(true);
    try {
      const res = await tasksApi.rematchAssignees();
      alert(`Đã gán ${res.matched}/${res.total_unassigned} công việc chưa phân công`);
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể cập nhật phân công');
    } finally {
      setRematching(false);
    }
  };

  const openCreateModal = (documentId: number | null = null) => {
    setIsAddingPerson(false);
    setNewTask({ title: '', deadline: '', note: '', document_id: documentId });
    resetAssigneePicker(user?.department || '');
    setShowCreateModal(true);
  };

  const openAddPersonModal = (taskGroup: TaskGroup, documentId: number | null) => {
    const existing = taskGroup.items
      .filter((i) => i.assignee_id !== null)
      .map((i) => i.assignee_id as number);
    setIsAddingPerson(true);
    setExistingAssigneeIds(existing);
    setNewTask({
      title: taskGroup.title,
      deadline: taskGroup.deadline ? taskGroup.deadline.split('T')[0] : '',
      note: taskGroup.items[0]?.note || '',
      document_id: documentId,
    });
    resetAssigneePicker(user?.department || '');
    setShowCreateModal(true);
  };

  const openEditGroup = (task: TaskItem) => {
    const groupItems = tasks.filter(
      (t) => t.title === task.title && t.document_id === task.document_id
    );
    setEditingGroup({
      title: task.title,
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
      note: groupItems[0]?.note || '',
      document_id: task.document_id,
      task_ids: groupItems.map((t) => t.id),
      assignee_ids: groupItems
        .filter((t) => t.assignee_id !== null)
        .map((t) => t.assignee_id as number),
    });
    setUserDeptFilter(user?.department || '');
    setUserSearch('');
  };

  const handleEditSave = async () => {
    if (!editingGroup) return;
    if (!editingGroup.title) {
      alert('Vui lòng nhập tên công việc');
      return;
    }
    if (editingGroup.assignee_ids.length === 0) {
      alert('Phải chọn ít nhất một người được giao');
      return;
    }
    try {
      await tasksApi.updateGroup({
        title: editingGroup.title,
        assignee_ids: editingGroup.assignee_ids,
        task_ids: editingGroup.task_ids,
        deadline: editingGroup.deadline || null,
        note: editingGroup.note || null,
        document_id: editingGroup.document_id,
      });
      setEditingGroup(null);
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Không thể cập nhật');
    }
  };

  const renderAssigneePicker = (
    selectedIds: number[],
    onToggle: (id: number) => void,
    options?: { disabledIds?: number[]; showExistingHint?: boolean }
  ) => {
    const disabledIds = options?.disabledIds || [];
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Người được giao *</label>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <select
            value={userDeptFilter}
            onChange={(e) => setUserDeptFilter(e.target.value)}
            className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tất cả tổ</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input
            type="search"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Tìm tên / biệt danh"
            className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filteredUsers.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-400 text-center">Không tìm thấy người dùng</p>
          ) : (
            filteredUsers.map((u) => {
              const isDisabled = disabledIds.includes(u.id);
              const isChecked = selectedIds.includes(u.id) || isDisabled;
              return (
                <label
                  key={u.id}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${isDisabled ? 'opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => !isDisabled && onToggle(u.id)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="font-medium text-gray-800">{u.name}</span>
                  {u.nickname && <span className="text-gray-500">· {u.nickname}</span>}
                  {u.department && <span className="text-xs text-gray-400 ml-auto">{u.department}</span>}
                </label>
              );
            })
          )}
        </div>
        {options?.showExistingHint && disabledIds.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Người đã có trong nhóm được đánh dấu sẵn</p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Đã chọn {selectedIds.length} người
          {isAddingPerson && existingAssigneeIds.length > 0 && (
            <> · Thêm mới {selectedIds.filter((id) => !existingAssigneeIds.includes(id)).length} người</>
          )}
        </p>
      </div>
    );
  };

  const handlePreviewPlan = (documentId: number | null) => {
    if (!documentId) return;
    const url = documentsApi.getPreviewUrl(documentId);
    window.open(url, '_blank');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const isOverdue = (task: TaskItem) => {
    if (!task.deadline || task.status === 'completed' || task.status === 'cancelled') return false;
    return new Date(task.deadline) < new Date();
  };

  const nextStatus = (current: string): string => {
    const cycle: Record<string, string> = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
      overdue: 'in_progress',
      cancelled: 'pending',
    };
    return cycle[current] || 'pending';
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Công việc</h1>
          <p className="text-sm text-gray-500 mt-1">
            {canManageTasks ? 'Quản lý công việc theo kế hoạch' : 'Danh sách công việc của bạn'}
          </p>
        </div>
        {canManageTasks && (
          <button
            onClick={() => openCreateModal(null)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium w-full sm:w-auto"
          >
            + Thêm công việc
          </button>
        )}
      </div>

      {/* Notification */}
      {newTaskCount > 0 && showNotif && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 text-lg">🔔</span>
            <span className="text-sm text-blue-700 font-medium">
              Bạn có <strong>{newTaskCount}</strong> công việc mới trong 24h qua
            </span>
          </div>
          <button onClick={() => setShowNotif(false)} className="text-blue-400 hover:text-blue-600 text-lg font-bold">×</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {canManageTasks && (
          <select
            value={assigneeFilter}
            onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Tất cả người nhận</option>
            {assignees.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}

        <span className="px-3 py-2 text-sm text-gray-500">Tổng: {total} công việc</span>

        {isAdmin && (
          <button
            onClick={handleRematch}
            disabled={rematching}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {rematching ? 'Đang cập nhật...' : 'Cập nhật phân công'}
          </button>
        )}
      </div>

      {/* Task list grouped */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : documentGroups.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Không có công việc nào</div>
      ) : (
        <div className="space-y-4">
          {documentGroups.map((docGroup) => (
            <div key={docGroup.document_name} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Document header (Tầng 1) */}
              <div className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                <button
                  onClick={() => toggleDoc(docGroup.document_name)}
                  className="flex-1 flex items-center justify-between min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-gray-400 text-xs shrink-0">
                      {expandedDocs.has(docGroup.document_name) ? '▼' : '▶'}
                    </span>
                    <span className="font-semibold text-gray-800 text-sm truncate">📁 {docGroup.document_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${docGroup.totalCount > 0 ? (docGroup.completedCount / docGroup.totalCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-right">{docGroup.completedCount}/{docGroup.totalCount}</span>
                  </div>
                </button>
                <button
                  onClick={() => handlePreviewPlan(docGroup.document_id)}
                  disabled={!docGroup.document_id}
                  title={docGroup.document_id ? 'Xem kế hoạch' : 'Không có kế hoạch'}
                  className="ml-3 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                >
                  👁
                </button>
                {canManageTasks && (
                  <button
                    onClick={() => handleDeleteDocument(docGroup)}
                    className="ml-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Xóa toàn bộ kế hoạch"
                  >
                    🗑
                  </button>
                )}
              </div>

              {/* Task groups (Tầng 2 + 3) */}
              {expandedDocs.has(docGroup.document_name) && (
                <div className="divide-y divide-gray-100">
                  {docGroup.taskGroups.map((taskGroup, idx) => (
                    <div key={`${taskGroup.title}-${idx}`} className="px-5 py-3">
                      {/* Task title row (Tầng 2) */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">📋</span>
                          <span className="text-sm font-medium text-gray-900">{taskGroup.title}</span>
                          {canManageTasks && (
                            <button
                              onClick={() => openEditGroup(taskGroup.items[0])}
                              className="text-gray-400 hover:text-blue-600 text-xs"
                              title="Sửa nhóm công việc"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                        {taskGroup.deadline && (
                          <span className={`text-xs ${new Date(taskGroup.deadline) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {formatDate(taskGroup.deadline)}
                          </span>
                        )}
                      </div>

                      {/* People tags (Tầng 3) */}
                      <div className="flex flex-wrap gap-2 ml-6">
                        {taskGroup.items.map((item) => {
                          const effectiveStatus = isOverdue(item) && item.status === 'pending' ? 'overdue' : item.status;
                          const isUnassigned = item.assignee_id === null;
                          const tagLabel = isUnassigned ? 'Chưa gán' : item.assignee_name;
                          const tagClass = isUnassigned
                            ? 'bg-yellow-50 text-yellow-800 border-yellow-300'
                            : (STATUS_TAG_COLORS[effectiveStatus] || STATUS_TAG_COLORS.pending);
                          return (
                            <div
                              key={item.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium cursor-pointer transition-all hover:shadow-sm ${tagClass}`}
                              onClick={() => {
                                if (!canManageTasks && isUnassigned) return;
                                handleStatusChange(item.id, nextStatus(item.status));
                              }}
                              title={isUnassigned ? `Chưa gán: ${item.assignee_name}` : `Bấm để đổi trạng thái | ${item.assignee_name}`}
                            >
                              <span>{isUnassigned ? '⚠️' : (STATUS_ICONS[effectiveStatus] || '❌')}</span>
                              <span className="max-w-[120px] truncate">{tagLabel}</span>
                              {canManageTasks && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.assignee_name); }}
                                  className="ml-0.5 text-gray-400 hover:text-red-600"
                                  title="Xóa"
                                >
                                  ×
                                </button>
                              )}
                              {changingStatus === item.id && (
                                <span className="animate-spin text-xs">⟳</span>
                              )}
                            </div>
                          );
                        })}

                        {/* Admin: add person to this task */}
                        {canManageTasks && (
                          <button
                            onClick={() => openAddPersonModal(taskGroup, docGroup.document_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-xs text-gray-400 hover:text-primary-600 hover:border-primary-400 transition-colors"
                            title="Thêm người"
                          >
                            + Thêm
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">Trang {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-100">Trước</button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-100">Sau</button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-lg shadow-xl mx-auto max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{isAddingPerson ? 'Thêm người' : 'Thêm công việc'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên công việc *</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  readOnly={isAddingPerson}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 ${isAddingPerson ? 'bg-gray-50 text-gray-600' : ''}`}
                  placeholder="Nhập tên công việc"
                />
              </div>
              {renderAssigneePicker(
                isAddingPerson
                  ? [...existingAssigneeIds, ...selectedAssigneeIds.filter((id) => !existingAssigneeIds.includes(id))]
                  : selectedAssigneeIds,
                (id) => {
                  if (isAddingPerson && existingAssigneeIds.includes(id)) return;
                  toggleAssignee(id, 'create');
                },
                { disabledIds: isAddingPerson ? existingAssigneeIds : [], showExistingHint: isAddingPerson }
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                <input type="date" value={newTask.deadline} onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })} readOnly={isAddingPerson} className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 ${isAddingPerson ? 'bg-gray-50 text-gray-600' : ''}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={newTask.note} onChange={(e) => setNewTask({ ...newTask, note: e.target.value })} readOnly={isAddingPerson} className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 ${isAddingPerson ? 'bg-gray-50 text-gray-600' : ''}`} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowCreateModal(false); setIsAddingPerson(false); resetAssigneePicker(); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Hủy</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">{isAddingPerson ? 'Thêm' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-lg shadow-xl mx-auto max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">Chỉnh sửa công việc</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên công việc *</label>
                <input
                  type="text"
                  value={editingGroup.title}
                  onChange={(e) => setEditingGroup({ ...editingGroup, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {renderAssigneePicker(
                editingGroup.assignee_ids,
                (id) => toggleAssignee(id, 'edit')
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                <input
                  type="date"
                  value={editingGroup.deadline}
                  onChange={(e) => setEditingGroup({ ...editingGroup, deadline: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  value={editingGroup.note}
                  onChange={(e) => setEditingGroup({ ...editingGroup, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditingGroup(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Hủy</button>
              <button onClick={handleEditSave} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
