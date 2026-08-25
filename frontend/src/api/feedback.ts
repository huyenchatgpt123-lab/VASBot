import api, { IMPORT_TIMEOUT_MS } from './client';

export interface FeedbackAttachment {
  id: number;
  filename: string;
  content_type?: string | null;
  size_bytes: number;
  created_at: string;
}

export interface FeedbackItem {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  content: string;
  status: string;
  created_at: string;
  attachments?: FeedbackAttachment[];
}

export interface FeedbackListResponse {
  feedbacks: FeedbackItem[];
  total: number;
}

const FEEDBACK_UPLOAD_TIMEOUT_MS = Math.max(IMPORT_TIMEOUT_MS, 300_000);

export const feedbackApi = {
  create: async (content: string, files: File[] = []): Promise<FeedbackItem> => {
    const form = new FormData();
    form.append('content', content);
    for (const f of files) {
      form.append('files', f);
    }
    const res = await api.post('/feedback', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: files.length ? FEEDBACK_UPLOAD_TIMEOUT_MS : undefined,
    });
    return res.data;
  },

  getMine: async (): Promise<FeedbackListResponse> => {
    const res = await api.get('/feedback/mine');
    return res.data;
  },

  getAll: async (status?: string): Promise<FeedbackListResponse> => {
    const res = await api.get('/feedback', { params: status ? { status } : {} });
    return res.data;
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    const res = await api.get('/feedback/unread-count');
    return res.data;
  },

  markRead: async (feedbackId: number) => {
    const res = await api.patch(`/feedback/${feedbackId}/read`);
    return res.data;
  },

  downloadAttachment: async (feedbackId: number, attachmentId: number, filename: string) => {
    const res = await api.get(`/feedback/${feedbackId}/attachments/${attachmentId}`, {
      responseType: 'blob',
      timeout: FEEDBACK_UPLOAD_TIMEOUT_MS,
    });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  /** Open image/video inline in a new tab when possible. */
  openAttachment: async (feedbackId: number, attachmentId: number) => {
    const res = await api.get(`/feedback/${feedbackId}/attachments/${attachmentId}`, {
      responseType: 'blob',
      timeout: FEEDBACK_UPLOAD_TIMEOUT_MS,
    });
    const url = window.URL.createObjectURL(res.data);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke later so the tab can load
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
