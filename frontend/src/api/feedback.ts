import api from './client';

export interface FeedbackItem {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  content: string;
  status: string;
  created_at: string;
}

export interface FeedbackListResponse {
  feedbacks: FeedbackItem[];
  total: number;
}

export const feedbackApi = {
  create: async (content: string): Promise<FeedbackItem> => {
    const res = await api.post('/feedback', { content });
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
};
