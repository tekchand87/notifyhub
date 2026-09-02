import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '@/api/events.api';
import type { EventListParams } from '@/types';

export const EVENTS_KEY = ['events'] as const;
export const eventKey = (id: string) => ['event', id] as const;

export function useEvents(params: EventListParams = {}) {
  return useQuery({
    queryKey: [...EVENTS_KEY, params],
    queryFn: () => eventsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: eventKey(eventId),
    queryFn: () => eventsApi.get(eventId),
    enabled: !!eventId,
  });
}
