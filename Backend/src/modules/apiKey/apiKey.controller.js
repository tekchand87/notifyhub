import * as apiKeyService from "./apiKey.service.js"

export const createApiKey = async(req,res,next)=>{
  try{
    const result = await apiKeyService.createApiKey(req.user.tenantId,req.body);

    return res.status(201).json({
      success : true,
      message : "API Key created Successfully",
      data : result
    })
  }
  catch(error){
    next(error);
  }
}
export const listApiKeys = async(req,res,next)=>{
  try{
    const result = await apiKeyService.listApiKeys(req.user.tenantId);
    return res.status(200).json({
      success : true,
      data : result
    });
  }
  catch(error){
    next(error);
  }
}
export const getApiKey = async(req,res,next)=>{
  try{
    const result = await apiKeyService.getApiKey(req.user.tenantId,req.params.apiKeyId);
    return res.status(200).json({
      success : true,
      data : result
    })
  }
  catch(error){
    next(error);
  }
}
export const revokeApiKey = async(req,res,next)=>{
  try{
    const result = await apiKeyService.revokeApiKey(req.user.tenantId,req.params.apiKeyId);

    return res.status(200).json({
      success : true,
       ...result
    })
  }
  catch(error){
    next(error);
  }
}