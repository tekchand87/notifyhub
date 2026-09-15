import { apiClient } from '@/lib/api-client';
import type {
  Member,
  MemberListParams,
  MemberListResponse,
  UpdateMemberRequest,
  AddMemberRequest,
  ApiResponse,
} from '@/types';

export const membersApi = {
  list: async (params: MemberListParams = {}): Promise<MemberListResponse> => {
    const res = await apiClient.get<ApiResponse<MemberListResponse>>('/api/v1/tenant/members', {
      params,
    });
    return res.data.data!;
  },

  get: async (userId: string): Promise<Member> => {
    const res = await apiClient.get<ApiResponse<{ member: Member }>>(
      `/api/v1/tenant/members/${userId}`,
    );
    return res.data.data!.member;
  },

  update: async (userId: string, data: UpdateMemberRequest): Promise<Member> => {
    const res = await apiClient.patch<ApiResponse<{ member: Member }>>(
      `/api/v1/tenant/members/${userId}`,
      data,
    );
    return res.data.data!.member;
  },

  add: async (data: AddMemberRequest): Promise<Member> => {
    const res = await apiClient.post<ApiResponse<{ member: Member }>>(
      '/api/v1/tenant/members',
      data,
    );
    return res.data.data!.member;
  },
};
