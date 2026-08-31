export const errorHandler = (error, req, res, next) => {
  console.error(error);
  if (error.code === 11000) {
    const duplicateFields = Object.keys(error.keyPattern || {}).join(", ");
    return res.status(409).json({
      success: false,
      message: `Duplicate value for: ${duplicateFields || "unique field"}`
    });
  }
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : error.message
  });
};