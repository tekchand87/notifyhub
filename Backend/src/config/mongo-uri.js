// MongoDB URI validation and redaction helpers shared by the API and worker.
// Keep connection credentials in the environment; this module never logs or
// stores the URI itself.

const MONGODB_SCHEME = /^mongodb(?:\+srv)?:\/\//i;

export const validateMongoUri = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("MONGODB_URI must be a non-empty MongoDB connection string");
  }

  const uri = value.trim();
  if (!MONGODB_SCHEME.test(uri)) {
    throw new Error("MONGODB_URI must start with mongodb:// or mongodb+srv://");
  }
  if (/\s/.test(uri)) {
    throw new Error("MONGODB_URI must not contain whitespace");
  }

  const authorityAndPath = uri.slice(uri.indexOf("://") + 3);
  const authorityEnd = authorityAndPath.search(/[/?]/);
  const authority = authorityEnd === -1
    ? authorityAndPath
    : authorityAndPath.slice(0, authorityEnd);
  const credentialSeparator = authority.lastIndexOf("@");
  const userInfo = credentialSeparator === -1 ? "" : authority.slice(0, credentialSeparator);
  const hosts = authority.slice(credentialSeparator + 1).split(",");

  if (/[#@]/.test(userInfo)) {
    throw new Error("MONGODB_URI credentials contain unencoded special characters; URL-encode @ as %40 and # as %23");
  }

  if (hosts.some((host) => !host)) {
    throw new Error("MONGODB_URI must include at least one MongoDB host");
  }

  if (uri.toLowerCase().startsWith("mongodb+srv://") && hosts.some((host) => host.includes(":"))) {
    throw new Error("mongodb+srv:// URIs must not include a port number; use mongodb:// for Docker/local MongoDB");
  }

  return uri;
};

export const redactMongoUri = (value) =>
  String(value).replace(
    /(mongodb(?:\+srv)?:\/\/)[^/@\s]+@/i,
    "$1***@"
  );

export const redactMongoError = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown MongoDB error");
  return message.replace(
    /mongodb(?:\+srv)?:\/\/[^\s'"\)]+/gi,
    "mongodb://<redacted>"
  );
};
