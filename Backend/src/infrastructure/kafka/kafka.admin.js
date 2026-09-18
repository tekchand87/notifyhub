import {kafka} from "./kafka.js"
import "dotenv/config"

const admin = kafka.admin()

const requiredTopics = () => [
  { name: process.env.KAFKA_TOPIC || "notifyhub.events", partitions: Number(process.env.KAFKA_TOPIC_PARTITIONS) || 6 },
  { name: process.env.KAFKA_DLQ_TOPIC || "notifyhub.events.dlq", partitions: Number(process.env.KAFKA_DLQ_TOPIC_PARTITIONS) || 1 },
];

// Validation only. Production provisioning belongs to deployment/infrastructure;
// the application must never silently change topic topology at runtime.
export const validateKafkaTopics = async () => {
  const validationAdmin = kafka.admin();
  await validationAdmin.connect();
  try {
    const metadata = await validationAdmin.fetchTopicMetadata({ topics: requiredTopics().map((topic) => topic.name) });
    const byName = new Map(metadata.topics.map((topic) => [topic.name, topic]));
    for (const expected of requiredTopics()) {
      const actual = byName.get(expected.name);
      if (!actual) throw new Error(`Required Kafka topic is missing: ${expected.name}`);
      if (actual.partitions.length < expected.partitions) {
        throw new Error(`Kafka topic ${expected.name} has ${actual.partitions.length} partitions; expected at least ${expected.partitions}`);
      }
    }
  } finally { await validationAdmin.disconnect(); }
};

// Deprecated compatibility export: validates; it does not create topics.
export const ensureKafkaTopic = async()=>{
   await admin.connect();

   try{
      const topic = process.env.KAFKA_TOPIC;

      if(!topic){
         throw new Error("KAFKA_TOPIC is not configured");
      }

      await validateKafkaTopics();
   }
   finally{
      await admin.disconnect();
   }
}

/**
 * Ensures the DLQ topic exists, creating it if necessary.
 * Called during worker startup alongside ensureKafkaTopic.
 */
export const ensureDLQTopic = validateKafkaTopics;
