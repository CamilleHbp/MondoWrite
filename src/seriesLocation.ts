import { storage } from "./storage";
import { type Caret, VIEWS } from "./resume";
import type { View } from "./projectState";

interface Location {
  scope?: string | null;
  view?: View;
  overview?: View;
  focus?: string;
  scroll?: number;
  lastBook?: string;
  carets?: Record<string, Caret>;
  cameras?: Record<string, { x: number; y: number; zoom: number }>;
}

function key() {
  return "mondowrite.series." + storage.current?.();
}
export function seriesLocation(): Location {
  try {
    const saved = JSON.parse(localStorage.getItem(key()) ?? "{}");
    return saved && typeof saved === "object" && (!saved.view || VIEWS.includes(saved.view)) ? saved : {};
  } catch {
    return {};
  }
}
export function rememberSeries(change: Partial<Location>) {
  try {
    localStorage.setItem(key(), JSON.stringify({ ...seriesLocation(), ...change }));
  } catch {
    /* storage unavailable */
  }
}
