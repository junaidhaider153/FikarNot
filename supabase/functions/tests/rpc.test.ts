import { assertEquals } from "@std/assert";
import { parseRpcError } from "../_shared/rpc.ts";

Deno.test("rpc: parseRpcError correctly extracts uppercase CODE and message", () => {
  const err1 = parseRpcError("INVALID_STATUS|Order status cannot be modified");
  assertEquals(err1, {
    code: "INVALID_STATUS",
    message: "Order status cannot be modified",
  });

  const err2 = parseRpcError("INSUFFICIENT_STOCK|Item 42 is out of stock");
  assertEquals(err2, {
    code: "INSUFFICIENT_STOCK",
    message: "Item 42 is out of stock",
  });

  const errMultiline = parseRpcError("MULTI_LINE|Line 1\nLine 2");
  assertEquals(errMultiline, {
    code: "MULTI_LINE",
    message: "Line 1\nLine 2",
  });
});

Deno.test("rpc: parseRpcError returns null for unformatted errors or non-matching formats", () => {
  assertEquals(parseRpcError(""), null);
  assertEquals(parseRpcError(undefined), null);
  assertEquals(parseRpcError("duplicate key value violates unique constraint"), null);
  assertEquals(parseRpcError("lowercase_code|message"), null);
  assertEquals(parseRpcError("NO_PIPE_HERE"), null);
});
