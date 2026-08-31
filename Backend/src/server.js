import app from "./app.js"
import {connectMongoDB} from "./database/mongo.js"
import {env} from "./config/env.js"


const startServer = async()=>{
  await connectMongoDB();

  app.listen(env.PORT,() => {
    console.log(`NotifyHub API running on port ${env.PORT}`);
  });
};

startServer();