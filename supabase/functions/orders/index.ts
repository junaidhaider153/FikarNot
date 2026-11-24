// FikarNot orders Edge Function entrypoint.
import { handleOrdersRequest } from "./handler.ts";

Deno.serve((req) => handleOrdersRequest(req));
