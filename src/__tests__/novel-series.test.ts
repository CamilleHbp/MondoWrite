// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { bookOrder } from "../book";
import { EMPTY_PLAN, arrange, readPlan } from "../plan";
import { moveToVolume, startSeries, switchBook, volumeEntries, volumeTexts } from "../novelSeries";
import { interactiveScenes, interactiveSlugs } from "../interactive/scenes";
import { buildCopies } from "../markdownCopies";
import { manuscriptOf } from "../export/projectDocs";
import { en } from "../i18n/en";

import type { CardNode } from "../projectState";

const nodes: CardNode[] = ["a", "b", "dedication"].map((id, i) => ({
  id, type: "card", data: { id, type: "scene", title: "Arrival", html: "", ...(i === 2 ? { page: "dedicace" } : {}) }, position: { x: i, y: 0 }
}));
const ids = nodes.map(n => n.id);
function pair() {
  const first = startSeries({ ...EMPTY_PLAN, chapters: [{ id: "ch", title: "Opening", scenes: ["a"] }] }, "Cycle", "North", "north");
  first.series!.books.push({ id: "south", title: "South", scenes: [] });
  return moveToVolume(first, ["b"], "south");
}
it("preserves ownership, pages and chapters through a switch and a file round trip", () => {
  const first = pair();
  expect(bookOrder(nodes, first)).toEqual(["dedication", "a"]);
  const second = readPlan(JSON.parse(JSON.stringify(switchBook(first, "south", ids))));
  expect(bookOrder(nodes, second)).toEqual(["b"]);
  expect(arrange(second, ids).beats[0].ids).toEqual(["b"]);
  expect(switchBook(second, "north", ids).chapters).toEqual(first.chapters);
  expect(interactiveScenes(nodes, second).map(s => s.id)).toEqual(["b"]);
  expect(interactiveSlugs(nodes, second).get("b")).toEqual(interactiveSlugs(nodes, first).get("a"));
  expect(volumeEntries(second, nodes, [{ source: "b", target: "place" }], {})).toEqual(new Set(["b", "place"]));
  expect(volumeTexts(second, {a:"north", b:"south"})).toEqual({b:"south"});
});
it("exports one novel and keeps both books in the Markdown backup", () => {
  const source = { kind: "roman" as const, title: "Cycle", plan: pair(), nodes, frames: [], edges: [], pitch: {}, screenplay: null,
    manuscript: { a: "<p>Northern shore</p>", b: "<p>Southern shore</p>" } };
  const ctx = { t: en, author: "", lang: "en" };
  const doc = manuscriptOf(source, ctx);
  expect(doc.title).toBe("North");
  expect(JSON.stringify(doc)).not.toContain("Southern shore");
  const copies = buildCopies(source, ctx, []);
  expect(copies["manuscrit.md"]).toContain("Southern shore");
  expect(copies["manuscrit.md"]).toContain("Northern shore");
});
it("moves a whole chapter and preserves series milestones", () => {
  const plan = pair();
  plan.series!.milestones = [{id:"arc1", title:"Discovery", notes:"", target:"a"}];
  const moved = moveToVolume(plan, ["a"], "south", "ch");
  const south = switchBook(moved, "south", ids);
  expect(south.chapters).toEqual(plan.chapters);
  expect(south.series?.milestones[0].target).toBe("a");
  expect(bookOrder(nodes, moved)).toEqual(["dedication"]);
});
