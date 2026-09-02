import { apiClient } from '@/lib/api-client';
import type {
  Tenant,
  UpdateTenantRequest,
  ApiResponse,
} from '@/types';

export const tenantApi = {
  getMyTenant: async (): Promise<Tenant> => {
    const res = await apiClient.get<ApiResponse<{ tenant: Tenant }>>('/api/v1/tenant');
    return res.data.data!.tenant;
  },

  updateMyTenant: async (data: UpdateTenantRequest): Promise<Tenant> => {
    const res = await apiClient.patch<ApiResponse<{ tenant: Tenant }>>('/api/v1/tenant', data);
    return res.data.data!.tenant;
  },
};
