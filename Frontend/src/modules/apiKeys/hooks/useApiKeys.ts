import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi } from '@/api/apiKeys.api';
import type { CreateApiKeyRequest } from '@/types';

export const API_KEYS_KEY = ['api-keys'] as const;

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_KEY,
    queryFn: apiKeysApi.list,
    staleTime: 30_000,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => apiKeysApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: API_KEYS_KEY });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: API_KEYS_KEY });
    },
  });
}
