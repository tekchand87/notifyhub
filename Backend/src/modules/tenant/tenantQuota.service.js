import { Tenant } from "./tenant.model.js";

const cache = new Map();
const cacheTtlMs = () => Number(process.env.TENANT_QUOTA_CACHE_TTL_MS) || 60_000;

const defaults = () => ({
  ratePerSecond: Number(process.env.TENANT_RATE_LIMIT_PER_SECOND) || 1_000,
  burst: Number(process.env.TENANT_RATE_LIMIT_BURST) || 2_000,
});

// Quotas are cached per process to avoid a tenant MongoDB lookup on every event.
// Redis counters remain the distributed source of truth; cache staleness affects
// only how quickly an administrative quota change takes effect.
export const getTenantEventQuota = async (tenantId) => {
  const key = String(tenantId);
  const cached = cache.get(key);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.pending) return cached.pending;

  const staleValue = cached?.value;
  const pending = Tenant.findById(tenantId).select("ingestionRateLimit").lean()
    .then((tenant) => {
      const configured = tenant?.ingestionRateLimit || {};
      const fallback = defaults();
      const value = {
        ratePerSecond: Number(configured.eventsPerSecond) > 0 ? Number(configured.eventsPerSecond) : fallback.ratePerSecond,
        burst: Number(configured.burst) > 0 ? Number(configured.burst) : fallback.burst,
      };
      cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs() });
      return value;
    })
    .catch((error) => {
      // Preserve the last known safe quota through a transient MongoDB failure.
      // A later refresh can still apply an administrator's changed quota.
      if (staleValue) {
        cache.set(key, { value: staleValue, expiresAt: Date.now() + cacheTtlMs() });
        return staleValue;
      }
      cache.delete(key);
      throw error;
    });
  cache.set(key, { pending });
  return pending;
};

export const invalidateTenantEventQuota = (tenantId) => cache.delete(String(tenantId));
export const clearTenantQuotaCache = () => cache.clear();
