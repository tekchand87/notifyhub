import { apiClient } from '@/lib/api-client';
import type {
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  RegisterResponse,
  User,
  ChangePasswordRequest,
  ApiResponse,
} from '@/types';

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<ApiResponse<LoginResponse>>('/api/v1/auth/login', data);
    return res.data.data!;
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const res = await apiClient.post<ApiResponse<RegisterResponse>>('/api/v1/auth/register', data);
    return res.data.data!;
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get<ApiResponse<{ user: User }>>('/api/v1/auth/me');
    return res.data.data!.user;
  },

  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    await apiClient.post('/api/v1/auth/change-password', data);
  },
};
