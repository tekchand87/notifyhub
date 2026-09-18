import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      tenantId: user.tenantId.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    },
    env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || env.JWT_EXPIRES_IN || "15m"
    }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};
