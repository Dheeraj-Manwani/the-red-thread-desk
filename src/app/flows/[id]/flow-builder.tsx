"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { saveFlow } from "@/app/actions";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import {
  BUTTON_TITLE_LIMIT,
  handlesFor,
  nodeDefaults,
  nodeLabels,
  QUICK_REPLY_LIMIT,
  validateGraph,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type NodeData,
  type NodeType,
} from "@/lib/flows/graph";

type BuilderNode = Node<NodeData[NodeType], NodeType>;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const tone: Record<NodeType, string> = {
  start: "border-neutral-400 bg-neutral-100",
  message: "border-red-300 bg-white",
  question: "border-sky-300 bg-white",
  packages: "border-amber-300 bg-white",
  followGate: "border-fuchsia-300 bg-white",
  link: "border-green-300 bg-white",
  tag: "border-neutral-300 bg-white",
  condition: "border-indigo-300 bg-white",
  handoff: "border-orange-400 bg-orange-50",
  designs: "border-pink-300 bg-white",
  optIn: "border-lime-400 bg-lime-50",
  payment: "border-emerald-400 bg-emerald-50",
};

function summary(node: FlowNode): string {
  switch (node.type) {
    case "start":
      return "Comment, story reply or ice breaker";
    case "message":
    case "question":
    case "packages":
      return node.data.text;
    case "followGate":
      return "Instagram: checks the follow. Facebook: passes through.";
    case "link":
      return node.data.usePackage ? "Chosen package's link" : node.data.url || "(no link yet)";
    case "tag":
      return [
        node.data.add.length ? `+ ${node.data.add.join(", ")}` : "",
        node.data.remove.length ? `− ${node.data.remove.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("  ") || "(no tags)";
    case "condition":
      if (node.data.check === "tag") return `Has tag “${node.data.tag}”?`;
      if (node.data.check === "field") {
        return node.data.equals ? `${node.data.field} = “${node.data.equals}”?` : `${node.data.field} answered?`;
      }
      return "Follows us?";
    case "handoff":
      return `${node.data.text}\n(bot pauses for 24 h, you get a notification)`;
    case "optIn":
      return `${node.data.text}\n[${node.data.yesTitle}] [${node.data.noTitle}]`;
    case "designs":
      return `Carousel of ${node.data.occasion ? `“${node.data.occasion}”` : "all"} designs with Preview / Buy`;
    case "payment": {
      const d = node.data;
      const amount = d.amount === "fixed" ? `₹${d.fixedInr} for ${d.description || "…"}` : `the chosen ${d.amount}'s price`;
      return `Razorpay link for ${amount}`;
    }
  }
}

function StepNode({ id, type, data, selected }: NodeProps<BuilderNode>) {
  const node = { id, type, data, position: { x: 0, y: 0 } } as FlowNode;
  const handles = handlesFor(node);
  const updateInternals = useUpdateNodeInternals();
  const key = handles.map((h) => h.id).join("|");
  useEffect(() => updateInternals(id), [id, key, updateInternals]);

  return (
    <div className={`w-56 rounded-lg border-2 text-xs shadow-sm ${tone[type]} ${selected ? "ring-2 ring-red-500" : ""}`}>
      {type !== "start" && <Handle type="target" position={Position.Left} />}
      <div className="border-b border-neutral-200 px-3 py-1.5 font-semibold">{nodeLabels[type]}</div>
      <p className="line-clamp-3 px-3 py-2 whitespace-pre-line text-neutral-700">{summary(node)}</p>
      <div className="space-y-1 pb-2">
        {handles.map((h) => (
          <div key={h.id} className="relative pr-4 text-right text-[11px] text-neutral-500">
            {h.label}
            <Handle type="source" position={Position.Right} id={h.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = Object.fromEntries((Object.keys(nodeLabels) as NodeType[]).map((t) => [t, StepNode]));

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-neutral-600">{children}</span>;
}

function csv(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function Editor({
  node,
  update,
  remove,
  packages,
  tags,
}: {
  node: FlowNode;
  update: (patch: Partial<NodeData[NodeType]>) => void;
  remove: () => void;
  packages: { name: string; priceInr: number }[];
  tags: string[];
}) {
  const vars = (
    <p className="text-xs text-neutral-500">
      Variables: {"{username}"}, {"{package}"}, {"{package_price}"}, or any answer field such as {"{event_date}"}.
    </p>
  );
  let body: React.ReactNode = null;
  switch (node.type) {
    case "start":
      body = (
        <p className="text-sm text-neutral-600">
          Where the flow begins. Attach the flow to an automation or an ice breaker. From a comment, the first message goes
          out as the private reply; after that the flow waits until the person replies.
        </p>
      );
      break;
    case "message": {
      const d = node.data;
      body = (
        <>
          <label className="block">
            <Label>Text</Label>
            <textarea className={inputClass} rows={4} value={d.text} onChange={(e) => update({ text: e.target.value })} />
          </label>
          {vars}
          <div className="space-y-2">
            <Label>Buttons (each one is a branch)</Label>
            {d.buttons.map((b, i) => (
              <div key={b.id} className="flex gap-2">
                <input
                  className={inputClass}
                  value={b.title}
                  maxLength={BUTTON_TITLE_LIMIT}
                  onChange={(e) =>
                    update({ buttons: d.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })
                  }
                />
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => update({ buttons: d.buttons.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
            ))}
            {d.buttons.length < QUICK_REPLY_LIMIT && (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => update({ buttons: [...d.buttons, { id: newId("b"), title: "" }] })}
              >
                Add button
              </button>
            )}
            <p className="text-xs text-neutral-500">No buttons: the flow goes straight on to the next step.</p>
          </div>
        </>
      );
      break;
    }
    case "question": {
      const d = node.data;
      body = (
        <>
          <label className="block">
            <Label>Question</Label>
            <textarea className={inputClass} rows={3} value={d.text} onChange={(e) => update({ text: e.target.value })} />
          </label>
          {vars}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <Label>Save answer as</Label>
              <input className={inputClass} value={d.field} onChange={(e) => update({ field: e.target.value })} />
            </label>
            <label className="block">
              <Label>Answer type</Label>
              <select
                className={inputClass}
                value={d.answer}
                onChange={(e) => update({ answer: e.target.value as typeof d.answer })}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="date">Date</option>
                <option value="url">Link (e.g. Google Maps)</option>
                <option value="photo">Photo(s)</option>
              </select>
            </label>
          </div>
          <label className="block">
            <Label>If the answer doesn&apos;t fit (optional)</Label>
            <input className={inputClass} value={d.retryText} onChange={(e) => update({ retryText: e.target.value })} />
          </label>
        </>
      );
      break;
    }
    case "packages": {
      const d = node.data;
      body = (
        <>
          <label className="block">
            <Label>Text</Label>
            <textarea className={inputClass} rows={3} value={d.text} onChange={(e) => update({ text: e.target.value })} />
          </label>
          <label className="block">
            <Label>Save choice as</Label>
            <input className={inputClass} value={d.field} onChange={(e) => update({ field: e.target.value })} />
          </label>
          <p className="text-xs text-neutral-500">
            Buttons come from active packages:{" "}
            {packages.length ? packages.map((p) => `${p.name} ₹${p.priceInr}`).join(", ") : "none yet (add them under Packages)"}.
          </p>
        </>
      );
      break;
    }
    case "followGate": {
      const d = node.data;
      body = (
        <>
          <label className="block">
            <Label>Message to non-followers</Label>
            <textarea
              className={inputClass}
              rows={3}
              value={d.promptText}
              onChange={(e) => update({ promptText: e.target.value })}
            />
          </label>
          <label className="block">
            <Label>Recheck button</Label>
            <input
              className={inputClass}
              maxLength={BUTTON_TITLE_LIMIT}
              value={d.buttonText}
              onChange={(e) => update({ buttonText: e.target.value })}
            />
          </label>
          <p className="text-xs text-neutral-500">
            “following” continues once they follow. “gave up” runs after 5 checks without a follow. On Facebook this step
            always continues on “following”.
          </p>
        </>
      );
      break;
    }
    case "link": {
      const d = node.data;
      body = (
        <>
          <label className="block">
            <Label>Text before the link</Label>
            <textarea className={inputClass} rows={2} value={d.text} onChange={(e) => update({ text: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.usePackage} onChange={(e) => update({ usePackage: e.target.checked })} />
            Use the chosen package&apos;s link
          </label>
          <label className="block">
            <Label>{d.usePackage ? "Fallback link (no package chosen)" : "Link"}</Label>
            <input
              className={inputClass}
              type="url"
              placeholder="https://..."
              value={d.url}
              onChange={(e) => update({ url: e.target.value })}
            />
          </label>
        </>
      );
      break;
    }
    case "tag": {
      const d = node.data;
      body = (
        <>
          <datalist id="known-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <label className="block">
            <Label>Add tags (comma-separated)</Label>
            <input
              className={inputClass}
              list="known-tags"
              defaultValue={d.add.join(", ")}
              onBlur={(e) => update({ add: csv(e.target.value) })}
            />
          </label>
          <label className="block">
            <Label>Remove tags</Label>
            <input
              className={inputClass}
              list="known-tags"
              defaultValue={d.remove.join(", ")}
              onBlur={(e) => update({ remove: csv(e.target.value) })}
            />
          </label>
        </>
      );
      break;
    }
    case "condition": {
      const d = node.data;
      body = (
        <>
          <label className="block">
            <Label>Check</Label>
            <select
              className={inputClass}
              value={d.check}
              onChange={(e) => update({ check: e.target.value as typeof d.check })}
            >
              <option value="tag">Has a tag</option>
              <option value="field">An answer</option>
              <option value="follower">Follows us (last check)</option>
            </select>
          </label>
          {d.check === "tag" && (
            <label className="block">
              <Label>Tag</Label>
              <input className={inputClass} list="known-tags" value={d.tag} onChange={(e) => update({ tag: e.target.value })} />
            </label>
          )}
          {d.check === "field" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <Label>Field</Label>
                <input className={inputClass} value={d.field} onChange={(e) => update({ field: e.target.value })} />
              </label>
              <label className="block">
                <Label>Equals (empty = answered)</Label>
                <input className={inputClass} value={d.equals} onChange={(e) => update({ equals: e.target.value })} />
              </label>
            </div>
          )}
        </>
      );
      break;
    }
  }

  if (node.type === "optIn") {
    const d = node.data;
    body = (
      <>
        <label className="block">
          <Label>Question</Label>
          <textarea className={inputClass} rows={3} value={d.text} onChange={(e) => update({ text: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <Label>Yes button</Label>
            <input
              className={inputClass}
              maxLength={BUTTON_TITLE_LIMIT}
              value={d.yesTitle}
              onChange={(e) => update({ yesTitle: e.target.value })}
            />
          </label>
          <label className="block">
            <Label>No button</Label>
            <input
              className={inputClass}
              maxLength={BUTTON_TITLE_LIMIT}
              value={d.noTitle}
              onChange={(e) => update({ noTitle: e.target.value })}
            />
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          “Yes” records consent for WhatsApp broadcasts (marketing templates). Only opted-in contacts get broadcasts;
          STOP clears it.
        </p>
      </>
    );
  }

  if (node.type === "designs") {
    const d = node.data;
    body = (
      <>
        <label className="block">
          <Label>Text before the carousel (optional)</Label>
          <textarea className={inputClass} rows={2} value={d.text} onChange={(e) => update({ text: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <Label>Occasion (empty = all)</Label>
            <input
              className={inputClass}
              value={d.occasion}
              placeholder="wedding or {occasion}"
              onChange={(e) => update({ occasion: e.target.value })}
            />
          </label>
          <label className="block">
            <Label>Save choice as</Label>
            <input className={inputClass} value={d.field} onChange={(e) => update({ field: e.target.value })} />
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          Shows up to 10 catalogue designs marked “in carousel”. Buy picks one; a Payment link step after it can charge
          the design&apos;s price.
        </p>
      </>
    );
  }

  if (node.type === "payment") {
    const d = node.data;
    body = (
      <>
        <label className="block">
          <Label>Text before the link</Label>
          <textarea className={inputClass} rows={2} value={d.text} onChange={(e) => update({ text: e.target.value })} />
        </label>
        {vars}
        <label className="block">
          <Label>Amount</Label>
          <select
            className={inputClass}
            value={d.amount}
            onChange={(e) => update({ amount: e.target.value as typeof d.amount })}
          >
            <option value="package">Chosen package&apos;s price</option>
            <option value="design">Chosen design&apos;s price</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </label>
        {d.amount === "fixed" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <Label>Amount (₹)</Label>
              <input
                className={inputClass}
                type="number"
                min={1}
                value={d.fixedInr}
                onChange={(e) => update({ fixedInr: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <Label>For</Label>
              <input className={inputClass} value={d.description} onChange={(e) => update({ description: e.target.value })} />
            </label>
          </div>
        )}
        <label className="block">
          <Label>After payment</Label>
          <input className={inputClass} value={d.paidText} onChange={(e) => update({ paidText: e.target.value })} />
        </label>
        <label className="block">
          <Label>If the link expires (7 days) or is cancelled</Label>
          <input className={inputClass} value={d.expiredText} onChange={(e) => update({ expiredText: e.target.value })} />
        </label>
        <p className="text-xs text-neutral-500">
          Creates an order and a Razorpay link, then waits. “paid” continues when Razorpay confirms; put the detail
          questions (couple_names, event_date, venue, maps_link, photos) after it and they are saved on the order.
        </p>
      </>
    );
  }

  if (node.type === "handoff") {
    const d = node.data;
    body = (
      <>
        <label className="block">
          <Label>Message before handing off</Label>
          <textarea className={inputClass} rows={3} value={d.text} onChange={(e) => update({ text: e.target.value })} />
        </label>
        <p className="text-xs text-neutral-500">
          The flow ends here. The bot stays quiet with this person for 24 hours and you get a push notification. Reply
          from the inbox.
        </p>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{nodeLabels[node.type]}</h3>
        {node.type !== "start" && (
          <button type="button" className={`${secondaryButtonClass} text-red-700`} onClick={remove}>
            Delete step
          </button>
        )}
      </div>
      {body}
    </div>
  );
}

export function FlowBuilder({
  flowId,
  initialName,
  initialGraph,
  packages,
  tags,
}: {
  flowId: string;
  initialName: string;
  initialGraph: FlowGraph;
  packages: { name: string; priceInr: number }[];
  tags: string[];
}) {
  const [name, setName] = useState(initialName);
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>(
    initialGraph.nodes.map((n) => ({ ...n, deletable: n.type !== "start" })) as BuilderNode[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialGraph.edges as Edge[]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; problems: string[] } | null>(null);
  const [saving, startSaving] = useTransition();

  const graph: FlowGraph = useMemo(
    () => ({
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data }) as FlowNode),
      edges: edges.map(({ id, source, sourceHandle, target }): FlowEdge => ({ id, source, sourceHandle, target })),
    }),
    [nodes, edges],
  );
  const problems = useMemo(() => validateGraph(graph), [graph]);
  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        // One arrow per output: a new connection replaces the old one.
        addEdge(
          { ...c, id: newId("e") },
          eds.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === (c.sourceHandle ?? "next"))),
        ),
      ),
    [setEdges],
  );

  function addNode(type: Exclude<NodeType, "start">) {
    const id = newId("n");
    const offset = nodes.length * 24;
    setNodes((nds) => [
      ...nds,
      { id, type, position: { x: 320 + offset, y: 80 + offset }, data: structuredClone(nodeDefaults[type]) } as BuilderNode,
    ]);
    setSelectedId(id);
    setResult(null);
  }

  function update(patch: Partial<NodeData[NodeType]>) {
    if (!selectedId) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)) as BuilderNode[]);
    // Drop arrows from buttons that no longer exist.
    if ("buttons" in patch && patch.buttons) {
      const keep = new Set(patch.buttons.length ? patch.buttons.map((b) => b.id) : ["next"]);
      setEdges((eds) => eds.filter((e) => e.source !== selectedId || keep.has(e.sourceHandle ?? "next")));
    }
    setResult(null);
  }

  function removeSelected() {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  function save() {
    startSaving(async () => setResult(await saveFlow(flowId, name, graph)));
  }

  const addable = (Object.keys(nodeLabels) as NodeType[]).filter((t): t is Exclude<NodeType, "start"> => t !== "start");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} max-w-xs`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Flow name"
        />
        <button type="button" className={buttonClass} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save flow"}
        </button>
        {result?.ok && <span className="text-sm text-green-700">Saved.</span>}
      </div>
      {(result?.problems.length ? result.problems : problems).length > 0 && (
        <ul className="list-inside list-disc text-sm text-amber-800">
          {(result?.problems.length ? result.problems : problems).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="h-[70vh] overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            onNodesDelete={(deleted) => deleted.some((n) => n.id === selectedId) && setSelectedId(null)}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
          >
            <Background />
            <Controls showInteractive={false} />
            <Panel position="top-left" className="flex flex-wrap gap-1">
              {addable.map((t) => (
                <button key={t} type="button" className={`${secondaryButtonClass} text-xs`} onClick={() => addNode(t)}>
                  + {nodeLabels[t]}
                </button>
              ))}
            </Panel>
          </ReactFlow>
        </div>
        <aside className="rounded-lg border border-neutral-200 bg-white p-4">
          {selected ? (
            <Editor
              key={selected.id}
              node={selected}
              update={update}
              remove={removeSelected}
              packages={packages}
              tags={tags}
            />
          ) : (
            <p className="text-sm text-neutral-500">
              Click a step to edit it. Drag from an output dot to another step&apos;s left dot to connect them. Select
              and press Backspace to delete.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
