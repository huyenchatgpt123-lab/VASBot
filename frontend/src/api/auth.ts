import api from './client';
import { User } from '../types';

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post('/login', { email, password });
    return res.data;
  },
  getMe: async (): Promise<User> => {
    const res = await api.get('/me');
    return res.data;
  },
};
