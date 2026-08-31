const allowedChannels = new Set(["email","webhook"]);

export const parseKafkaEvent = (message)=>{
   const raw = message.value?.toString();

   if(!raw){
      throw new Error("Kafka message has no value");
   }
   let data ;
   try{
      data = JSON.parse(raw);
   }
   catch(error){
      throw new Error("Kafka message contains invalid JSON")
   }

   if(!data.eventId){
      throw new Error("eventId is required")
   }

   if(!data.tenantId){
      throw new Error("tenantId is required");
   }

   if(!data.type){
      throw new Error("type is required")
   }

   if(!allowedChannels.has(data.channel)){
      throw new Error(`Unsupported channel : ${data.channel}`)
   }

   if(!data.payload || typeof data.payload!=="object"){
      throw new Error("payload must be an object")
   }
   return data;
}