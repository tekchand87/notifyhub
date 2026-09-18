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

    // Do not turn every authenticated event into a MongoDB write. Visibility is
    // retained while writes are bounded to one per key per configured interval.
    const touchBefore = new Date(Date.now() - (Number(process.env.API_KEY_LAST_USED_UPDATE_MS) || 300_000));
    ApiKey.updateOne(
      { _id: apiKey._id, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: touchBefore } }] },
      { $set: { lastUsedAt: new Date() } }
    ).exec().catch(() => {});

    next();
  } catch (error) {
    next(error);
  }
};
