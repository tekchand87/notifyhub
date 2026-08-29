import crypto from "crypto";

import { apiKey as ApiKey } from "../modules/apiKey/apiKey.models.js";

import { AppError } from "../utils/AppError.js";

export const requireApiKey = async (
  req,
  res,
  next
) => {
  try {
    const rawKey = req.headers["x-api-key"];

    if (!rawKey) {
      throw new AppError(
        "API key is required",
        401
      );
    }

    const keyHash = crypto
      .createHash("sha256")
      .update(rawKey)
      .digest("hex");

    const apiKey = await ApiKey.findOne({
      keyHash,
      isActive: true
    });

    if (!apiKey) {
      throw new AppError(
        "Invalid API key",
        401
      );
    }

    if (
      apiKey.expiresAt &&
      apiKey.expiresAt <= new Date()
    ) {
      throw new AppError(
        "API key has expired",
        401
      );
    }

    req.apiKey = apiKey;
    req.tenantId = apiKey.tenantId;

    apiKey.lastUsedAt = new Date();

    await apiKey.save();

    next();
  } catch (error) {
    next(error);
  }
};