import express from "express";

import { router as user } from "./controller/user";
import purchasesRouter from '/web_A/Web-GameTopUp-main/node-expres-mysql-webgame/controller/purchases';
import { router as game } from "./controller/game";

import bodyParser from "body-parser";
import cors from "cors";

export const app = express();

app.use(bodyParser.json());
app.use(cors());
app.use("/user", user);
app.use("/game", game);
app.use('/purchases', purchasesRouter);
app.use("/uploads", express.static("uploads"));
