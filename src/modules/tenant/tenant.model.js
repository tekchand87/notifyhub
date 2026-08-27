import mongoose from "mongoose";
import {TENANT_STATUS_VALUES} from "./tenant.constants.js"
import { maxLength, minLength } from "zod";

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
      unique : true,
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
      index : true
    }
  },{
    timestamps : true,
    versionKey : false
  }
);

tenantSchema.index({slug : 1},{unique : true});
tenantSchema.index({status : 1},{createdAt : -1});

export const Tenant = mongoose.model("Tenant",tenantSchema);

