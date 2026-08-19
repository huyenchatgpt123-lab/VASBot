import axios from 'axios';
import { clearAuthSession, getToken } from '../utils/authStorage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Default request timeout — long imports override per call. */
export const DEFAULT_TIMEOUT_MS = 90_000;
export const IMPORT_TIMEOUT_MS = 300_000;

const api = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
