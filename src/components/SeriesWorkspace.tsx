import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCosmos, type View } from "../store";
import { useT } from "../i18n";
import { newId } from "../projectState";
import { useSettings } from "../settings";
import { usePhone } from "./usePhone";
import { beatText, templateBeats, NOVEL_TEMPLATES, withKeys } from "../plan";
import type { NovelSeries, Volume } from "../novelSeries";
import { flushPendingEdits } from "../pendingEdits";
import { seriesLocation } from "../seriesLocation";
import { interactiveOffered } from "../interactive";
import { MoreMenu } from "./MoreMenu";
import { PlanHeader } from "./PlanHeader";
import { TemplatePicker } from "./TemplatePicker";
import "./seriesWorkspace.css";

export function bookName(book: Volume) {
  return book.title.replace(/^(?:Book|Tome)\s+\d+\s*[·:–-]\s*/iu, "") || book.title;
}
export function enterBook(id: string, view?: View) {
  const s = useCosmos.getState();
  const tab = view ?? s.view;
  s.selectVolume(id);
  s.setView(tab);
}
function seriesOverview() {
  flushPendingEdits();
  useCosmos.setState({ bookScope: null, view: seriesLocation().overview ?? "plan", focusId: null });
}
export function ScopeControl({ series }: { series: NovelSeries }) {
  const scope = useCosmos((s) => s.bookScope);
  const current = series.books.find((b) => b.id === scope);
  const phone = usePhone();
  const pick = (
    <MoreMenu
      className="scope-picker"
      label={current ? bookName(current) : series.title}
      icon={<>{current ? bookName(current) : series.title} ▾</>}
      items={[
        { label: series.title, onSelect: seriesOverview },
        ...series.books.map((b, i) => ({
          label: i + 1 + " · " + bookName(b),
          onSelect: () => enterBook(b.id),
        })),
      ]}
    />
  );
  return (
    <span className="series-crumb">
      {current && !phone && (
        <>
          <button onClick={seriesOverview}>{series.title}</button>
          <span aria-hidden="true">›</span>
        </>
      )}
      {pick}
    </span>
  );
}
export function updateSeries(fn: (s: NovelSeries) => NovelSeries) {
  useCosmos.getState().changeNovelPlan((p) => (p.series ? { ...p, series: fn(p.series) } : p));
}
export function seriesGroups(s: NovelSeries) {
  const seen = new Set<string>();
  const groups = templateBeats(s.arc.template, s.arc.custom).map((key) => ({
    key,
    ids: (s.arc.beats[key] ?? []).filter((id) => !seen.has(id) && !!seen.add(id)),
  }));
  const loose = [...s.books, ...s.milestones].map((b) => b.id).filter((id) => !seen.has(id));
  if (loose.length || !groups.length) groups.push({ key: "", ids: loose });
  return groups;
}
function placed(s: NovelSeries, id: string, key: string) {
  const beats = { ...s.arc.beats };
  for (const k of templateBeats(s.arc.template, s.arc.custom)) beats[k] = (beats[k] ?? []).filter((x) => x !== id);
  if (key) beats[key] = [...(beats[key] ?? []), id];
  return { ...s.arc, beats };
}

type Edit = { kind: "book" | "milestone" | "rename" | "move" | "order"; id?: string; group: string };
function Editor({ s, edit, close }: { s: NovelSeries; edit: Edit; close: () => void }) {
  const t = useT(),
    w = t.workspace,
    v = t.volumes;
  const nodes = useCosmos((st) => st.nodes);
  const ref = useRef<HTMLDialogElement>(null);
  const book = s.books.find((b) => b.id === edit.id),
    event = s.milestones.find((m) => m.id === edit.id);
  const initialTitle = book ? bookName(book) : (event?.title ?? "");
  const [title, setTitle] = useState(edit.kind === "rename" ? s.title : initialTitle);
  const [notes, setNotes] = useState(book?.synopsis ?? event?.notes ?? "");
  const [target, setTarget] = useState(event?.target ?? "");
  const [group, setGroup] = useState(edit.group);
  const [rank, setRank] = useState(book ? s.books.indexOf(book) : 0);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const heading = {
    book: book ? w.edit : v.add,
    milestone: v.milestone,
    rename: w.rename,
    move: w.move,
    order: w.reorder,
  }[edit.kind];
  function save() {
    const id = edit.id ?? newId();
    updateSeries((series) => {
      if (edit.kind === "rename") return { ...series, title: title.trim() };
      if (edit.kind === "move") return { ...series, arc: placed(series, id, group) };
      if (edit.kind === "order") {
        const books = series.books.filter((b) => b.id !== id);
        if (book) books.splice(rank, 0, book);
        return { ...series, books };
      }
      if (edit.kind === "milestone") {
        const m = { id, title: title.trim(), notes, target: target || undefined };
        return {
          ...series,
          milestones: event ? series.milestones.map((old) => (old.id === id ? m : old)) : [...series.milestones, m],
          arc: placed(series, id, group),
        };
      }
      const b = {
        ...(book ?? { id, scenes: [], settings: interactive ? { interactive: true } : {} }),
        title: title.trim(),
        synopsis: notes,
      };
      return {
        ...series,
        books: book ? series.books.map((old) => (old.id === id ? b : old)) : [...series.books, b],
        arc: book ? series.arc : placed(series, id, group),
      };
    });
    close();
  }
  return (
    <dialog ref={ref} className="series-dialog" aria-labelledby="series-edit-title" onCancel={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 id="series-edit-title">{heading}</h2>
        {edit.kind !== "move" && edit.kind !== "order" && (
          <label>
            {edit.kind === "rename" ? v.name : edit.kind === "book" ? v.title : v.milestone}
            <input autoFocus required pattern=".*\S.*" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        {(edit.kind === "book" || edit.kind === "milestone") && (
          <label>
            {w.synopsis}
            <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        )}
        {edit.kind === "book" && !book && interactiveOffered(useSettings.getState().experimental) && (
          <label>
            <input type="checkbox" checked={interactive} onChange={(e) => setInteractive(e.target.checked)} />
            {t.interactive.kind}
          </label>
        )}
        {(edit.kind === "move" || edit.kind === "milestone") && (
          <label>
            {w.move}
            <select autoFocus={edit.kind === "move"} value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">{w.unplaced}</option>
              {templateBeats(s.arc.template, s.arc.custom).map((k) => (
                <option key={k} value={k}>
                  {beatText(k, t.plan.beats, s.arc.custom).label}
                </option>
              ))}
            </select>
          </label>
        )}
        {edit.kind === "order" && (
          <label>
            {w.order}
            <select autoFocus value={rank} onChange={(e) => setRank(Number(e.target.value))}>
              {s.books.map((b, i) => (
                <option key={b.id} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        {edit.kind === "milestone" && (
          <label>
            {v.link}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">—</option>
              {s.books.map((b) => (
                <option key={b.id} value={b.id}>
                  {bookName(b)}
                </option>
              ))}
              {nodes
                .filter((n) => n.data.type === "scene")
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.title || t.manuscript.untitled}
                  </option>
                ))}
            </select>
          </label>
        )}
        <footer>
          <button type="button" className="ghost-button" onClick={close}>
            {t.ai.cancel}
          </button>
          <button className="primary-button">{w.done}</button>
        </footer>
      </form>
    </dialog>
  );
}
function Synopsis({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const short = text.length > 145 && !open ? text.slice(0, 145).replace(/\s+\S*$/u, "") + "…" : text;
  return (
    <>
      <p className="series-synopsis">{short}</p>
      {text.length > 145 && (
        <button className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t.workspace.less : t.workspace.more}
        </button>
      )}
    </>
  );
}

function useOverviewPosition() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const loc = seriesLocation();
    if (root.current && loc.focus) {
      root.current
        .querySelector<HTMLButtonElement>('[data-book="' + CSS.escape(loc.focus) + '"]')
        ?.focus({ preventScroll: true });
      root.current.scrollTop = loc.scroll ?? 0;
    }
  }, []);
  return root;
}

export function SeriesOutline({ series: s }: { series: NovelSeries }) {
  const t = useT(),
    w = t.workspace,
    v = t.volumes;
  const mode = useSettings((st) => st.sequencerMode),
    phone = usePhone();
  const nodes = useCosmos((st) => st.nodes);
  const cards = mode === "cards" && !phone;
  const [edit, setEdit] = useState<Edit | null>(null);
  const [folded, fold] = useState<string[]>([]);
  const root = useOverviewPosition();
  return (
    <div className="sequencer series-outline" ref={root}>
      <div className={"sq-inner" + (cards ? " is-cards" : "")}>
        <PlanHeader
          title={v.arc}
          noTimeline
          timeline={false}
          onTimeline={() => {}}
          modeAria={t.plan.modeAria}
          total={
            <span className="sq-total">
              {s.books.length} {w.books.toLocaleLowerCase()}
            </span>
          }
          actions={
            <>
              <button className="ghost-button" onClick={() => setEdit({ kind: "book", group: "" })}>
                + {v.book}
              </button>
              <MoreMenu
                items={[
                  { label: w.rename, onSelect: () => setEdit({ kind: "rename", group: "" }) },
                  {
                    label: t.plan.template,
                    onSelect: () => root.current?.querySelector<HTMLSelectElement>(".plan-template select")?.focus(),
                  },
                ]}
              />
            </>
          }
          template={
            <TemplatePicker
              value={s.arc.template}
              options={NOVEL_TEMPLATES}
              custom={s.arc.custom}
              onBuiltin={(template) =>
                template && updateSeries((series) => ({ ...series, arc: { ...series.arc, template } }))
              }
              onCustom={(name, rows) =>
                updateSeries((series) => {
                  const beats = withKeys(rows, Object.keys(series.arc.beats));
                  const placed = { ...series.arc.beats };
                  rows
                    .filter((r) => r.label.trim())
                    .forEach((row, i) => {
                      if (row.from && placed[row.from]) placed[beats[i].key] = [...placed[row.from]];
                    });
                  return {
                    ...series,
                    arc: { ...series.arc, template: "perso", custom: { name, beats }, beats: placed },
                  };
                })
              }
            />
          }
        />
        {seriesGroups(s).map(({ key, ids }) => {
          const info = key ? beatText(key, t.plan.beats, s.arc.custom) : { label: w.unplaced, hint: "" };
          const books = s.books.filter((b) => ids.includes(b.id));
          const numbers = books.map((b) => s.books.indexOf(b) + 1);
          const range =
            numbers.length > 1 && numbers.at(-1)! - numbers[0] + 1 === numbers.length
              ? numbers[0] + "–" + numbers.at(-1)
              : numbers.join(", ");
          const collapsed = folded.includes(key);
          return (
            <section key={key} className="plan-beat is-beat series-arc">
              <h2>
                <button
                  className="arc-toggle"
                  aria-expanded={!collapsed}
                  onClick={() => fold(collapsed ? folded.filter((k) => k !== key) : [...folded, key])}
                >
                  <span className={"disclosure" + (!collapsed ? " is-open" : "")} aria-hidden="true" />
                  {info.label}
                </button>
                {range && (
                  <small>
                    {numbers.length === 1 ? v.book : w.books} {range}
                  </small>
                )}
              </h2>
              {!collapsed && (
                <>
                  {info.hint && <p className="plan-beat-hint">{info.hint}</p>}
                  <div className={cards ? "series-books cards" : "series-books"}>
                    {books.map((b) => (
                      <article className="series-book" key={b.id}>
                        <div className="series-book-head">
                          <span>
                            {v.book} {s.books.indexOf(b) + 1}
                          </span>
                          <MoreMenu
                            label={bookName(b) + " · " + t.app.moreActions}
                            items={[
                              { label: w.edit, onSelect: () => setEdit({ kind: "book", id: b.id, group: key }) },
                              { label: w.move, onSelect: () => setEdit({ kind: "move", id: b.id, group: key }) },
                              { label: w.reorder, onSelect: () => setEdit({ kind: "order", id: b.id, group: key }) },
                              { label: w.manuscript, onSelect: () => enterBook(b.id, "manuscrit") },
                            ]}
                          />
                        </div>
                        <h3>
                          <button data-book={b.id} onClick={() => enterBook(b.id)}>
                            {bookName(b)}
                          </button>
                        </h3>
                        {b.synopsis && <Synopsis text={b.synopsis} />}
                      </article>
                    ))}
                  </div>
                  {s.milestones
                    .filter((m) => ids.includes(m.id))
                    .map((m) => {
                      const dest = s.books.find((b) => b.id === m.target),
                        scene = nodes.find((n) => n.id === m.target);
                      return (
                        <aside className="series-event" key={m.id}>
                          <strong>{m.title}</strong>{" "}
                          <MoreMenu
                            items={[
                              { label: w.edit, onSelect: () => setEdit({ kind: "milestone", id: m.id, group: key }) },
                              {
                                label: v.remove,
                                danger: true,
                                onSelect: () =>
                                  updateSeries((series) => ({
                                    ...series,
                                    milestones: series.milestones.filter((x) => x.id !== m.id),
                                    arc: placed(series, m.id, ""),
                                  })),
                              },
                            ]}
                          />
                          {m.notes && <Synopsis text={m.notes} />}
                          {(dest || scene) && (
                            <button
                              className="link-button"
                              onClick={() =>
                                dest ? enterBook(dest.id) : useCosmos.getState().openInManuscript(scene!.id)
                              }
                            >
                              ↗ {dest ? bookName(dest) : scene?.data.title}
                            </button>
                          )}
                        </aside>
                      );
                    })}
                  <footer>
                    <button className="link-button" onClick={() => setEdit({ kind: "book", group: key })}>
                      + {v.book}
                    </button>
                    <button className="link-button" onClick={() => setEdit({ kind: "milestone", group: key })}>
                      + {v.milestone}
                    </button>
                  </footer>
                </>
              )}
            </section>
          );
        })}
        {edit && <Editor s={s} edit={edit} close={() => setEdit(null)} />}
      </div>
    </div>
  );
}
export function SeriesManuscript({ series }: { series: NovelSeries }) {
  const root = useOverviewPosition();
  const t = useT(),
    loc = seriesLocation(),
    last = series.books.find((b) => b.id === loc.lastBook);
  return (
    <div className="sequencer" ref={root}>
      <div className="sq-inner series-drafts">
        <h1>{t.views.manuscrit}</h1>
        {last && (
          <button className="ghost-button" onClick={() => enterBook(last.id)}>
            {t.workspace.resume} · {bookName(last)}
          </button>
        )}
        <ol>
          {series.books.map((b) => (
            <li key={b.id}>
              <button className="link-button" data-book={b.id} onClick={() => enterBook(b.id)}>
                {bookName(b)}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
