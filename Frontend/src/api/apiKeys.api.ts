import { apiClient } from '@/lib/api-client';
import type { ApiKey, CreateApiKeyRequest, ApiResponse } from '@/types';

interface CreateApiKeyResponse {
  apiKey: ApiKey;
  rawApiKey: string;
}

export const apiKeysApi = {
  list: async (): Promise<ApiKey[]> => {
    const res = await apiClient.get<ApiResponse<ApiKey[]>>('/api/v1/api-keys');
    return res.data.data!;
  },

  get: async (id: string): Promise<ApiKey> => {
    const res = await apiClient.get<ApiResponse<ApiKey>>(`/api/v1/api-keys/${id}`);
    return res.data.data!;
  },

  create: async (data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> => {
    const res = await apiClient.post<ApiResponse<CreateApiKeyResponse>>('/api/v1/api-keys', data);
    return res.data.data!;
  },

  revoke: async (id: string): Promise<void> => {
    await apiClient.patch(`/api/v1/api-keys/${id}/revoke`);
  },
};
