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

type ViewMode = 'plan' | 'person' | 'attention' | 'manual';
type SummaryFilter = '' | 'overdue' | 'pending' | 'in_progress' | 'completed';

interface TaskGroup {
  title: string;
  deadline: string | null;
  items: TaskItem[];
  completedCount: number;
  overdueCount: number;
}

interface DocumentGroup {
  document_name: string;
  document_id: number | null;
  department: string | null;
  isManual: boolean;
  taskGroups: TaskGroup[];
  completedCount: number;
  totalCount: number;
  overdueCount: number;
}

interface DepartmentGroup {
  department: string;
  documentGroups: DocumentGroup[];
  completedCount: number;
  totalCount: number;
  overdueCount: number;
}

interface PersonGroup {
  assignee_id: number | null;
  assignee_name: string;
  department: string | null;
  tasks: TaskItem[];
  completedCount: number;
  overdueCount: number;
}

interface EditingGroup {
  title: string;
  deadline: string;
  note: string;
  document_id: number | null;
  task_ids: number[];
  assignee_ids: number[];
}

function isTaskOverdue(task: TaskItem): boolean {
  if (!task.deadline || task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.deadline) < new Date();
}

function getEffectiveStatus(task: TaskItem): string {
  return isTaskOverdue(task) && task.status === 'pending' ? 'overdue' : task.status;
}

function isDueWithinDays(task: TaskItem, days: number): boolean {
  if (!task.deadline || task.status === 'completed' || task.status === 'cancelled') return false;
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const d = new Date(task.deadline);
  return d >= now && d <= end;
}

function needsAttention(task: TaskItem): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  return isTaskOverdue(task) || isDueWithinDays(task, 7);
}

function getTaskDepartment(task: TaskItem, fallback = 'Khác'): string {
  return task.department || fallback;
}


function buildDocumentGroups(taskList: TaskItem[]): DocumentGroup[] {
  const docMap: Record<string, DocumentGroup> = {};
  for (const task of taskList) {
    const isManual = !task.document_id;
    const docKey = isManual ? '__manual__' : (task.document_name || '__manual__');
    const displayName = isManual ? 'Công việc thủ công' : (task.document_name || 'Không tên');
    if (!docMap[docKey]) {
      docMap[docKey] = {
        document_name: displayName,
        document_id: task.document_id,
        department: task.department,
        isManual,
        taskGroups: [],
        completedCount: 0,
        totalCount: 0,
        overdueCount: 0,
      };
    }
    const doc = docMap[docKey];
    doc.totalCount++;
    if (task.status === 'completed') doc.completedCount++;
    if (getEffectiveStatus(task) === 'overdue') doc.overdueCount++;

    let taskGroup = doc.taskGroups.find((g) => g.title === task.title);
    if (!taskGroup) {
      taskGroup = { title: task.title, deadline: task.deadline, items: [], completedCount: 0, overdueCount: 0 };
      doc.taskGroups.push(taskGroup);
    }
    taskGroup.items.push(task);
    if (task.status === 'completed') taskGroup.completedCount++;
    if (getEffectiveStatus(task) === 'overdue') taskGroup.overdueCount++;
  }
  return Object.values(docMap);
}

function buildDepartmentGroups(docGroups: DocumentGroup[]): DepartmentGroup[] {
  const deptMap: Record<string, DepartmentGroup> = {};
  for (const doc of docGroups) {
    const dept = doc.department || 'Khác';
    if (!deptMap[dept]) {
      deptMap[dept] = { department: dept, documentGroups: [], completedCount: 0, totalCount: 0, overdueCount: 0 };
    }
    const d = deptMap[dept];
    d.documentGroups.push(doc);
    d.completedCount += doc.completedCount;
    d.totalCount += doc.totalCount;
    d.overdueCount += doc.overdueCount;
  }
  return Object.values(deptMap).sort((a, b) => a.department.localeCompare(b.department, 'vi'));
}

function buildPersonGroups(taskList: TaskItem[]): PersonGroup[] {
  const map: Record<string, PersonGroup> = {};
  for (const task of taskList) {
    const key = task.assignee_id != null ? String(task.assignee_id) : `unassigned:${task.assignee_name}`;
    if (!map[key]) {
      map[key] = {
        assignee_id: task.assignee_id,
        assignee_name: task.assignee_name,
        department: task.department,
        tasks: [],
        completedCount: 0,
        overdueCount: 0,
      };
    }
    const g = map[key];
    g.tasks.push(task);
    if (task.status === 'completed') g.completedCount++;
    if (getEffectiveStatus(task) === 'overdue') g.overdueCount++;
  }
  return Object.values(map).sort((a, b) => a.assignee_name.localeCompare(b.assignee_name, 'vi'));
}

function getSmartExpandedDocs(docGroups: DocumentGroup[]): Set<string> {
  const expanded = new Set<string>();
  for (const doc of docGroups) {
    const isComplete = doc.totalCount > 0 && doc.completedCount === doc.totalCount;
    const hasOverdue = doc.overdueCount > 0;
    if (!isComplete || hasOverdue) expanded.add(doc.document_name);
  }
  return expanded;
}

function getSmartExpandedDepts(deptGroups: DepartmentGroup[]): Set<string> {
  const expanded = new Set<string>();
  for (const dept of deptGroups) {
    if (dept.overdueCount > 0 || dept.completedCount < dept.totalCount) {
      expanded.add(dept.department);
    }
  }
  return expanded;
}

export default function TasksPage() {
  const { user, isAdmin, canManageTasks, scopeAllDepartments } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(200);
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [taskUsers, setTaskUsers] = useState<TaskUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
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

  const [viewMode, setViewMode] = useState<ViewMode>('plan');
  const [listDeptFilter, setListDeptFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('');

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
    tasks.forEach((t) => { if (t.department) depts.add(t.department); });
    return Array.from(depts).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [taskUsers, tasks]);

  const planOptions = useMemo(() => {
    const plans = new Set<string>();
    tasks.forEach((t) => {
      if (t.document_id && t.document_name) plans.add(t.document_name);
    });
    return Array.from(plans).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [tasks]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return taskUsers.filter((u) => {
      if (userDeptFilter && u.department !== userDeptFilter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || (u.nickname || '').toLowerCase().includes(q);
    });
  }, [taskUsers, userDeptFilter, userSearch]);

  useEffect(() => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    setNewTaskCount(tasks.filter((t) => new Date(t.created_at) > oneDayAgo && t.status === 'pending').length);
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    let list = [...tasks];
    const q = titleSearch.trim().toLowerCase();

    if (viewMode === 'manual') {
      list = list.filter((t) => !t.document_id);
    } else if (viewMode === 'attention') {
      list = list.filter(needsAttention);
    }

    if (listDeptFilter) list = list.filter((t) => getTaskDepartment(t) === listDeptFilter);
    if (planFilter) list = list.filter((t) => t.document_name === planFilter);
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));
    if (overdueOnly) list = list.filter(isTaskOverdue);

    if (summaryFilter === 'overdue') {
      list = list.filter((t) => getEffectiveStatus(t) === 'overdue');
    } else if (summaryFilter) {
      list = list.filter((t) => t.status === summaryFilter);
    }

    return list;
  }, [tasks, viewMode, listDeptFilter, planFilter, titleSearch, overdueOnly, summaryFilter]);

  const stats = useMemo(() => {
    const base = canManageTasks ? tasks : visibleTasks;
    return {
      total: base.length,
      overdue: base.filter((t) => getEffectiveStatus(t) === 'overdue').length,
      pending: base.filter((t) => t.status === 'pending').length,
      in_progress: base.filter((t) => t.status === 'in_progress').length,
      completed: base.filter((t) => t.status === 'completed').length,
      attention: base.filter(needsAttention).length,
    };
  }, [tasks, visibleTasks, canManageTasks]);

  const deptStats = useMemo(() => {
    if (!scopeAllDepartments) return [];
    const map: Record<string, { department: string; total: number; completed: number; overdue: number }> = {};
    for (const t of tasks) {
      const dept = getTaskDepartment(t);
      if (!map[dept]) map[dept] = { department: dept, total: 0, completed: 0, overdue: 0 };
      map[dept].total++;
      if (t.status === 'completed') map[dept].completed++;
      if (getEffectiveStatus(t) === 'overdue') map[dept].overdue++;
    }
    return Object.values(map).sort((a, b) => a.department.localeCompare(b.department, 'vi'));
  }, [tasks, scopeAllDepartments]);

  const documentGroups = useMemo(() => {
    const source = viewMode === 'manual'
      ? visibleTasks
      : visibleTasks.filter((t) => t.document_id);
    return buildDocumentGroups(source);
  }, [visibleTasks, viewMode]);
  const departmentGroups = useMemo(() => buildDepartmentGroups(documentGroups), [documentGroups]);
  const personGroups = useMemo(() => buildPersonGroups(visibleTasks), [visibleTasks]);

  const teacherBuckets = useMemo(() => {
    if (canManageTasks) return null;
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const overdue: TaskItem[] = [];
    const thisWeek: TaskItem[] = [];
    const later: TaskItem[] = [];
    const done: TaskItem[] = [];
    for (const t of visibleTasks) {
      if (t.status === 'completed' || t.status === 'cancelled') { done.push(t); continue; }
      if (isTaskOverdue(t)) { overdue.push(t); continue; }
      if (t.deadline && new Date(t.deadline) <= weekEnd) { thisWeek.push(t); continue; }
      later.push(t);
    }
    const sortByDeadline = (a: TaskItem, b: TaskItem) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    };
    overdue.sort(sortByDeadline);
    thisWeek.sort(sortByDeadline);
    later.sort(sortByDeadline);
    return { overdue, thisWeek, later, done };
  }, [visibleTasks, canManageTasks]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize, sort_by: 'deadline', order: 'asc' };
      if (statusFilter) params.status = statusFilter;
      if (assigneeFilter) params.assignee_name = assigneeFilter;
      const res = await tasksApi.getAll(params);
      setTasks(res.tasks);
      setTotal(res.total);
      const docs = buildDocumentGroups(res.tasks);
      setExpandedDocs(getSmartExpandedDocs(docs));
      if (scopeAllDepartments) {
        setExpandedDepts(getSmartExpandedDepts(buildDepartmentGroups(docs)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetAssigneePicker = (defaultDept = '') => {
    setSelectedAssigneeIds([]);
    setUserDeptFilter(defaultDept);
    setUserSearch('');
    setExistingAssigneeIds([]);
  };

  const toggleAssignee = (userId: number, target: 'create' | 'edit') => {
    if (target === 'create') {
      setSelectedAssigneeIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
    } else if (editingGroup) {
      setEditingGroup({
        ...editingGroup,
        assignee_ids: editingGroup.assignee_ids.includes(userId)
          ? editingGroup.assignee_ids.filter((id) => id !== userId)
          : [...editingGroup.assignee_ids, userId],
      });
    }
  };

  const toggleDoc = (name: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleDept = (name: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleDeptCardClick = (dept: string) => {
    setListDeptFilter(dept);
    setViewMode('plan');
    setExpandedDepts(new Set([dept]));
    const docs = buildDocumentGroups(tasks.filter((t) => getTaskDepartment(t) === dept));
    setExpandedDocs(getSmartExpandedDocs(docs));
  };

  const handleSummaryClick = (filter: SummaryFilter) => {
    setSummaryFilter((prev) => (prev === filter ? '' : filter));
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
    const msg = assigneeName ? `Xóa công việc của ${assigneeName}?` : 'Bạn có chắc muốn xóa công việc này?';
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
    if (!newTask.title) { alert('Vui lòng nhập tên công việc'); return; }
    let assigneeIds = selectedAssigneeIds;
    if (isAddingPerson) {
      assigneeIds = selectedAssigneeIds.filter((id) => !existingAssigneeIds.includes(id));
      if (assigneeIds.length === 0) { alert('Chọn ít nhất một người mới chưa có trong nhóm'); return; }
    } else if (assigneeIds.length === 0) {
      alert('Vui lòng chọn ít nhất một người được giao'); return;
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
    setIsAddingPerson(true);
    setExistingAssigneeIds(taskGroup.items.filter((i) => i.assignee_id !== null).map((i) => i.assignee_id as number));
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
    const groupItems = tasks.filter((t) => t.title === task.title && t.document_id === task.document_id);
    setEditingGroup({
      title: task.title,
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
      note: groupItems[0]?.note || '',
      document_id: task.document_id,
      task_ids: groupItems.map((t) => t.id),
      assignee_ids: groupItems.filter((t) => t.assignee_id !== null).map((t) => t.assignee_id as number),
    });
    setUserDeptFilter(user?.department || '');
    setUserSearch('');
  };

  const handleEditSave = async () => {
    if (!editingGroup || !editingGroup.title || editingGroup.assignee_ids.length === 0) {
      alert('Vui lòng nhập tên và chọn ít nhất một người'); return;
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
          <select value={userDeptFilter} onChange={(e) => setUserDeptFilter(e.target.value)} className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500">
            <option value="">Tất cả tổ</option>
            {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="search" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Tìm tên / biệt danh" className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filteredUsers.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-400 text-center">Không tìm thấy người dùng</p>
          ) : filteredUsers.map((u) => {
            const isDisabled = disabledIds.includes(u.id);
            const isChecked = selectedIds.includes(u.id) || isDisabled;
            return (
              <label key={u.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${isDisabled ? 'opacity-60' : ''}`}>
                <input type="checkbox" checked={isChecked} disabled={isDisabled} onChange={() => !isDisabled && onToggle(u.id)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="font-medium text-gray-800">{u.name}</span>
                {u.nickname && <span className="text-gray-500">· {u.nickname}</span>}
                {u.department && <span className="text-xs text-gray-400 ml-auto">{u.department}</span>}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-1">Đã chọn {selectedIds.length} người</p>
      </div>
    );
  };

  const handlePreviewPlan = (documentId: number | null) => {
    if (!documentId) return;
    window.open(documentsApi.getPreviewUrl(documentId), '_blank');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const nextStatus = (current: string) => ({
    pending: 'in_progress', in_progress: 'completed', completed: 'pending', overdue: 'in_progress', cancelled: 'pending',
  }[current] || 'pending');

  const renderTaskTag = (item: TaskItem) => {
    const effectiveStatus = getEffectiveStatus(item);
    const isUnassigned = item.assignee_id === null;
    const tagLabel = isUnassigned ? 'Chưa gán' : item.assignee_name;
    const tagClass = isUnassigned ? 'bg-yellow-50 text-yellow-800 border-yellow-300' : (STATUS_TAG_COLORS[effectiveStatus] || STATUS_TAG_COLORS.pending);
    return (
      <div
        key={item.id}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium cursor-pointer transition-all hover:shadow-sm ${tagClass}`}
        onClick={() => { if (!canManageTasks && isUnassigned) return; handleStatusChange(item.id, nextStatus(item.status)); }}
        title={isUnassigned ? `Chưa gán: ${item.assignee_name}` : `Bấm để đổi trạng thái | ${item.assignee_name}`}
      >
        <span>{isUnassigned ? '⚠️' : (STATUS_ICONS[effectiveStatus] || '❌')}</span>
        <span className="max-w-[120px] truncate">{tagLabel}</span>
        {canManageTasks && (
          <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.assignee_name); }} className="ml-0.5 text-gray-400 hover:text-red-600" title="Xóa">×</button>
        )}
        {changingStatus === item.id && <span className="animate-spin text-xs">⟳</span>}
      </div>
    );
  };

  const renderGroupProgress = (completed: number, total: number, overdue: number) => (
    <span className="text-xs text-gray-500">
      {completed}/{total} hoàn thành
      {overdue > 0 && <span className="text-red-600 font-medium ml-1">· {overdue} quá hạn</span>}
    </span>
  );

  const renderDocumentGroup = (docGroup: DocumentGroup) => (
    <div key={docGroup.document_name} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <button onClick={() => toggleDoc(docGroup.document_name)} className="flex-1 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-gray-400 text-xs shrink-0">{expandedDocs.has(docGroup.document_name) ? '▼' : '▶'}</span>
            <span className="font-semibold text-gray-800 text-sm truncate">
              {docGroup.isManual ? '📝' : '📁'} {docGroup.document_name}
              {docGroup.isManual && <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Thủ công</span>}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${docGroup.totalCount > 0 ? (docGroup.completedCount / docGroup.totalCount) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-gray-500">{docGroup.completedCount}/{docGroup.totalCount}</span>
            {docGroup.overdueCount > 0 && <span className="text-xs text-red-600">🔴{docGroup.overdueCount}</span>}
          </div>
        </button>
        <button onClick={() => handlePreviewPlan(docGroup.document_id)} disabled={!docGroup.document_id} title="Xem kế hoạch" className="ml-3 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg shrink-0 disabled:opacity-40">👁</button>
        {canManageTasks && (
          <button onClick={() => handleDeleteDocument(docGroup)} className="ml-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0" title="Xóa toàn bộ">🗑</button>
        )}
      </div>
      {expandedDocs.has(docGroup.document_name) && (
        <div className="divide-y divide-gray-100">
          {docGroup.taskGroups.map((taskGroup, idx) => (
            <div key={`${taskGroup.title}-${idx}`} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-400 text-sm">📋</span>
                  <span className={`text-sm font-medium truncate ${taskGroup.overdueCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>{taskGroup.title}</span>
                  {canManageTasks && (
                    <button onClick={() => openEditGroup(taskGroup.items[0])} className="text-gray-400 hover:text-blue-600 text-xs" title="Sửa nhóm">✏️</button>
                  )}
                </div>
                {taskGroup.deadline && (
                  <span className={`text-xs shrink-0 ml-2 ${new Date(taskGroup.deadline) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {formatDate(taskGroup.deadline)}
                  </span>
                )}
              </div>
              <div className="ml-6 mb-2">{renderGroupProgress(taskGroup.completedCount, taskGroup.items.length, taskGroup.overdueCount)}</div>
              <div className="flex flex-wrap gap-2 ml-6">
                {taskGroup.items.map(renderTaskTag)}
                {canManageTasks && (
                  <button onClick={() => openAddPersonModal(taskGroup, docGroup.document_id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-xs text-gray-400 hover:text-primary-600 hover:border-primary-400">+ Thêm</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPlanView = () => {
    if (scopeAllDepartments && !listDeptFilter) {
      return (
        <div className="space-y-4">
          {departmentGroups.map((deptGroup) => (
            <div key={deptGroup.department} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <button onClick={() => toggleDept(deptGroup.department)} className="w-full flex items-center justify-between px-5 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-xs">{expandedDepts.has(deptGroup.department) ? '▼' : '▶'}</span>
                  <span className="font-semibold text-indigo-900 text-sm">🏫 {deptGroup.department}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-indigo-700">
                  <span>{deptGroup.completedCount}/{deptGroup.totalCount}</span>
                  {deptGroup.overdueCount > 0 && <span className="text-red-600 font-medium">🔴 {deptGroup.overdueCount} quá hạn</span>}
                </div>
              </button>
              {expandedDepts.has(deptGroup.department) && (
                <div className="p-3 space-y-3 bg-gray-50">{deptGroup.documentGroups.map(renderDocumentGroup)}</div>
              )}
            </div>
          ))}
        </div>
      );
    }
    return <div className="space-y-4">{documentGroups.map(renderDocumentGroup)}</div>;
  };

  const renderPersonView = () => (
    <div className="space-y-3">
      {personGroups.map((pg) => (
        <div key={`${pg.assignee_id}-${pg.assignee_name}`} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
            <div>
              <span className="font-semibold text-gray-900 text-sm">{pg.assignee_id === null ? '⚠️ ' : '👤 '}{pg.assignee_name}</span>
              {pg.department && <span className="ml-2 text-xs text-gray-400">{pg.department}</span>}
            </div>
            {renderGroupProgress(pg.completedCount, pg.tasks.length, pg.overdueCount)}
          </div>
          <div className="divide-y divide-gray-100">
            {pg.tasks.map((task) => {
              const st = getEffectiveStatus(task);
              return (
                <div key={task.id} className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${st === 'overdue' ? 'text-red-700 font-medium' : 'text-gray-800'}`}>{task.title}</p>
                    <p className="text-xs text-gray-400 truncate">{task.document_name || 'Việc thủ công'}{task.deadline ? ` · ${formatDate(task.deadline)}` : ''}</p>
                  </div>
                  <button
                    onClick={() => handleStatusChange(task.id, nextStatus(task.status))}
                    className={`shrink-0 px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_TAG_COLORS[st]}`}
                  >
                    {STATUS_ICONS[st]} {STATUS_OPTIONS.find((s) => s.value === st)?.label || st}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTeacherCard = (task: TaskItem) => {
    const st = getEffectiveStatus(task);
    return (
      <div key={task.id} className={`bg-white rounded-lg border p-4 flex items-center justify-between gap-3 ${st === 'overdue' ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{task.title}</p>
          {task.document_name && <p className="text-xs text-gray-400 truncate mt-0.5">{task.document_name}</p>}
          {task.deadline && <p className={`text-xs mt-1 ${st === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>📅 {formatDate(task.deadline)}</p>}
          {task.note && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.note}</p>}
        </div>
        <button onClick={() => handleStatusChange(task.id, nextStatus(task.status))} className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium ${STATUS_TAG_COLORS[st]}`}>
          {STATUS_ICONS[st]} {STATUS_OPTIONS.find((s) => s.value === st)?.label}
        </button>
      </div>
    );
  };

  const renderTeacherView = () => {
    if (!teacherBuckets) return null;
    const sections = [
      { key: 'overdue', title: '🔴 Quá hạn', items: teacherBuckets.overdue, show: true },
      { key: 'week', title: '📅 Tuần này', items: teacherBuckets.thisWeek, show: true },
      { key: 'later', title: '📆 Sau này', items: teacherBuckets.later, show: true },
      { key: 'done', title: '✅ Đã xong', items: teacherBuckets.done, show: teacherBuckets.done.length > 0 },
    ];
    return (
      <div className="space-y-6">
        {sections.filter((s) => s.show && s.items.length > 0).map((s) => (
          <div key={s.key}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{s.title} ({s.items.length})</h3>
            <div className="space-y-2">{s.items.map(renderTeacherCard)}</div>
          </div>
        ))}
        {visibleTasks.length === 0 && <div className="text-center py-12 text-gray-400">Không có công việc nào</div>}
      </div>
    );
  };

  const totalPages = Math.ceil(total / pageSize);
  const viewTabs: { key: ViewMode; label: string }[] = [
    { key: 'plan', label: 'Theo kế hoạch' },
    { key: 'person', label: 'Theo người' },
    { key: 'attention', label: `Cần chú ý${stats.attention > 0 ? ` (${stats.attention})` : ''}` },
    { key: 'manual', label: 'Việc phát sinh' },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Công việc</h1>
          <p className="text-sm text-gray-500 mt-1">
            {canManageTasks ? (scopeAllDepartments ? 'Tổng quan tất cả tổ' : `Quản lý tổ ${user?.department || ''}`) : 'Việc của tôi'}
          </p>
        </div>
        {canManageTasks && (
          <button onClick={() => openCreateModal(null)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium w-full sm:w-auto">+ Thêm công việc</button>
        )}
      </div>

      {newTaskCount > 0 && showNotif && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <span className="text-sm text-blue-700">🔔 Bạn có <strong>{newTaskCount}</strong> công việc mới trong 24h qua</span>
          <button onClick={() => setShowNotif(false)} className="text-blue-400 hover:text-blue-600 text-lg font-bold">×</button>
        </div>
      )}

      {canManageTasks && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {([
            { key: '' as SummaryFilter, label: 'Tất cả', value: stats.total, color: 'bg-white border-gray-200' },
            { key: 'overdue' as SummaryFilter, label: 'Quá hạn', value: stats.overdue, color: 'bg-red-50 border-red-200' },
            { key: 'pending' as SummaryFilter, label: 'Chưa làm', value: stats.pending, color: 'bg-gray-50 border-gray-200' },
            { key: 'in_progress' as SummaryFilter, label: 'Đang làm', value: stats.in_progress, color: 'bg-blue-50 border-blue-200' },
            { key: 'completed' as SummaryFilter, label: 'Hoàn thành', value: stats.completed, color: 'bg-green-50 border-green-200' },
          ]).map((card) => (
            <button
              key={card.key || 'all'}
              onClick={() => handleSummaryClick(card.key)}
              className={`p-3 rounded-lg border text-left transition-all ${card.color} ${summaryFilter === card.key ? 'ring-2 ring-primary-500' : 'hover:shadow-sm'}`}
            >
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </button>
          ))}
        </div>
      )}

      {scopeAllDepartments && deptStats.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Tổng quan theo tổ</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setListDeptFilter(''); setExpandedDepts(getSmartExpandedDepts(departmentGroups)); }}
              className={`px-3 py-2 rounded-lg border text-sm ${!listDeptFilter ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              Tất cả tổ
            </button>
            {deptStats.map((d) => (
              <button
                key={d.department}
                onClick={() => handleDeptCardClick(d.department)}
                className={`px-3 py-2 rounded-lg border text-sm ${listDeptFilter === d.department ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
              >
                {d.department} · {d.completed}/{d.total}
                {d.overdue > 0 && <span className="ml-1 text-red-500">🔴{d.overdue}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {canManageTasks && (
        <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 pb-3">
          {viewTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === tab.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          value={titleSearch}
          onChange={(e) => setTitleSearch(e.target.value)}
          placeholder="Tìm tên công việc..."
          className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {canManageTasks && (
          <>
            {scopeAllDepartments && (
              <select value={listDeptFilter} onChange={(e) => setListDeptFilter(e.target.value)} className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">Tất cả tổ</option>
                {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Tất cả kế hoạch</option>
              {planOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }} className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Tất cả người nhận</option>
              {assignees.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="rounded border-gray-300" />
              Chỉ quá hạn
            </label>
          </>
        )}
        <span className="px-3 py-2 text-sm text-gray-500">Hiển thị: {visibleTasks.length} / {total}</span>
        {isAdmin && (
          <button onClick={handleRematch} disabled={rematching} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {rematching ? 'Đang cập nhật...' : 'Cập nhật phân công'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : !canManageTasks ? (
        renderTeacherView()
      ) : viewMode === 'person' ? (
        personGroups.length === 0 ? <div className="text-center py-12 text-gray-400">Không có công việc nào</div> : renderPersonView()
      ) : (
        (scopeAllDepartments && !listDeptFilter ? departmentGroups.length : documentGroups.length) === 0
          ? <div className="text-center py-12 text-gray-400">Không có công việc nào</div>
          : renderPlanView()
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">Trang {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50">Trước</button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1 text-sm border rounded-md disabled:opacity-50">Sau</button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{isAddingPerson ? 'Thêm người' : 'Thêm công việc'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên công việc *</label>
                <input type="text" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} readOnly={isAddingPerson} className={`w-full px-3 py-2 border rounded-lg text-sm ${isAddingPerson ? 'bg-gray-50' : ''}`} />
              </div>
              {renderAssigneePicker(
                isAddingPerson ? [...existingAssigneeIds, ...selectedAssigneeIds.filter((id) => !existingAssigneeIds.includes(id))] : selectedAssigneeIds,
                (id) => { if (!isAddingPerson || !existingAssigneeIds.includes(id)) toggleAssignee(id, 'create'); },
                { disabledIds: isAddingPerson ? existingAssigneeIds : [] }
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                <input type="date" value={newTask.deadline} onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })} readOnly={isAddingPerson} className={`w-full px-3 py-2 border rounded-lg text-sm ${isAddingPerson ? 'bg-gray-50' : ''}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea value={newTask.note} onChange={(e) => setNewTask({ ...newTask, note: e.target.value })} readOnly={isAddingPerson} className={`w-full px-3 py-2 border rounded-lg text-sm ${isAddingPerson ? 'bg-gray-50' : ''}`} rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowCreateModal(false); setIsAddingPerson(false); resetAssigneePicker(); }} className="px-4 py-2 text-sm text-gray-600">Hủy</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">{isAddingPerson ? 'Thêm' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}

      {editingGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">Chỉnh sửa công việc</h2>
            <div className="space-y-3">
              <input type="text" value={editingGroup.title} onChange={(e) => setEditingGroup({ ...editingGroup, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Tên công việc" />
              {renderAssigneePicker(editingGroup.assignee_ids, (id) => toggleAssignee(id, 'edit'))}
              <input type="date" value={editingGroup.deadline} onChange={(e) => setEditingGroup({ ...editingGroup, deadline: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <textarea value={editingGroup.note} onChange={(e) => setEditingGroup({ ...editingGroup, note: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Ghi chú" />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditingGroup(null)} className="px-4 py-2 text-sm text-gray-600">Hủy</button>
              <button onClick={handleEditSave} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
