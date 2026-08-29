import { AppError } from "../utils/AppError.js";

export const requireApiKeyScope = (
  requiredScope
) => {
  return (req, res, next) => {
    try {
      const scopes = req.apiKey?.scopes ?? [];

      if (!scopes.includes(requiredScope)) {
        throw new AppError(
          `API key requires scope: ${requiredScope}`,
          403
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};