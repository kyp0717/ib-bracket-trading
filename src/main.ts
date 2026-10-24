import { createBroker } from "./ib";
import { start } from "./server";

const broker = createBroker();
start(broker);
