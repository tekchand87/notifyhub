import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '@/api/tenant.api';
import type { UpdateTenantRequest } from '@/types';

export const TENANT_KEY = ['tenant'] as const;

export function useTenant() {
  return useQuery({
    queryKey: TENANT_KEY,
    queryFn: tenantApi.getMyTenant,
    staleTime: 60_000,
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTenantRequest) => tenantApi.updateMyTenant(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANT_KEY });
    },
  });
}
