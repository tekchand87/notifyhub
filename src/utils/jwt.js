import jwt from "jsonwebtoken"
import {env} from "../config/env.js"

export const generateAccessToken = (user)=>{
  return jwt.sign({
    userId : user._Id.toString(),
    tenantId : user.tenantId.toString(),
    roler : user.role
  },
  env.JWT_SECRET,
  {
    expiresIn :  env.JWT_EXPIRES_IN
  }
);
};

export const verifyAccessToken = (token) =>{
  return jwt.verify(token,env.JWT_SECRET);
};