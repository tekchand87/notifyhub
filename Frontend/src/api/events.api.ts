import { apiClient } from '@/lib/api-client';
import type {
  Event,
  EventListParams,
  EventListResponse,
  ApiResponse,
} from '@/types';

export const eventsApi = {
  list: async (params: EventListParams = {}): Promise<EventListResponse> => {
    // Strip empty string filter values so they don't pollute the query string
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== '' && v !== undefined),
    );
    const res = await apiClient.get<ApiResponse<EventListResponse>>('/api/v1/events', {
      params: cleanParams,
    });
    return res.data.data!;
  },

  get: async (eventId: string): Promise<Event> => {
    const res = await apiClient.get<ApiResponse<{ event: Event }>>(`/api/v1/events/${eventId}`);
    return res.data.data!.event;
  },
};
