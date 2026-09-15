import mongoose from "mongoose";
import {TENANT_STATUS_VALUES} from "./tenant.constants.js"


const tenantSchema = new mongoose.Schema(
  {
    name : {
      type : String,
      required : true,
      trim : true,
      minLength : 2,
      maxLength : 100
    },
    slug : {
      type : String,
      required : true,
      trim : true,
      lowercase : true,
      minLength : 2,
      maxLength : 100,
      
      immutable : true
    },
    description : {
      type : String,
      trim : true,
      maxLength : 500,
      default : ""
    },
    website : {
      type : String,
      trim : true,
      lowercase : true,
      maxLength : 1024,
      default : ""
    },
    status : {
      type : String,
      enum : TENANT_STATUS_VALUES,
      default : "active",
    },

    // ── Webhook delivery configuration ───────────────────────────────────────
    // webhookUrl: the HTTPS endpoint NotifyHub POSTs events to.
    webhookUrl : {
      type : String,
      trim : true,
      maxLength : 2048,
      default : null,
    },
    // webhookSecret: used to sign payloads with HMAC-SHA256.
    // select:false ensures it is NEVER returned in normal API queries.
    // It must be explicitly requested with .select("+webhookSecret").
    webhookSecret : {
      type : String,
      trim : true,
      maxLength : 512,
      default : null,
      select : false,
    },
  },{
    timestamps : true,
    versionKey : false
  }
);

tenantSchema.index({slug : 1},{unique : true});
tenantSchema.index({status : 1, createdAt : -1});

export const Tenant = mongoose.model("Tenant",tenantSchema);
