import api from './client';
import { Document } from '../types';
import {
  closeDocumentWindowPlaceholder,
  navigateOpenedDocumentWindow,
  openDocumentWindowPlaceholder,
} from '../utils/openDocumentLink';

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
  match_confidence?: string | null;
  match_candidate_count?: number;
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

export interface TimelineSlotPreview {
  start: string;
  end?: string | null;
  title: string;
}

export interface CalendarDayPreview {
  plan_title?: string | null;
  plan_event_at?: string | null;
  plan_event_end_at?: string | null;
  location?: string | null;
  timeline?: TimelineSlotPreview[];
}

export interface CalendarPreviewPayload {
  document_id: number;
  plan_title?: string | null;
  plan_event_at?: string | null;
  plan_event_end_at?: string | null;
  location?: string | null;
  timeline?: TimelineSlotPreview[];
  events?: CalendarDayPreview[];
  needs_review?: boolean;
  event_id?: number | null;
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
  calendar_preview?: CalendarPreviewPayload | null;
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

export type PlanReExtractResult = {
  document_id: number;
  plan_title: string | null;
  plan_event_at: string | null;
  plan_event_end_at: string | null;
  location?: string | null;
  timeline?: TimelineSlotPreview[];
  events?: CalendarDayPreview[];
  message: string;
  preview_only?: boolean;
  needs_review?: boolean;
  event_count?: number;
};

export type PlanEventConfirmDay = {
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  timeline?: TimelineSlotPreview[] | null;
};

export type PlanEventConfirmPayload = {
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  timeline?: TimelineSlotPreview[] | null;
  include_in_calendar?: boolean;
  event_id?: number | null;
  events?: PlanEventConfirmDay[];
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
  upload: async (
    file: File,
    metadata: UploadMetadata,
    options?: { onUploadProgress?: (loaded: number, total: number) => void },
  ): Promise<DocumentUploadResponse> => {
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
      onUploadProgress: (evt) => {
        if (options?.onUploadProgress && evt.total) {
          options.onUploadProgress(evt.loaded, evt.total);
        }
      },
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
  /**
   * Open preview via short-lived access link.
   * Opens about:blank synchronously (keeps user gesture), then navigates.
   * If the browser blocks tabs (Safari / Zalo), shows a manual open sheet.
   */
  openPreview: async (id: number) => {
    const win = openDocumentWindowPlaceholder();
    try {
      const res = await api.post<{ url: string }>(`/documents/${id}/access-link`, null, {
        params: { purpose: 'preview' },
      });
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      navigateOpenedDocumentWindow(win, `${baseUrl}${res.data.url}`, 'preview');
    } catch (err) {
      closeDocumentWindowPlaceholder(win);
      throw err;
    }
  },
  openDownload: async (id: number) => {
    const win = openDocumentWindowPlaceholder();
    try {
      const res = await api.post<{ url: string }>(`/documents/${id}/access-link`, null, {
        params: { purpose: 'download' },
      });
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      navigateOpenedDocumentWindow(win, `${baseUrl}${res.data.url}`, 'download');
    } catch (err) {
      closeDocumentWindowPlaceholder(win);
      throw err;
    }
  },
  /** @deprecated Prefer openPreview — kept for rare callers that need a URL string after minting. */
  getPreviewUrl: async (id: number): Promise<string> => {
    const res = await api.post<{ url: string }>(`/documents/${id}/access-link`, null, {
      params: { purpose: 'preview' },
    });
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    return `${baseUrl}${res.data.url}`;
  },
  getDownloadUrl: async (id: number): Promise<string> => {
    const res = await api.post<{ url: string }>(`/documents/${id}/access-link`, null, {
      params: { purpose: 'download' },
    });
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    return `${baseUrl}${res.data.url}`;
  },
  reExtractPlan: async (
    id: number,
    options?: { put_on_calendar?: boolean; preview_only?: boolean },
  ): Promise<PlanReExtractResult> => {
    const res = await api.post(`/documents/${id}/re-extract-plan`, null, {
      params: {
        put_on_calendar: options?.preview_only ? false : options?.put_on_calendar !== false,
        preview_only: Boolean(options?.preview_only),
      },
    });
    return res.data;
  },
  confirmPlanEvent: async (
    id: number,
    payload: PlanEventConfirmPayload,
  ): Promise<PlanReExtractResult> => {
    const res = await api.post(`/documents/${id}/confirm-plan-event`, payload);
    return res.data;
  },
};
