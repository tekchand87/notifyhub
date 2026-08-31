import {publishKafkaEvent} from "./kafka.producer.js"

export const publishEventToKafka = async(event)=>{
   const result = await publishEventToKafka(event);

   return {
      topic : result[0]?.topicName,
      partition  : result[0]?.partition,
      offset : result[0]?.baseOffset
   };
};