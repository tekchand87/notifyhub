export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  TENANT: '/tenant',
  TENANT_SETTINGS: '/tenant/settings',
  MEMBERS: '/tenant/members',
  MEMBER_DETAIL: (id: string) => `/tenant/members/${id}`,
  EVENTS: '/events',
  EVENT_DETAIL: (id: string) => `/events/${id}`,
  API_KEYS: '/api-keys',
  PROFILE: '/profile',
} as const;

export const USER_ROLES = {
  TENANT_ADMIN: 'tenant_admin',
  MEMBER: 'member',
} as const;

export const TENANT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;

export const EVENT_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  DLQ: 'dlq',
} as const;

export const EVENT_CHANNELS = {
  EMAIL: 'email',
  WEBHOOK: 'webhook',
} as const;

export const API_KEY_SCOPES = ['events:write'] as const;
