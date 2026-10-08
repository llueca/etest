import { handle } from "hono/aws-lambda";
import { createApp } from "../app.ts";
import { createContext } from "../context.ts";

// Configuration is validated at init: an invalid value fails the cold start.
export const handler = handle(createApp(createContext()));
