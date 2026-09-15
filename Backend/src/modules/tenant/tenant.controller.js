import { tenantService } from "./tenant.service.js";


const getMyTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.getMyTenant(req.user.tenantId);
    res.status(200).json({
      success: true,
      data: {
        tenant: tenantService.toSafeTenant(tenant)
      }
    });
  } 
  catch (error) {
    next(error);
  }
};


const updateMyTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.updateMyTenant(
    req.user.tenantId,
    req.body
    );
    res.status(200).json({
      success: true,
      message: "Tenant updated successfully",
      data: {
        tenant: tenantService.toSafeTenant(tenant)
      }
    });
  } 
  catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/tenant/webhook
 * Admin only. Updates webhook URL and/or secret.
 * The secret is NEVER returned in the response.
 */
const updateWebhookConfig = async (req, res, next) => {
  try {
    const safeTenant = await tenantService.updateWebhookConfig(
      req.user.tenantId,
      req.body
    );
    res.status(200).json({
      success: true,
      message: "Webhook configuration updated",
      data: {
        tenant: safeTenant
      }
    });
  } catch (error) {
    next(error);
  }
};

const listMembers = async (req, res, next) => {
  try {
    const result = await tenantService.listTenantMembers(
      req.user.tenantId,
      req.query
    );
    res.status(200).json({
      success: true,
      data: {
      members: result.items.map(tenantService.toSafeMember),
      pagination: result.pagination
      }
    });
  } 
  catch (error) {
    next(error);
  }
};

const getMember = async (req, res, next) => {
  try {
    const member = await tenantService.getTenantMember(
    req.user.tenantId,
    req.params.userId
    );
    res.status(200).json({
      success: true,
      data: {
      member: tenantService.toSafeMember(member)
      }
    });
  } catch (error) {
    next(error);
  }
};


const updateMember = async (req, res, next) => {
  try {
    const member = await tenantService.updateTenantMember(
    req.user.tenantId,
    req.params.userId,
    req.user._id,
    req.body
    );
    res.status(200).json({
    success: true,
    message: "Member updated successfully",
    data: {
      member: tenantService.toSafeMember(member)
    }
    });
  } 
  catch (error) {
    next(error);
  }
};

const addMember = async (req, res, next) => {
  try {
    const user = await tenantService.addTenantMember(
      req.user.tenantId,
      req.body
    );
    res.status(201).json({
      success: true,
      message: "Member added successfully",
      data: {
        member: tenantService.toSafeMember(user)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const tenantController = {
getMyTenant,
updateMyTenant,
updateWebhookConfig,
listMembers,
getMember,
updateMember,
addMember
};
