import {kafka} from "./kafka.js"
import "dotenv/config"

const producer = kafka.producer();
let connected = false;

export const connectKafkaProducer = async()=>{
   if(connected) return;
   await producer.connect();
   connected = true;
   console.log("Kafka producer Connected");
};
export const disconnectKafkaProducer = async()=>{
   if(!connected) return ;
   await producer.disconnect();
   connected = false;
   console.log("Kafka Producer Disconnected");
};

export const publishKafkaEvent = async(event)=>{
   if(!connected){
      throw new Error("Kafka producer is not connected");
   }
   const topic = process.env.KAFKA_TOPIC;
   if(!topic) {
      throw new Error("KAFKA_TOPIC is not configured");
   }

   const message = {
      eventId : String(event._id),
      tenantId : String(event.tenantId),
      type : event.type ,
      channel : event.channel,
      payload : event.payload,
      createdAt : event.createdAt
   }

   return producer.send({
      topic,
      messages : [{
         key : String(event.tenantId),
         value : JSON.stringify(message),
         headers : {
            "event-type": event.type,
            "source" : "notifyhub-api"
         }
      }]
   });
};