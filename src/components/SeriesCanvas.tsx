import {
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Node,
  type NodeProps,
  type XYPosition,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { useCosmos } from "../store";
import { useT } from "../i18n";
import { beatText } from "../plan";
import type { NovelSeries } from "../novelSeries";
import { seriesLocation, rememberSeries } from "../seriesLocation";
import { MoreMenu } from "./MoreMenu";
import { bookName, enterBook, seriesGroups, updateSeries } from "./SeriesWorkspace";

type MapNode = Node<
  { title: string; caption?: string; book?: string; entry?: string; scene?: string; frame?: boolean },
  "seriesItem"
>;
function MapItem({ id, data, positionAbsoluteX, positionAbsoluteY }: NodeProps<MapNode>) {
  const t = useT();
  const shift = (x: number, y: number) =>
    updateSeries((series) => ({
      ...series,
      positions: {
        ...series.positions,
        [id]: { x: positionAbsoluteX + x, y: positionAbsoluteY + y },
      },
    }));
  const s = useCosmos.getState();
  const open = data.book
    ? () => enterBook(data.book!)
    : data.scene
      ? () => s.openInManuscript(data.scene!)
      : data.entry
        ? () => useCosmos.setState({ expandedId: data.entry, dialog: "card" })
        : undefined;
  return (
    <div className={data.frame ? "series-map-frame" : "series-map-card"}>
      {data.caption && (
        <div className="series-book-head">
          <small>{data.caption}</small>
          <MoreMenu
            label={data.title + " · " + t.app.moreActions}
            items={[
              { label: t.workspace.left, onSelect: () => shift(-48, 0) },
              { label: t.workspace.right, onSelect: () => shift(48, 0) },
              { label: t.workspace.up, onSelect: () => shift(0, -48) },
              { label: t.workspace.down, onSelect: () => shift(0, 48) },
            ]}
          />
        </div>
      )}
      {open ? (
        <button className="nodrag" data-book={data.book} onClick={open}>
          {data.title}
        </button>
      ) : (
        <strong>{data.title}</strong>
      )}
      {!data.frame && (
        <>
          <Handle type="target" position={Position.Left} />
          <Handle type="source" position={Position.Right} />
        </>
      )}
    </div>
  );
}
const types = { seriesItem: MapItem };
export function SeriesCanvas({ series }: { series: NovelSeries }) {
  const nodes = useCosmos((s) => s.nodes),
    links = useCosmos((s) => s.edges);
  const t = useT(),
    flow = useReactFlow();
  const [camera] = useState(() => seriesLocation().cameras?.overview);
  const [moving, move] = useState<Record<string, XYPosition>>({});
  const graph = useMemo(() => {
    const items: MapNode[] = [];
    const groups = seriesGroups(series);
    const refs = new Map(series.books.filter((b) => b.reference).map((b) => [b.reference!, b.id]));
    const add = (id: string, x: number, y: number, data: MapNode["data"], style?: MapNode["style"]) => {
      items.push({
        id,
        type: "seriesItem",
        position: moving[id] ?? series.positions?.[id] ?? { x, y },
        data,
        style,
        draggable: !data.frame,
        selectable: !data.frame,
      });
    };
    let y = 0;
    for (const group of groups) {
      const books = series.books.filter((b) => group.ids.includes(b.id));
      const events = series.milestones.filter((m) => group.ids.includes(m.id));
      const height = 90 + 135 * Math.max(1, Math.ceil((books.length + events.length) / 3));
      add(
        "arc:" + group.key,
        0,
        y,
        {
          title: group.key ? beatText(group.key, t.plan.beats, series.arc.custom).label : t.workspace.unplaced,
          frame: true,
        },
        { width: 850, height, zIndex: -1 },
      );
      let i = 0;
      for (const b of books) {
        add(b.id, 24 + (i % 3) * 275, y + 64 + 135 * Math.floor(i / 3), {
          title: bookName(b),
          caption: t.volumes.book + " " + (series.books.indexOf(b) + 1),
          book: b.id,
        });
        i++;
      }
      for (const m of events) {
        const dest = series.books.find((b) => b.id === m.target);
        add(m.id, 24 + (i % 3) * 275, y + 64 + 135 * Math.floor(i / 3), {
          title: m.title,
          caption: t.volumes.milestone,
          book: dest?.id,
          scene: dest ? undefined : m.target,
        });
        i++;
      }
      y += height + 45;
    }
    const world = nodes.filter(
      (n) => n.data.type !== "scene" && !refs.has(n.id) && !items.some((item) => item.id === n.id),
    );
    world.forEach((n, i) =>
      add(n.id, 930 + Math.floor(i / 8) * 260, (i % 8) * 140, {
        title: n.data.title || t.types[n.data.type].section,
        entry: n.id,
        caption: t.types[n.data.type].section,
      }),
    );
    const ids = new Set(items.map((n) => n.id));
    const edges = links
      .map((e) => ({
        id: e.id,
        source: refs.get(e.source) ?? e.source,
        target: refs.get(e.target) ?? e.target,
        label: e.label,
      }))
      .filter((e) => ids.has(e.source) && ids.has(e.target));
    for (const m of series.milestones) {
      const destination =
        series.books.find((b) => b.id === m.target || b.scenes.includes(m.target ?? "")) ??
        (nodes.some((n) => n.id === m.target && n.data.type === "scene")
          ? series.books.find((b) => b.id === series.active)
          : undefined);
      if (destination) edges.push({ id: "target:" + m.id, source: m.id, target: destination.id, label: undefined });
    }
    return { items, edges };
  }, [nodes, links, series, t, moving]);
  return (
    <ReactFlow
      nodes={graph.items}
      edges={graph.edges}
      nodeTypes={types}
      onInit={() => {
        const focus = seriesLocation().focus;
        if (focus)
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLButtonElement>('.series-map-card [data-book="' + CSS.escape(focus) + '"]')
              ?.focus({ preventScroll: true }),
          );
      }}
      nodesConnectable={false}
      deleteKeyCode={null}
      defaultViewport={camera}
      fitView={!camera}
      fitViewOptions={{ padding: 0.12, maxZoom: 0.9 }}
      minZoom={0.05}
      onMoveEnd={(_, viewport) => rememberSeries({ cameras: { ...seriesLocation().cameras, overview: viewport } })}
      onNodesChange={(changes) => {
        const next: Record<string, XYPosition> = {};
        for (const c of changes) if (c.type === "position" && c.position) next[c.id] = c.position;
        if (Object.keys(next).length) move((old) => ({ ...old, ...next }));
        if (changes.some((c) => c.type === "position" && c.position && !c.dragging)) {
          updateSeries((s) => ({ ...s, positions: { ...s.positions, ...next } }));
          move({});
        }
      }}
    >
      <Background />
      <Controls showInteractive={false} />
      <Panel position="top-left">
        <button
          className="ghost-button"
          onClick={() => {
            move({});
            updateSeries((s) => ({ ...s, positions: undefined }));
            void flow.fitView();
          }}
        >
          {t.organize.button}
        </button>
      </Panel>
    </ReactFlow>
  );
}
