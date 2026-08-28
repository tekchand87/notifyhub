import crypto from "crypto";
import {API_KEY_PREFIX} from "../modules/apiKey/apiKey.constants.js"

export const generateApiKey = ()=>{
  const secret = crypto.randomBytes(32).toString("hex");
  const rawApiKey = `${API_KEY_PREFIX}${secret}`;
  const keyprefix = rawApiKey.slice(0,12);

  return {
    rawApiKey,keyprefix
  };
};

export const hashApiKey = (rawApiKey)=>{
  return crypto
  .createHash("sha256")
  .update(rawApiKey)
  .digest("hex");
}