import { createBroker } from "../brokers/alpaca";
import { start } from "../core/server";

const broker = createBroker();
start(broker);
