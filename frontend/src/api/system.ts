import api from './client';

export type SystemStatus = {
  busy: boolean;
  job: string | null;
  message: string | null;
  started_at: string | null;
};

export const systemApi = {
  getStatus: async (): Promise<SystemStatus> => {
    const res = await api.get('/system/status');
    return res.data;
  },
};
