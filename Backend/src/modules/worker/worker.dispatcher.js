import {handleEmail} from "../notifications/email.handler.js"
import {handleWebhook} from "../notifications/webhook.handler.js"

const handlers = {
   email : handleEmail,
   webhook : handleWebhook
}

export const dispatchNotification = async(event)=>{
   const handler = handlers[event.channel]
   if(!handler){
      throw new Error(`No handler registered for channel : ${event.channel}`)
   }
   return handler(event)
}