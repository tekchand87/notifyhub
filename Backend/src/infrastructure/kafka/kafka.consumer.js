import {kafka} from "./kafka.js"
import "dotenv/config"

export const consumer = kafka.consumer({
   groupId : process.env.KAFKA_GROUP_ID||"notifyhub-workers",
   // Small fetch batches reduce broker request overhead; maxWait bounds latency
   // when notification traffic is sparse.
   minBytes: Number(process.env.KAFKA_CONSUMER_MIN_BYTES) || 32_768,
   maxBytes: Number(process.env.KAFKA_CONSUMER_MAX_BYTES) || 10_485_760,
   maxBytesPerPartition: Number(process.env.KAFKA_CONSUMER_MAX_BYTES_PER_PARTITION) || 1_048_576,
   maxWaitTimeInMs: Number(process.env.KAFKA_CONSUMER_MAX_WAIT_MS) || 50,
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

// Stop fetching new messages before worker shutdown waits for in-flight handlers.
export const stopKafkaConsumer = async () => {
   await consumer.stop();
};
