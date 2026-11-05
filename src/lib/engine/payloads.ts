/** Button payloads. Each carries the ID it belongs to, so a tap works even if sender IDs differ. */
export type PayloadAction = "TAP" | "RECHECK" | "ICE";

export const payloads = {
  tap: (sessionId: string) => `TAP:${sessionId}`,
  recheck: (sessionId: string) => `RECHECK:${sessionId}`,
  ice: (iceBreakerId: string) => `ICE:${iceBreakerId}`,
  /** Flow button: which run, which node, which output handle. IDs never contain ":". */
  flow: (runId: string, nodeId: string, handle: string) => `FLOW:${runId}:${nodeId}:${handle}`,
  parseFlow(payload: string | undefined) {
    const match = payload?.match(/^FLOW:([^:]+):([^:]+):(.+)$/);
    return match ? { runId: match[1], nodeId: match[2], handle: match[3] } : null;
  },
  parse(payload: string | undefined) {
    const match = payload?.match(/^(TAP|RECHECK|ICE):(.+)$/);
    return match ? { action: match[1] as PayloadAction, id: match[2] } : null;
  },
};
