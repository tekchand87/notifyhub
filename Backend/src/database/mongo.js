import mongoose from "mongoose";
import {env} from "../config/env.js"

export const connectMongoDB = async() =>{
  try{
    await mongoose.connect(env.MONGODB_URI);
    console.log("MongoDB Connected ");
  }catch(error){
    console.error("MongoDB connection  failed :",error.message);
    process.exit(1);
  }
}