import mongoose from "mongoose"
import {EVENT_CHANNELS_VALUES,EVENT_STATUS_VALUES,EVENT_STATUS} from "./event.constants.js"

const eventSchema = new mongoose.Schema({
  tenantId : {
    type : mongoose.Schema.Types.ObjectId,
    ref : "Tenant",
    required : true,
    index : true
  },
  type : {
    type : String,
    required : true,
    trim : true,
    minLength : 2,
    maxLength : 100,
  },
  channel : {
    type : String,
    enum : EVENT_CHANNELS_VALUES,
    required : true
  },
  payload : {
    type : mongoose.Schema.Types.Mixed,
    required : true
  },
  status : {
    type : String,
    enum : EVENT_STATUS_VALUES,
    default : EVENT_STATUS.QUEUED,
    index : true
  }
},{
  timestamps : true,
  versionKey : false
})

eventSchema.index({tenantId : 1, createdAt : -1});
eventSchema.index({tenantId : 1,status : 1,createdAt : -1});
eventSchema.index({tenantId : 1,channel : 1,createdAt : -1});

export const Event = mongoose.model("Event",eventSchema);