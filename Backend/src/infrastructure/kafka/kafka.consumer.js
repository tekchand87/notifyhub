import {kafka} from "./kafka.js"
import "dotenv/config"

export const consumer = kafka.consumer({
   groupId : process.env.KAFKA_GROUP_ID||"notifyhub-workers"
});

export const connectKafkaConsumer = async()=>{
   await consumer.connect();
   console.log("Kafka Worker Consumer Connected");
}

export const subscribeKafkaConsumer = async()=>{
   const topic = process.env.KAFKA_TOPIC;
   if(!topic){
      throw new Error("KAFKA_TOPIC is not configured");
   }
   await consumer.subscribe({
      topic,
      fromBeginning: true  // Bug #10 fix: resume from committed offset; if no offset exists, start from beginning (not latest)
   });
   console.log(`Worker subscribed to ${topic}`);
}

export const disconnectedKafkaConsumer = async()=>{
   await consumer.disconnect();
   console.log("Kafka Worker Consumer DisConnected");
}