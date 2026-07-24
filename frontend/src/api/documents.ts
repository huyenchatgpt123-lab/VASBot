import api from './client';
import { Document } from '../types';

interface DocumentListResponse {
  documents: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface UploadMetadata {
  department: string;
  month: number;
  school_year: string;
  campus_ids: number[];
  include_in_calendar?: boolean;
  extract_tasks?: boolean;
  force?: boolean;
}

export interface TaskPreviewItem {
  title: string;
  assignee_name: string;
  assignee_id?: number | null;
  deadline?: string | null;
  has_scheduled_time?: boolean;
  status?: string;
  document_id?: number;
  note?: string | null;
}

export interface TaskPreviewPayload {
  tasks: TaskPreviewItem[];
  document_id: number;
  document_name?: string | null;
  has_duplicates: boolean;
  duplicate_count: number;
}

export interface DocumentUploadResponse {
  id: number;
  filename: string;
  page_count: number;
  department?: string | null;
  month?: number | null;
  school_year?: string | null;
  plan_title?: string | null;
  plan_event_at?: string | null;
  plan_event_end_at?: string | null;
  include_in_calendar: boolean;
  extract_tasks: boolean;
  task_preview?: TaskPreviewPayload | null;
  message: string;
}

export type DuplicateUploadDetail = {
  code: 'duplicate_filename';
  message: string;
  filename: string;
  existing: {
    id: number;
    filename: string;
    plan_title?: string | null;
    department?: string | null;
    created_at?: string | null;
  };
};

export const documentsApi = {
  getAll: async (params?: {
    search?: string;
    department?: string;
    month?: number;
    school_year?: string;
    sort_by?: string;
    order?: string;
    page?: number;
    page_size?: number;
  }): Promise<DocumentListResponse> => {
    const res = await api.get('/documents', { params });
    return res.data;
  },
  upload: async (file: File, metadata: UploadMetadata): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('department', metadata.department);
    formData.append('month', metadata.month.toString());
    formData.append('school_year', metadata.school_year);
    metadata.campus_ids.forEach((id) => formData.append('campus_ids', id.toString()));
    formData.append('include_in_calendar', metadata.include_in_calendar ? 'true' : 'false');
    formData.append('extract_tasks', metadata.extract_tasks !== false ? 'true' : 'false');
    formData.append('force', metadata.force ? 'true' : 'false');
    const res = await api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  delete: async (id: number) => {
    const res = await api.delete(`/documents/${id}`);
    return res.data;
  },
  getCampuses: async (): Promise<{ campuses: { id: number; code: string; name: string }[] }> => {
    const res = await api.get('/documents/campuses');
    return res.data;
  },
  getDepartments: async (): Promise<{ departments: string[] }> => {
    const res = await api.get('/documents/departments');
    return res.data;
  },
  getPreviewUrl: (id: number) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('token');
    return `${baseUrl}/documents/${id}/preview?token=${token}`;
  },
  getDownloadUrl: (id: number) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('token');
    return `${baseUrl}/documents/${id}/download?token=${token}`;
  },
  reExtractPlan: async (id: number): Promise<{
    document_id: number;
    plan_title: string | null;
    plan_event_at: string | null;
    plan_event_end_at: string | null;
    message: string;
  }> => {
    const res = await api.post(`/documents/${id}/re-extract-plan`);
    return res.data;
  },
};
