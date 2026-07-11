import api from './client';
import { DashboardStats, ActivityData, User } from '../types';

export const adminApi = {
  getDashboard: async (params?: { start_date?: string; end_date?: string }) => {
    const res = await api.get('/admin/dashboard', { params });
    return res.data as {
      stats: DashboardStats;
      activity: ActivityData[];
    };
  },
  getUsers: async (): Promise<User[]> => {
    const res = await api.get('/admin/users');
    return res.data;
  },
  createUser: async (data: { name: string; nickname: string; email: string; password: string; role: string; department?: string; position?: string }) => {
    const res = await api.post('/admin/users', data);
    return res.data;
  },
  updateUser: async (id: number, data: { name?: string; nickname?: string; email?: string; password?: string; role?: string; department?: string; position?: string }) => {
    const res = await api.put(`/admin/users/${id}`, data);
    return res.data;
  },
  deleteUser: async (id: number) => {
    const res = await api.delete(`/admin/users/${id}`);
    return res.data;
  },
  importExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/admin/users/import-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data as { message: string; created: number; skipped: number; errors: string[] };
  },
};
