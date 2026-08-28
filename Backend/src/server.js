import app from "./app.js"
import {connectMongoDB} from "./database/mongo.js"
import {env} from "./config/env.js"


connectMongoDB();

const startServer = async()=>{
  await connectMongoDB();

  app.listen(env.PORT,() => {
    console.log(`NotiyHub API running on port ${env.PORT}`);
  });
};

startServer();