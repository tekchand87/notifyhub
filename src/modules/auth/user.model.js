import mongoose from "mongoose";
import { required } from "zod/mini";

const userSchema = new mongoose.Schema({
  name : {
    type : String,
    required : true,
    minLength : 2,
    maxLength : 100,
    trim : true
  },
  email : {
    type : String,
    required : true,
    unique : true,
    trime : true,
    lowercase :true
  },
  passwordHash : {
    type : String,
    required : true,
    select : false
  },
  tenantId : {
    type : mongoose.Schema.Types.ObjectId,
    ref : "Tenant",
    required : true
  },
  role : {
    type : String,
    enum : ["tenant_admin","member"],
    default : "member"
  },
  isActive : {
    type : Boolean ,
    default : true
  }
},{
  timestamps: true
})

export const User = mongoose.model("User",userSchema);
