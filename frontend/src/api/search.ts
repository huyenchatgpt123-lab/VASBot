import api from './client';
import { SearchResult } from '../types';

export const searchApi = {
  search: async (query: string) => {
    const res = await api.get('/search', { params: { query } });
    return res.data as { query: string; results: SearchResult[] };
  },
};
