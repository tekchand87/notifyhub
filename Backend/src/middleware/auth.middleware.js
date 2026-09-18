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
      .select("name email tenantId role isActive tokenVersion");

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

    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new AppError("Authentication token has been revoked", 401);
    }

    // Attach user to request
    req.user = user;

    return next();

  } catch (error) {

    // JWT expired
    if (error.name === "TokenExpiredError") {
      return next(
        new AppError(
          "Authentication token has expired",
          401
        )
      );
    }

    // Invalid JWT signature / malformed / wrong algorithm
    if (error.name === "JsonWebTokenError") {
      return next(
        new AppError(
          "Invalid authentication token",
          401
        )
      );
    }

    // Mongoose CastError: malformed JWT payload containing an invalid ObjectId
    // (e.g., JWT was signed with the right secret but userId is garbage)
    if (error.name === "CastError" || error.name === "BSONError") {
      return next(
        new AppError(
          "Invalid authentication token",
          401
        )
      );
    }

    // Re-throw operational AppErrors (e.g., "User account no longer exists")
    if (error.isOperational) {
      return next(error);
    }

    // Any other unexpected error during auth — treat as 401, not 500,
    // so we never leak internal details through an auth endpoint.
    return next(
      new AppError(
        "Authentication failed",
        401
      )
    );
  }
};
