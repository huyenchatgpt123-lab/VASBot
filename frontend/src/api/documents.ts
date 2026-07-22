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
}

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
  upload: async (file: File, metadata: UploadMetadata) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('department', metadata.department);
    formData.append('month', metadata.month.toString());
    formData.append('school_year', metadata.school_year);
    metadata.campus_ids.forEach((id) => formData.append('campus_ids', id.toString()));
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
    message: string;
  }> => {
    const res = await api.post(`/documents/${id}/re-extract-plan`);
    return res.data;
  },
};
