import api from './client';

export interface TaskItem {
  id: number;
  title: string;
  assignee_name: string;
  assignee_id: number | null;
  deadline: string | null;
  status: string;
  document_id: number | null;
  document_name: string | null;
  document_department: string | null;
  department: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface TaskUser {
  id: number;
  name: string;
  nickname: string | null;
  department: string | null;
}

export interface TaskListResponse {
  tasks: TaskItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface TaskExtractResult {
  tasks: any[];
  document_id: number;
  document_name: string;
  has_duplicates: boolean;
  duplicate_count: number;
}

export const tasksApi = {
  getAll: async (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    assignee_name?: string;
    sort_by?: string;
    order?: string;
  }): Promise<TaskListResponse> => {
    const res = await api.get('/tasks', { params });
    return res.data;
  },

  getAssignees: async (): Promise<{ assignees: string[] }> => {
    const res = await api.get('/tasks/assignees');
    return res.data;
  },

  getUsers: async (): Promise<TaskUser[]> => {
    const res = await api.get('/tasks/users');
    return res.data;
  },

  updateStatus: async (taskId: number, status: string) => {
    const res = await api.patch(`/tasks/${taskId}/status`, { status });
    return res.data;
  },

  extract: async (documentId: number): Promise<TaskExtractResult> => {
    const res = await api.post('/tasks/extract', { document_id: documentId });
    return res.data;
  },

  saveTasks: async (documentId: number, tasks: any[], replace: boolean = false) => {
    const res = await api.post(`/tasks/save?document_id=${documentId}&replace=${replace}`, tasks);
    return res.data;
  },

  createBatch: async (data: {
    title: string;
    assignee_ids: number[];
    deadline?: string;
    document_id?: number;
    note?: string;
  }) => {
    const res = await api.post('/tasks/batch', data);
    return res.data;
  },

  updateGroup: async (data: {
    title: string;
    assignee_ids: number[];
    task_ids: number[];
    deadline?: string | null;
    document_id?: number | null;
    note?: string | null;
  }) => {
    const res = await api.put('/tasks/group', data);
    return res.data;
  },

  create: async (task: {
    title: string;
    assignee_name: string;
    assignee_id?: number;
    deadline?: string;
    status?: string;
    document_id?: number;
    note?: string;
  }) => {
    const res = await api.post('/tasks', task);
    return res.data;
  },

  update: async (taskId: number, data: any) => {
    const res = await api.put(`/tasks/${taskId}`, data);
    return res.data;
  },

  delete: async (taskId: number) => {
    const res = await api.delete(`/tasks/${taskId}`);
    return res.data;
  },

  deleteByDocument: async (documentId: number | null) => {
    const res = await api.delete('/tasks/by-document', {
      params: { document_id: documentId },
    });
    return res.data;
  },

  rematchAssignees: async (): Promise<{ matched: number; total_unassigned: number }> => {
    const res = await api.post('/tasks/rematch-assignees');
    return res.data;
  },
};
