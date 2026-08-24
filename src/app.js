import express from "express"
import cors from "cors"

import authRoutes from "./modules/auth/auth.routes.js"
import {notFound} from "./middleware/notFound.middleware.js"
import {errorHandler} from "./middleware/error.middleware.js"

const app = express();

app.use(cors);
app.use(express.json());

app.get("/health",(res,req)=>{
  res.status(200).json({
    sucess : true,
    message :"NotifyHub API is running"
  });
});

app.use("/api/v1/auth",authRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;