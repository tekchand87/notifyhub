import mongoose from "mongoose"
import bcrypt from "bcrypt"
import crypto from "crypto"
import {Tenant} from "./tenant.model.js"
import {User} from "../auth/user.model.js"
import {USER_ROLES} from "../auth/auth.contants.js"
import {AppError} from "../../utils/AppError.js"
import {buildTenantSlug} from "../../utils/tenantSlug.js"

const toSafeTenant = (tenant)=>({
  id : tenant._id,
  name : tenant.name,
  slug : tenant.slug,
  description : tenant.description,
  website : tenant.website,
  status : tenant.status,
  // Expose webhookUrl (not secret) so dashboard can show configuration status
  webhookUrl : tenant.webhookUrl ?? null,
  webhookConfigured : !!(tenant.webhookUrl),
  createdAt : tenant.createdAt,
  updatedAt : tenant.updatedAt
});

const toSafeMember = (user)=>({
  id : user._id,
  name : user.name,
  email : user.email,
  role : user.role,
  isActive : user.isActive,
  createdAt : user.createdAt,
  updatedAt : user.updatedAt
})

const getUniqueSlug = async(name,currentTenantId=null) => {
  const baseSlug = buildTenantSlug(name);
  const exisiting = await Tenant.findOne({
    slug : baseSlug,
    ...(currentTenantId ? {_id: {$ne: currentTenantId}} : {})
  })
  .select("_id")
  .lean();

  if(!exisiting){
    return baseSlug;
  }

  // Slug is immutable in this phase 2 design
  throw new AppError("A Tenant with this normalized name already exists",409);
};

export const getMyTenant = async(tenantId)=>{
  const tenant = await Tenant.findById(tenantId).lean();

  if(!tenant){
    throw new AppError("Tenant not found",404);
  }
  return tenant;
}

export const updateMyTenant = async(tenantId,updates)=>{
  const tenant = await Tenant.findById(tenantId);

  if(!tenant){
    throw new AppError("Tenant not found",404);
  }

  if(updates.name!==undefined && updates.name!==tenant.name){
    await getUniqueSlug(updates.name,tenant._id);
    tenant.name = updates.name;
  }

  if(updates.description!=undefined){
    tenant.description = updates.description;
  }

  if(updates.website!=undefined){
    tenant.website = updates.website;
  }

  await tenant.save();
  return tenant;
};

/**
 * Update webhook configuration for a tenant.
 * - If webhookUrl is null, clears webhook config.
 * - If webhookSecret is omitted, auto-generates a secure secret on first setup.
 * - The secret is NEVER returned; only a boolean `webhookConfigured` is exposed.
 */
export const updateWebhookConfig = async(tenantId, { webhookUrl, webhookSecret }) => {
  // Select +webhookSecret explicitly since it has select:false
  const tenant = await Tenant.findById(tenantId).select("+webhookSecret");

  if(!tenant){
    throw new AppError("Tenant not found",404);
  }

  // Clear webhook configuration
  if(webhookUrl === null){
    tenant.webhookUrl = null;
    tenant.webhookSecret = null;
    await tenant.save();
    return toSafeTenant(tenant);
  }

  if(webhookUrl !== undefined){
    tenant.webhookUrl = webhookUrl;
  }

  if(webhookSecret !== undefined && webhookSecret !== null){
    // User-provided secret
    tenant.webhookSecret = webhookSecret;
  } else if(!tenant.webhookSecret && webhookUrl) {
    // Auto-generate a secure 32-byte hex secret on first setup
    tenant.webhookSecret = crypto.randomBytes(32).toString("hex");
  }

  await tenant.save();
  return toSafeTenant(tenant);
};

/**
 * Retrieve tenant with webhookSecret for internal worker use only.
 * MUST NOT be called from API response paths.
 */
export const getTenantForWebhook = async(tenantId) => {
  return Tenant.findById(tenantId).select("+webhookSecret").lean();
};

export const listTenantMembers = async(tenantId,{page=1,limit=20,search=""}={})=>{

  const normalizedPage = Math.max(Number(page)||1,1);

  const normalizedLimit = Math.min(Math.max(Number(limit)||20,1),100);

  const skip = (normalizedPage-1)*(normalizedLimit);

  const filter = {
    tenantId : new mongoose.Types.ObjectId(tenantId)
  };

  if(search.trim()){
    const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { email: { $regex: safeSearch, $options: "i" } }
    ];
  }

  const [members,total] = await Promise.all([
    User.find(filter)
      .select("name email role isActive createdAt updatedAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .lean(),
    User.countDocuments(filter)
  ]);

  return {
    items : members ,
    pagination: {
    page: normalizedPage,
    limit: normalizedLimit,
    total,
    totalPages: Math.ceil(total / normalizedLimit)
  }}
}

export const getTenantMember = async (tenantId, userId) => {
if (!mongoose.isValidObjectId(userId)) {
  throw new AppError("Invalid member id", 400);
}
const member = await User.findOne({_id: userId,tenantId})
.select("name email role isActive createdAt updatedAt")
.lean();

if (!member) {
  throw new AppError("Member not found in this tenant", 404);
}
return member;
};
const countActiveTenantAdmins = async (tenantId) => {
return User.countDocuments({tenantId,role: USER_ROLES.TENANT_ADMIN,isActive: true});
};
export const updateTenantMember = async (tenantId,targetUserId,actorUserId,updates) => {
if (!mongoose.isValidObjectId(targetUserId)) {
  throw new AppError("Invalid member id", 400);
}
const member = await User.findOne({_id: targetUserId,tenantId});
if (!member) {
  throw new AppError("Member not found in this tenant", 404);
}
const isLastActiveAdmin = member.role === USER_ROLES.TENANT_ADMIN && member.isActive === true &&(updates.role === USER_ROLES.MEMBER || updates.isActive === false);

if (isLastActiveAdmin) {
  const activeAdminCount = await countActiveTenantAdmins(tenantId);
  if (activeAdminCount <= 1) {
    throw new AppError("The tenant must have at least one active tenant admin",409);
  }
}
if (
  String(member._id) === String(actorUserId) && updates.isActive === false) {
    throw new AppError("You cannot deactivate your own account through this endpoint",409);
}
if (updates.role !== undefined) {
member.role = updates.role;
}
if (updates.isActive !== undefined) {
member.isActive = updates.isActive;
}
await member.save();
return member;
};

export const addTenantMember = async (tenantId, { name, email, password, role = USER_ROLES.MEMBER }) => {
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new AppError("An account with this email already exists", 409);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    passwordHash,
    tenantId,
    role,
    isActive: true,
  });
  return user;
};

export const tenantService = {
getMyTenant,
updateMyTenant,
updateWebhookConfig,
getTenantForWebhook,
listTenantMembers,
getTenantMember,
updateTenantMember,
addTenantMember,
toSafeTenant,
toSafeMember
};
