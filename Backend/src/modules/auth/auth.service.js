import bcrypt from "bcrypt";

import {User} from "./user.model.js";
import {Tenant} from "../tenant/tenant.model.js";
import { buildTenantSlug } from "../../utils/tenantSlug.js";
import {USER_ROLES} from "./auth.contants.js";
import {AppError} from "../../utils/AppError.js";
import {generateAccessToken} from "../../utils/jwt.js";

const SALTS_ROUNDS=12;

const toSafeUser = (user)=>({
  id : user._id,
  name : user.name,
  email : user.email,
  tenantId : user.tenantId,
  role : user.role,
  isActive : user.isActive,
  createAt : user.createAt
});

export const register  = async ({name,email,password,tenantName})=>{
  const existingUser = await User.findOne({email});

  if(existingUser){
    throw new AppError("an account with this email already exists",409);
  }
  const tenant  = await Tenant.create({
    name : tenantName,
    slug : buildTenantSlug(tenantName)
  });

  const HashPassword = await bcrypt.hash(password,SALTS_ROUNDS);

  const user = await User.create({
    name,
    email,
    passwordHash:HashPassword,
    tenantId: tenant._id,
    role : USER_ROLES.TENANT_ADMIN
  });

  const accessToken = generateAccessToken(user);

  return {
    user : toSafeUser(user),
    tenant :{
      id : tenant._id,
      name : tenant.name
    },
    accessToken
  };
};

export const login = async({email,password})=>{
  const user = await User.findOne({email}).select("+passwordHash");

  if(!user){
    throw new AppError("Invalid Email or password ",409);
  }

  const passwordMatch = await bcrypt.compare(password,user.passwordHash);

  if(!passwordMatch){
    throw new AppError("Invalid Email or Password",401);
  }

  if(!user.isActive){
    throw new AppError("This Account is InActive",403);
  }

  const accessToken = generateAccessToken(user);

  return {
    user : toSafeUser(user),
    accessToken
  };
};

export const getCurrentUser = async(userId)=>{
  const user = await User.findById(userId);
  if(!user){
    throw new AppError("User no Longer Exists",401);
  };
  return toSafeUser(user);
}
export const changePassword = async(userId,currentPassword,newPassword)=>{
  const user = await User.findById(userId)
  .select("+passwordHash");

  if(!user){
    throw new AppError("user not found",404);
  }

  const passwordMatches = await bcrypt.compare(currentPassword,user.passwordHash);

  if(!passwordMatches){
    throw new AppError("current Password is incorrect",401);
  }

  const newPasswordHash = await bcrypt.hash(newPassword,SALTS_ROUNDS);

  user.passwordHash = newPasswordHash;
  await user.save();

  return {
    message : "Password changed successfully"
  };
};




