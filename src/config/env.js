import dotenv from "dotenv"

dotenv.config();

const requiredEnv = [
  "MONGODB_URI",
  "JWT_SECRET"
];

for(const key of requiredEnv){
  if(!process.env[key]){
    throw new Error(`Missing required environment variable : ${key}`);
  }
}

export const env = {
  PORT : process.env.PORT || 5000,
  NODE_ENV : process.env.NODE_ENV || "development",
  MONGODB_URI : process.env.MONGODB_URI ,
  JWT_SECRET : process.env.JWT_SECRET,
  JWT_EXPIRES_IN : process.env.JWT_EXPIRES_IN || "1d"
};