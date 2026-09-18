import { kafka } from "./kafka.js";
import { CompressionTypes, Partitioners } from "kafkajs";
import "dotenv/config";

// Explicitly use the KafkaJS v2 default partitioner (murmur2).
// The producer uses tenantId as the message key, so DefaultPartitioner
// will consistently route all events for the same tenant to the same
// partition — which is the correct behavior for tenant-level ordering.
const getPositiveInteger = (value, fallback) => {
   const parsed = Number(value);
   return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getCompression = () => {
   const configured = (process.env.KAFKA_COMPRESSION || "gzip").toLowerCase();
   return configured === "none" ? CompressionTypes.None : CompressionTypes.GZIP;
};

// Idempotent producer retries preserve the order of records with the same tenant
// key. KafkaJS requires durable acks and caps in-flight requests at five for it.
const producer = kafka.producer({
   createPartitioner: Partitioners.DefaultPartitioner,
   idempotent: true,
   maxInFlightRequests: Math.min(getPositiveInteger(process.env.KAFKA_MAX_IN_FLIGHT_REQUESTS, 5), 5),
   // Leave KafkaJS's idempotent retry policy intact. A finite retry limit can
   // invalidate the producer's exactly-once retry guarantees.
});
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
      // Do not weaken durability for throughput: wait for all in-sync replicas.
      acks: -1,
      timeout: getPositiveInteger(process.env.KAFKA_PRODUCER_TIMEOUT_MS, 30_000),
      compression: getCompression(),
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

/**
 * Publish a group of outbox events in one Kafka produce request per topic.
 *
 * The outbox owns the database claim and status transition. This function only
 * serializes events and hands the batch to Kafka, so a failed call is safe for
 * the caller to retry under the existing at-least-once outbox rules.
 */
export const publishKafkaEvents = async (events, { concurrency = 1 } = {}) => {
   if (!connected) {
      throw new Error("Kafka producer is not connected");
   }

   const byTopic = new Map();
   for (const event of events) {
      const topic = event.topic || process.env.KAFKA_TOPIC;
      if (!topic) throw new Error("KAFKA_TOPIC is not configured");

      const message = {
         eventId: String(event._id),
         tenantId: String(event.tenantId),
         type: event.type,
         channel: event.channel,
         payload: event.payload,
         createdAt: event.createdAt,
      };
      const messages = byTopic.get(topic) || [];
      messages.push({
         key: String(event.tenantId),
         value: JSON.stringify(message),
         headers: {
            "event-type": event.type,
            "source": "notifyhub-api",
         },
      });
      byTopic.set(topic, messages);
   }

   const batches = [...byTopic];
   const limit = Math.max(1, Math.min(Number(concurrency) || 1, batches.length));
   const results = [];
   let next = 0;
   await Promise.all(Array.from({ length: limit }, async () => {
      while (true) {
         const index = next++;
         if (index >= batches.length) return;
         const [topic, messages] = batches[index];
         results[index] = await producer.send({
            topic,
            acks: -1,
            timeout: getPositiveInteger(process.env.KAFKA_PRODUCER_TIMEOUT_MS, 30_000),
            compression: getCompression(),
            messages,
         });
      }
   }));
   return results;
};
