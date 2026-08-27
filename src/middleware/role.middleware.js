import {AppError} from "../utils/AppError.js"

export const requireRole = (...allworedRoles)=>{
  return (req,res,next)=>{
    if(!req.user){
      return next(new AppError("Authenctication is required",401));
    }

    if(!allworedRoles.includes(req.user.role)){
      return next(new AppError("You do not have permission to perform this action",403));
    }
    next();
  }
};

