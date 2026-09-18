import {apiKey as ApiKey} from "./apiKey.models.js"
import {AppError} from "../../utils/AppError.js"

import {generateApiKey,hashApiKey} from "../../utils/apiKey.js"

export const createApiKey = async(tenantId,input)=>{
  const {rawApiKey,keyPrefix} = generateApiKey();

  const keyHash = hashApiKey(rawApiKey);

  const createdKey = await ApiKey.create({
    tenantId,
    name : input.name,
    keyPrefix,
    keyHash ,
    scopes : input.scopes ?? [],
    expiresAt : input.expiresAt ?? null
  });

  return {
    apiKey : {
      id : createdKey._id,
      name : createdKey.name,
      keyPrefix  : createdKey.keyPrefix,
      scopes : createdKey.scopes,
      isActive : createdKey.isActive,
      expiresAt : createdKey.expiresAt,
      createdAt : createdKey.createdAt
    },
    rawApiKey
  };
};

export const listApiKeys = async(tenantId)=>{
  const keys = await ApiKey.find({tenantId})
  .select("name keyPrefix scopes isActive expiresAt lastUsedAt createdAt")
  .sort({createdAt : -1})
  .lean();

  // Normalize _id → id so the frontend receives a consistent string id field,
  // matching what createApiKey already returns.
  return keys.map(({ _id, ...rest }) => ({ id: String(_id), ...rest }));
};

export const getApiKey = async(tenantId,apiKeyId)=>{
  const foundKey = await ApiKey.findOne({ _id : apiKeyId,tenantId})
  .select("name keyPrefix scopes isActive expiresAt lastUsedAt createdAt updatedAt")
  .lean()

  if(!foundKey){
    throw new AppError("API key is not found",404);
  }
  return foundKey;
};

export const revokeApiKey = async(tenantId,apiKeyId)=>{
  const foundKey = await ApiKey.findOne({_id : apiKeyId,tenantId});

  if(!foundKey){
    throw new AppError("API Key is not found",404);
  }

  if(!foundKey.isActive){
    throw new AppError("API KEY is already Revoked",400);
  }
  foundKey.isActive = false;
  await foundKey.save();

  return {
    message : "API Key Revoked Successfully"
  };
};