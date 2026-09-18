import mongoose from "mongoose";


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
    trim : true,
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
    required : true,
    index : true
  },
  role : {
    type : String,
    enum : ["tenant_admin","member"],
    default : "member"
  },
  isActive : {
    type : Boolean ,
    default : true,
    index : true
  }
  ,tokenVersion: {
    type: Number,
    default: 0,
    min: 0,
  }
},{
  timestamps: true
})

userSchema.index({tenantId : 1,createdAt : -1})
userSchema.index({tenantId : 1 , role : 1, isActive : 1});

export const User = mongoose.model("User",userSchema);
