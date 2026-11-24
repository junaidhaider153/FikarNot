// AI Shopping Assistant Edge Function entrypoint.
import { handleChatRequest } from "./handler.ts";

Deno.serve((req) => handleChatRequest(req));
