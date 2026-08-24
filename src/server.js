import app from "./app.js"
import {connectMongoDB} from "./database/mongo.js"
import {env} from "./config/env.js"


connectMongoDB();
app.listen(env.PORT,() => {
  console.log(`Server is running on the port ${env.PORT}`);
});