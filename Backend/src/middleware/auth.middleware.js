import { User } from "../modules/auth/user.model.js";
import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    // Check Authorization header
    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(
        "Authorization token is required",
        401
      );
    }

    // Remove "Bearer " from the token
    const token = authorization.slice(7);

    // Verify JWT
    const payload = verifyAccessToken(token);

    // Find user from database
    const user = await User.findById(payload.userId)
      .select("name email tenantId role isActive");

    // Check user exists
    if (!user) {
      throw new AppError(
        "User account no longer exists",
        401
      );
    }

    // Check user is active
    if (!user.isActive) {
      throw new AppError(
        "User is not active",
        403
      );
    }

    // Attach user to request
    req.user = user;

    return next();

  } catch (error) {

    // JWT expired
    if (error.name === "TokenExpiredError") {
      return next(
        new AppError(
          "Authentication token is expired",
          401
        )
      );
    }

    // Invalid JWT
    if (error.name === "JsonWebTokenError") {
      return next(
        new AppError(
          "Invalid authentication token",
          401
        )
      );
    }

    return next(error);
  }
};