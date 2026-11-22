/** Postgres functions raise "CODE|message". */
export function parseRpcError(message: string | undefined): { code: string; message: string } | null {
  const m = /^([A-Z_]+)\|([\s\S]*)$/.exec(String(message || ""));
  return m ? { code: m[1], message: m[2] } : null;
}
