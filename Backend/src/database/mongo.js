import mongoose from "mongoose";
import {env} from "../config/env.js"

export const connectMongoDB = async() =>{
  try{
    await mongoose.connect(env.MONGODB_URI, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 50,
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 5_000,
      connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10_000,
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45_000,
      retryWrites: process.env.MONGO_RETRY_WRITES !== "false",
      autoIndex: process.env.NODE_ENV !== "production",
    });
    console.log("MongoDB Connected ");
  }catch(error){
    console.error("MongoDB connection  failed :",error.message);
    process.exit(1);
  }
}

export const disconnectMongoDB = async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log("MongoDB Disconnected");
};
