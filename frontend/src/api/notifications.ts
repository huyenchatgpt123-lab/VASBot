import api from './client';

export type AppNotification = {
  id: number;
  type: string;
  title: string;
  body?: string | null;
  link: string;
  ref_type?: string | null;
  ref_id?: number | null;
  is_read: boolean;
  created_at?: string | null;
};

export const notificationsApi = {
  list: async (limit = 20): Promise<{ items: AppNotification[]; unread_count: number }> => {
    const res = await api.get('/notifications', { params: { limit } });
    return res.data;
  },

  unreadCount: async (): Promise<number> => {
    const res = await api.get('/notifications/unread-count');
    return res.data.count ?? 0;
  },

  markRead: async (id: number): Promise<AppNotification> => {
    const res = await api.post(`/notifications/${id}/read`);
    return res.data;
  },

  markAllRead: async (): Promise<{ count: number }> => {
    const res = await api.post('/notifications/read-all');
    return res.data;
  },

  pushConfig: async (): Promise<{ enabled: boolean; public_key: string | null }> => {
    const res = await api.get('/notifications/push/config');
    return res.data;
  },

  pushSubscribe: async (data: {
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string;
  }): Promise<{ message: string }> => {
    const res = await api.post('/notifications/push/subscribe', data);
    return res.data;
  },

  pushUnsubscribe: async (endpoint: string): Promise<{ message: string; removed: boolean }> => {
    const res = await api.post('/notifications/push/unsubscribe', { endpoint });
    return res.data;
  },
};
