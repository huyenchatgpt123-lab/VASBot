import api from './client';
import { DashboardStats, ActivityData, User, Position, Department } from '../types';

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
  createUser: async (data: {
    name: string;
    nickname?: string;
    email: string;
    password: string;
    role: string;
    department_id?: number;
    position_id?: number;
  }) => {
    const res = await api.post('/admin/users', data);
    return res.data;
  },
  updateUser: async (id: number, data: {
    name?: string;
    nickname?: string | null;
    email?: string;
    password?: string;
    role?: string;
    department_id?: number;
    position_id?: number;
  }) => {
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
  getPositions: async (): Promise<Position[]> => {
    const res = await api.get('/admin/positions');
    return res.data;
  },
  createPosition: async (data: Omit<Position, 'id' | 'user_count'>) => {
    const res = await api.post('/admin/positions', data);
    return res.data as Position;
  },
  updatePosition: async (id: number, data: Partial<Omit<Position, 'id' | 'user_count'>>) => {
    const res = await api.put(`/admin/positions/${id}`, data);
    return res.data as Position;
  },
  deletePosition: async (id: number) => {
    const res = await api.delete(`/admin/positions/${id}`);
    return res.data;
  },
  getDepartments: async (): Promise<Department[]> => {
    const res = await api.get('/admin/departments');
    return res.data;
  },
  createDepartment: async (data: Omit<Department, 'id' | 'user_count'>) => {
    const res = await api.post('/admin/departments', data);
    return res.data as Department;
  },
  updateDepartment: async (id: number, data: Partial<Omit<Department, 'id' | 'user_count'>>) => {
    const res = await api.put(`/admin/departments/${id}`, data);
    return res.data as Department;
  },
  deleteDepartment: async (id: number) => {
    const res = await api.delete(`/admin/departments/${id}`);
    return res.data;
  },
};
