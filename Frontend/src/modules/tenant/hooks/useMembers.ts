import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membersApi } from '@/api/members.api';
import type { MemberListParams, UpdateMemberRequest } from '@/types';

export const MEMBERS_KEY = ['members'] as const;
export const memberKey = (id: string) => ['member', id] as const;

export function useMembers(params: MemberListParams = {}) {
  return useQuery({
    queryKey: [...MEMBERS_KEY, params],
    queryFn: () => membersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useMember(userId: string) {
  return useQuery({
    queryKey: memberKey(userId),
    queryFn: () => membersApi.get(userId),
    enabled: !!userId,
  });
}

export function useUpdateMember(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateMemberRequest) => membersApi.update(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      qc.invalidateQueries({ queryKey: memberKey(userId) });
    },
  });
}
