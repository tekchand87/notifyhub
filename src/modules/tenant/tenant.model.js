import mongoose from "monogose";

const tenantSchema = new mongoose.Schema(
  {
    name : {
      type : String,
      required : true,
      trim : true,
      minLength : 2,
      maxLength : 100
    },
    isActive : {
      type : Boolean ,
      default : true
    }
  },{
    timestamps : true
  }
);

export const Tenant = mongoose.model("Tenant",tenantSchema);

