import {Tenant } from "../modules/tenant/tenant.model.js"
import {AppError} from "../utils/AppError.js"

export const requireActiveTenant  = async(req,res,next)=>{
  try{
    if(!req.user?.tenantId){
      throw new AppError("Tenant Context is missing",401);
    }
    const tenant = await Tenant.findById(req.user.tenantId);
    if(!tenant){
      throw new AppError("Tenant not found",404);
    }

    if(tenant.status !=="active"){
      throw new AppError("This Tenant is not Active and cannot access the platform",403);
    }

    req.tenant = tenant;
    next();
  }catch(error){
    next(error);
  }
};

