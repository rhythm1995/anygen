import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local"), override: true });
config({ path: resolve(process.cwd(), ".env"), override: false });

import "reflect-metadata";
import { bootstrap } from "./bootstrap";

void bootstrap();
