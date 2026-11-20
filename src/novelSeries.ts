import type { Positioned } from "./book";
import { mentionedIds } from "./mentions";
import { EMPTY_PLAN, readPlan, type Plan } from "./plan";

/** The open book uses the project’s live outline and publication settings.
 * Other books retain their own outline and settings here. Scene files always
 * stay in the project and keep the same IDs when their owner changes.
 */
export interface Volume {
  id: string;
  title: string;
  scenes: string[];
  outline?: Plan;
  settings?: Record<string, unknown>;
  entries?: string[];
}

export interface Milestone {
  id: string;
  title: string;
  notes: string;
  target?: string;
}

export interface NovelSeries {
  title: string;
  active: string;
  books: Volume[];
  arc: Plan;
  milestones: Milestone[];
}

export function readSeries(raw: unknown): NovelSeries | undefined {
  if (!raw || typeof raw !== "object") return;
  const data = raw as Partial<NovelSeries>;
  if (!Array.isArray(data.books)) return;
  const books: Volume[] = [];
  const ids = new Set<string>();
  const owned = new Set<string>();
  for (const b of data.books) {
    if (!b || typeof b.id !== "string" || !b.id || ids.has(b.id)) continue;
    ids.add(b.id);
    const scenes: string[] = [];
    for (const scene of Array.isArray(b.scenes) ? b.scenes : []) {
      if (typeof scene !== "string" || !scene || owned.has(scene)) continue;
      owned.add(scene);
      scenes.push(scene);
    }
    books.push({
      id: b.id,
      title: typeof b.title === "string" ? b.title : "",
      scenes,
      settings: b.settings && typeof b.settings === "object" && !Array.isArray(b.settings) ? b.settings : undefined,
      entries: Array.isArray(b.entries) ? b.entries.filter(x => typeof x === "string") : [],
      outline: leaf(b.outline),
    });
  }
  if (!books.length) return;
  return { title: typeof data.title === "string" ? data.title : "", active: books.find(b => b.id === data.active)?.id ?? books[0].id, books,
    arc: leaf(data.arc), milestones: Array.isArray(data.milestones) ? data.milestones.filter(m => m && typeof m.id === "string" && typeof m.title === "string" && typeof m.notes === "string") : [] };
}

function leaf(plan?: Plan): Plan {
  return plan ? readPlan({ ...plan, series: undefined }) : EMPTY_PLAN;
}

export function startSeries(plan: Plan, title: string, bookTitle: string, id: string): Plan {
  return { ...plan, series: { title, active: id, books: [{ id, title: bookTitle, scenes: [] }], arc: EMPTY_PLAN, milestones: [] } };
}

export function outsideBook(plan: Plan): Set<string> {
  return new Set(plan.series?.books.filter(b => b.id !== plan.series!.active).flatMap(b => b.scenes));
}

export function switchBook(plan: Plan, id: string, sceneIds: string[]): Plan {
  const { series, ...outline } = plan;
  const next = series?.books.find(b => b.id === id);
  if (!series || !next || series.active === id) return plan;
  const other = outsideBook(plan);
  const books = series.books.map(b => b.id === series.active
    ? { ...b, scenes: [...new Set([...b.scenes, ...sceneIds.filter(s => !other.has(s))])], outline }
    : b);
  return { ...(next.outline ?? EMPTY_PLAN), series: { ...series, active: id, books } };
}

export function moveToVolume(plan: Plan, ids: string[], destination: string, chapterId?: string): Plan {
  const series = plan.series;
  if (!series || destination === series.active || !series.books.some(b => b.id === destination)) return plan;
  const other = outsideBook(plan);
  const moved = new Set(ids.filter(id => !other.has(id)));
  if (!moved.size) return plan;
  const chapter = plan.chapters?.find(c => c.id === chapterId);
  const books = series.books.map(b => {
    if (b.id === series.active) return { ...b, scenes: b.scenes.filter(id => !moved.has(id)) };
    if (b.id !== destination) return b;
    const outline = b.outline ?? EMPTY_PLAN;
    const scenes = [...moved];
    const beats = outline.template === "libre" ? { ...outline.beats, libre: [...new Set([...(outline.beats.libre ?? []), ...b.scenes, ...scenes])] } : outline.beats;
    return { ...b, scenes: [...b.scenes, ...scenes], outline: { ...outline, beats,
      chapters: chapter ? [...(outline.chapters ?? []), { ...chapter, scenes }] : outline.chapters } };
  });
  return { ...plan, beats: Object.fromEntries(Object.entries(plan.beats).map(([key, list]) => [key, list.filter(id => !moved.has(id))])),
    chapters: plan.chapters?.filter(c => c !== chapter).map(c => ({ ...c, scenes: c.scenes.filter(id => !moved.has(id)) })), series: { ...series, books } };
}

export function volumeTexts(plan: Plan, manuscript: Record<string, string>) {
  if (!plan.series) return manuscript;
  const outside = outsideBook(plan);
  return Object.fromEntries(Object.entries(manuscript).filter(([id]) => !outside.has(id)));
}

export function volumeEntries(plan: Plan, nodes: readonly Positioned[], edges: readonly {source: string; target: string}[], texts: Record<string, string>) {
  const volume = plan.series?.books.find(b => b.id === plan.series?.active);
  const outside = outsideBook(plan);
  const scenes = nodes.filter(n => n.data.type === "scene" && !outside.has(n.id));
  const sceneIds = new Set(scenes.map(n => n.id));
  const kept = new Set([...sceneIds, ...(volume?.entries ?? [])]);
  for (const n of scenes) for (const id of mentionedIds(n.data.html + (texts[n.id] ?? ""))) kept.add(id);
  for (const e of edges) {
    if (sceneIds.has(e.source)) kept.add(e.target);
    if (sceneIds.has(e.target)) kept.add(e.source);
  }
  return kept;
}

export function volumeTitle(s: { title: string; plan: Plan }) {
  return s.plan.series?.books.find(b => b.id === s.plan.series?.active)?.title.trim() || s.title;
}
