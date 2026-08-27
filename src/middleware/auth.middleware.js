import {User} from "../modules/auth/user.model.js"
import {AppError} from "../utils/AppError.js"
import {verifyAccessToken} from "../utils/jwt.js";

export const requireAuth = async(req,res,next)=>{
  try{
    const authorization = req.headers.authorization;

    if(!authorization?.startsWith("Bearer ")){
      throw new AppError("Authorization token is required",401);
    }

    const token = authorization.slice(7);

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.userId)
    .select("name email tenantId role isActive");

    if(!user){
      throw new AppError("User account no long exists",401);
    }
    if(!user.isActive){
      throw new AppError("User is not Active",403);
    }
    req.user = user;
    next();
  }
  catch(error){
    if(error.name==="TokenExpiredError"){
      return next(new AppError("Authentication token is expired",401));
    }
    if(error.name==="JsonWebTokenError"){
      return next(new AppError("Invalid authentication token",401));
    }
    next(error);
  }

}