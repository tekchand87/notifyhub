import mongoose from "mongoose";

const allowedChannels = new Set(["email","webhook"]);

export class KafkaPoisonMessageError extends Error {
   constructor(message) {
      super(message);
      this.name = "KafkaPoisonMessageError";
      this.isKafkaPoisonMessage = true;
   }
}

export const parseKafkaEvent = (message)=>{
   const raw = message.value?.toString();

   if(!raw){
      throw new KafkaPoisonMessageError("Kafka message has no value");
   }
   let data ;
   try{
      data = JSON.parse(raw);
   }
   catch(error){
      throw new KafkaPoisonMessageError("Kafka message contains invalid JSON")
   }

   if(!data.eventId){
      throw new KafkaPoisonMessageError("eventId is required")
   }

   if (!mongoose.isValidObjectId(data.eventId)) {
      throw new KafkaPoisonMessageError("eventId must be a valid MongoDB ObjectId");
   }

   if(!data.tenantId){
      throw new KafkaPoisonMessageError("tenantId is required");
   }

   if(!data.type){
      throw new KafkaPoisonMessageError("type is required")
   }

   if(!allowedChannels.has(data.channel)){
      throw new KafkaPoisonMessageError(`Unsupported channel : ${data.channel}`)
   }

   if(!data.payload || typeof data.payload!=="object"){
      throw new KafkaPoisonMessageError("payload must be an object")
   }
   return data;
}
