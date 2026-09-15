import {kafka} from "./kafka.js"
import "dotenv/config"

const admin = kafka.admin()

export const ensureKafkaTopic = async()=>{
   await admin.connect();

   try{
      const topic = process.env.KAFKA_TOPIC;

      if(!topic){
         throw new Error("KAFKA_TOPIC is not configured");
      }

      const topics = await admin.listTopics();

      if(!topics.includes(topic)){
         await admin.createTopics({
            topics : [{
               topic ,
               numPartitions : 1,
               replicationFactor : 1
            }]
         });
         console.log(`KAFKA topic "${topic}" created`);
      }
      else{
         console.log(`Kafka topic "${topic}" already exists`);
      }
   }
   finally{
      await admin.disconnect();
   }
}

/**
 * Ensures the DLQ topic exists, creating it if necessary.
 * Called during worker startup alongside ensureKafkaTopic.
 */
export const ensureDLQTopic = async () => {
   const dlqTopic = process.env.KAFKA_DLQ_TOPIC || "notifyhub.events.dlq";
   const dlqAdmin = kafka.admin();
   await dlqAdmin.connect();

   try {
      const topics = await dlqAdmin.listTopics();

      if (!topics.includes(dlqTopic)) {
         await dlqAdmin.createTopics({
            topics: [{
               topic: dlqTopic,
               numPartitions: 1,
               replicationFactor: 1,
            }],
         });
         console.log(`Kafka DLQ topic "${dlqTopic}" created`);
      } else {
         console.log(`Kafka DLQ topic "${dlqTopic}" already exists`);
      }
   } finally {
      await dlqAdmin.disconnect();
   }
};
