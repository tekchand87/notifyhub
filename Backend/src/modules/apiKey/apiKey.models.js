import mongoose from "mongoose"


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
  versionKey : "__v"
});

apiKeySchema.index({tenantId : 1 , isActive : 1 });
// keyHash is the authentication lookup identity; unique indexing both enforces
// collision safety and makes findOne({ keyHash, isActive }) an indexed lookup.
apiKeySchema.index({ keyHash: 1 }, { unique: true });

export const apiKey = mongoose.model("ApiKey",apiKeySchema);
