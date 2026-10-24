import { createBroker } from "./brokers/ib";
import { start } from "./core/server";

const broker = createBroker();
start(broker);
