import {apiKey, apiKey} from "./apiKey.models.js"
import {AppError} from "../../utils/AppError.js"

import {generateApiKey,hashApiKey} from "../../utils/apiKey.js"

export const createApiKey = async(tenantId,input)=>{
  const {rawApiKey,keyPrefix} = generateApiKey();

  const keyHash = hashApiKey(rawApiKey);

  const apiKey = await apiKey.create({
    tenantId,
    name : input.name,
    keyPrefix,
    keyHash ,
    scopes : input.scopes ?? [],
    expiresAt : input.expiresAt ?? null
  });

  return {
    apiKey : {
      id : apiKey._id,
      name : apiKey.name,
      keyPrefix  : apiKey.keyPrefix,
      scopes : apiKey.scopes,
      isActive : apiKey.isActive,
      expiresAt : apiKey.expiresAt,
      createdAt : apiKey.createdAt
    },
    rawApiKey
  };
};

export const listApiKeys = async(tenantId)=>{
  return apiKey.find({tenantId})
  .select("name keyPrefix scopes isActive expiresAt lastUsedAt createdAt")
  .sort({createdAt : -1})
  .lean()
};

export const getApiKey = async(tenantId,apiKeyId)=>{
  const apiKey = await apiKey.findOne({ _id : apiKeyId,tenantId})
  .select("name keyPrefix scopes isActive expiresAt lastUsedAt createdAt updatedAt")
  .lean()

  if(!apiKey){
    throw new AppError("API key is not found",404);
  }
  return apiKey;
};

export const revokeApiKey = async(tenantId,apiKeyId)=>{
  const apikey = await ApiKey.findOne({_id : apiKeyId,tenantId});

  if(!apiKey){
    throw new AppError("API Key is not found",404);
  }

  if(!apiKey.isActive){
    throw new AppError("API KEY is already Revoked",400);
  }
  apiKey.isActive = false;
  apiKey.save();

  return {
    message : "API Key Revoked Successfully"
  };
};