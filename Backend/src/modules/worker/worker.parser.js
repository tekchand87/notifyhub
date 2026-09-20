import mongoose from "mongoose";

const allowedChannels = new Set(["email","webhook"]);

export class QueueMessageParseError extends Error {
   constructor(message) {
      super(message);
      this.name = "QueueMessageParseError";
      this.isQueueMessageParseError = true;
   }
}

const parseEventPayload = (raw, source = "queue") => {
   if (!raw) {
      throw new QueueMessageParseError(`${source} message has no value`);
   }

   let data ;
   try{
      data = JSON.parse(raw);
   }
   catch(error){
      throw new QueueMessageParseError(`${source} message contains invalid JSON`)
   }

   if(!data.eventId){
      throw new QueueMessageParseError("eventId is required")
   }

   if (!mongoose.isValidObjectId(data.eventId)) {
      throw new QueueMessageParseError("eventId must be a valid MongoDB ObjectId");
   }

   if(!data.tenantId){
      throw new QueueMessageParseError("tenantId is required");
   }

   if(!data.type){
      throw new QueueMessageParseError("type is required")
   }

   if(!allowedChannels.has(data.channel)){
      throw new QueueMessageParseError(`Unsupported channel : ${data.channel}`)
   }

   if(!data.payload || typeof data.payload!=="object"){
      throw new QueueMessageParseError("payload must be an object")
   }
   return data;
}

export class KafkaPoisonMessageError extends QueueMessageParseError {
   constructor(message) {
      super(message);
      this.name = "KafkaPoisonMessageError";
      this.isKafkaPoisonMessage = true;
   }
}

export const parseKafkaEvent = (message) => {
   const raw = message.value?.toString();
   try {
      return parseEventPayload(raw, "Kafka");
   } catch (error) {
      const poison = new KafkaPoisonMessageError(error.message);
      throw poison;
   }
};

export const parseSqsEvent = (message) => parseEventPayload(message?.Body, "SQS");
