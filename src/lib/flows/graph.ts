/**
 * Flow graph, stored in Flow.graph. Same shape React Flow uses, so the builder loads and saves it as is.
 * Shared by the builder (client) and the engine (server): no server-only imports here.
 */

export const QUICK_REPLY_LIMIT = 13;
export const BUTTON_TITLE_LIMIT = 20;
export const MAX_FOLLOW_CHECKS = 5;
export const MAX_ANSWER_RETRIES = 2;

export type Button = { id: string; title: string };
export type AnswerKind = "text" | "number" | "email" | "phone" | "date";

export type NodeData = {
  start: Record<string, never>;
  message: { text: string; buttons: Button[] };
  question: { text: string; field: string; answer: AnswerKind; retryText: string };
  packages: { text: string; field: string };
  followGate: { promptText: string; buttonText: string };
  link: { text: string; url: string; usePackage: boolean };
  tag: { add: string[]; remove: string[] };
  condition: { check: "tag" | "field" | "follower"; tag: string; field: string; equals: string };
};

export type NodeType = keyof NodeData;

export type FlowNode = {
  [K in NodeType]: { id: string; type: K; position: { x: number; y: number }; data: NodeData[K] };
}[NodeType];

export type FlowEdge = { id: string; source: string; sourceHandle?: string | null; target: string };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

export const nodeLabels: Record<NodeType, string> = {
  start: "Start",
  message: "Message",
  question: "Question",
  packages: "Package picker",
  followGate: "Follow gate",
  link: "Send link",
  tag: "Tags",
  condition: "Condition",
};

export const nodeDefaults: { [K in NodeType]: NodeData[K] } = {
  start: {},
  message: { text: "Hi {username}! What would you like?", buttons: [{ id: "b1", title: "See packages" }] },
  question: { text: "When is the wedding? (DD/MM/YYYY)", field: "event_date", answer: "date", retryText: "" },
  packages: { text: "Pick a package:", field: "package" },
  followGate: { promptText: "Follow us first, then tap the button below.", buttonText: "I've followed" },
  link: { text: "Here's your link:", url: "", usePackage: true },
  tag: { add: [], remove: [] },
  condition: { check: "tag", tag: "", field: "", equals: "" },
};

/** Output handles per node. Message nodes get one per button, or "next" when there are none. */
export function handlesFor(node: FlowNode): { id: string; label: string }[] {
  switch (node.type) {
    case "message":
      return node.data.buttons.length
        ? node.data.buttons.map((b) => ({ id: b.id, label: b.title || "(button)" }))
        : [{ id: "next", label: "next" }];
    case "followGate":
      return [
        { id: "yes", label: "following" },
        { id: "no", label: "gave up" },
      ];
    case "condition":
      return [
        { id: "true", label: "yes" },
        { id: "false", label: "no" },
      ];
    default:
      return [{ id: "next", label: "next" }];
  }
}

export function emptyGraph(): FlowGraph {
  return { nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }], edges: [] };
}

export function nextNodeId(graph: FlowGraph, nodeId: string, handle: string) {
  const edge = graph.edges.find((e) => e.source === nodeId && (e.sourceHandle ?? "next") === handle);
  return edge?.target ?? null;
}

const FIELD = /^[a-z][a-z0-9_]{0,39}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Returns a list of problems; empty means the graph can be saved. */
export function validateGraph(graph: FlowGraph): string[] {
  const problems: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  const starts = graph.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1) problems.push("A flow needs exactly one Start node.");

  for (const node of graph.nodes) {
    if (!(node.type in nodeLabels)) {
      problems.push(`Unknown step type “${String(node.type)}”.`);
      continue;
    }
    // IDs go into button payloads separated by ":".
    if (!ID.test(node.id)) problems.push("A step has an invalid ID.");
    const name = `${nodeLabels[node.type]} node`;
    switch (node.type) {
      case "message":
        if (!node.data.text.trim()) problems.push(`${name}: text is empty.`);
        if (node.data.buttons.length > QUICK_REPLY_LIMIT) problems.push(`${name}: ${QUICK_REPLY_LIMIT} buttons max.`);
        for (const b of node.data.buttons) {
          if (!ID.test(b.id) || b.id === "next") problems.push(`${name}: a button has an invalid ID.`);
          if (!b.title.trim()) problems.push(`${name}: a button has no title.`);
          if (b.title.length > BUTTON_TITLE_LIMIT) problems.push(`${name}: “${b.title}” is over ${BUTTON_TITLE_LIMIT} characters.`);
        }
        break;
      case "question":
        if (!node.data.text.trim()) problems.push(`${name}: question is empty.`);
        if (!FIELD.test(node.data.field)) problems.push(`${name}: field must be lowercase letters, digits and _.`);
        break;
      case "packages":
        if (!FIELD.test(node.data.field)) problems.push(`${name}: field must be lowercase letters, digits and _.`);
        break;
      case "followGate":
        if (node.data.buttonText.length > BUTTON_TITLE_LIMIT) problems.push(`${name}: button is over 20 characters.`);
        break;
      case "link":
        if (!node.data.usePackage && !/^https?:\/\//.test(node.data.url)) problems.push(`${name}: link must start with https://.`);
        if (node.data.usePackage && node.data.url && !/^https?:\/\//.test(node.data.url)) {
          problems.push(`${name}: fallback link must start with https://.`);
        }
        break;
      case "condition":
        if (node.data.check === "tag" && !node.data.tag.trim()) problems.push(`${name}: pick a tag.`);
        if (node.data.check === "field" && !FIELD.test(node.data.field)) problems.push(`${name}: pick a field.`);
        break;
    }
  }
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) problems.push("An arrow points to a node that no longer exists.");
  }
  if (starts[0] && !nextNodeId(graph, starts[0].id, "next")) problems.push("Connect the Start node to the first step.");
  return [...new Set(problems)];
}

/** Parses stored JSON defensively. */
export function parseGraph(value: unknown): FlowGraph {
  const g = value as Partial<FlowGraph> | null;
  return { nodes: Array.isArray(g?.nodes) ? g.nodes : [], edges: Array.isArray(g?.edges) ? g.edges : [] };
}
