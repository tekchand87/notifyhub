// ─── Domain Types ────────────────────────────────────────────────────────────

export type UserRole = 'tenant_admin' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  role: UserRole;
  isActive: boolean;
  createAt: string;
}

export type TenantStatus = 'active' | 'suspended';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description: string;
  website: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EventChannel = 'email' | 'webhook';
export type EventStatus = 'queued' | 'processing' | 'delivered' | 'failed' | 'dlq';

export interface Event {
  _id: string;
  tenantId?: string;
  type: string;
  channel: EventChannel;
  payload: Record<string, unknown>;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface ApiError {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  tenantName: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface RegisterResponse {
  user: User;
  tenant: { id: string; name: string };
  accessToken: string;
}

// ─── Member List Types ────────────────────────────────────────────────────────

export interface MemberListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface MemberListResponse {
  members: Member[];
  pagination: Pagination;
}

// ─── Event List Types ─────────────────────────────────────────────────────────

export interface EventListParams {
  page?: number;
  limit?: number;
  status?: EventStatus | '';
  channel?: EventChannel | '';
}

export interface EventListResponse {
  events: Event[];
  pagination: Pagination;
}

// ─── Update Types ─────────────────────────────────────────────────────────────

export interface UpdateTenantRequest {
  name?: string;
  description?: string;
  website?: string;
}

export interface UpdateMemberRequest {
  role?: UserRole;
  isActive?: boolean;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes?: string[];
  expiresAt?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
