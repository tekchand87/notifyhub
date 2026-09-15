import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from './auth';

// ── Base URL ───────────────────────────────────────────────────────────────────
// Development: leave VITE_API_BASE_URL empty → Axios uses relative paths
//   (/api/v1/...) which the Vite dev server proxy forwards to Express :3000.
//   This avoids CORS issues and ensures all requests go through the same origin.
//
// Production: set VITE_API_BASE_URL=https://api.yourdomain.com in .env
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ─── Request interceptor — attach Bearer token ────────────────────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor — normalize errors, handle 401 ─────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => {
    if (error.response?.status === 401) {
      tokenStorage.clear();
      // Only hard-redirect to login if not already on an auth page.
      // Use replace() so the browser Back button doesn't loop back.
      const isAuthPage =
        window.location.pathname === '/login' ||
        window.location.pathname === '/register';
      if (!isAuthPage) {
        window.location.replace('/login');
      }
    }

    const message =
      error.response?.data?.message ??
      error.response?.data?.error ??
      error.message ??
      'An unexpected error occurred';

    const normalized = new Error(message) as Error & { status: number };
    normalized.status = error.response?.status ?? 0;
    return Promise.reject(normalized);
  },
);
