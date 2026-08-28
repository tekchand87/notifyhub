import mongoose from "mongoose"
import { maxLength, minLength } from "zod"
import { required } from "zod/mini"

const apiKeySchema = new mongoose.Schema({
  tenantId : {
    type : mongoose.Schema.Types.ObjectId,
    ref : "Tenant",
    required : true,
    index : true
  },
  name : {
    type : String,
    required : true,
    trim : true,
    minLength : 2,
    maxLength : 100,
  },
  keyPrefix : {
    type : String,
    required : true,
    index : true
  },
  keyHash :{
    type : String,
    required : true,
    select : false
  },
  scopes : {
    type : [String],
    default : []
  },
  isActive : {
    type : Boolean,
    default : true,
    index : true
  },
  expiresAt : {
    type : Date,
    default : null,
  },
  lastUsedAt : {
    type : Date,
    default : null
  }
},{
  timestamps : true,
  versionKey : true
});

apiKeySchema.index({tenantId : 1 , isActive : 1 });

export const apiKey = mongoose.model("ApiKey",apiKeySchema);
