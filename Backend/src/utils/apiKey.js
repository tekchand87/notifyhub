import crypto from "crypto";
import {API_KEY_PREFIX} from "../modules/apiKey/apiKey.constants.js"

export const generateApiKey = ()=>{
  const secret = crypto.randomBytes(32).toString("hex");
  const rawApiKey = `${API_KEY_PREFIX}${secret}`;
  const keyPrefix = rawApiKey.slice(0,12);

  return {
    rawApiKey,keyPrefix
  };
};

export const hashApiKey = (rawApiKey)=>{
  return crypto
  .createHash("sha256")
  .update(rawApiKey)
  .digest("hex");
}