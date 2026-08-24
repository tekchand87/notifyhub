import {User} from "../modules/auth/user.model.js"
import {AppError} from "../utils/AppError.js"
import {verifyAccessToken} from "../utils/jwt.js";

export const requireAuth = async(req,res,next)=>{
  try{
    const authorization = req.headers.authorization;

    if(!authorization){
      throw new AppError("Authorization headers is required",401);
    }

    const [schema,token] = authorization.split(" ");

    if(schema!=="Bearer" || !token){
      throw  new AppError("Use Authorization  : Bearer <token>",401);
    }
    
    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.userId);

    if(!user || !user.isActive){
      throw new AppError("Authentication fail",401);
    }

    req.user = {
      userId : user._id.toString(),
      tenantId : user.tenantId.toString(),
      role : user.role
    };
    next();
  }
  catch(error){
    return res.status(401).json({
      sucess : false,
      message : "Invalid access token"
    });
  }

}