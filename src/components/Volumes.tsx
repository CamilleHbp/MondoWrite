import { useState } from "react";
import { useCosmos } from "../store";
import { newId } from "../projectState";
import { useT } from "../i18n";
import { NOVEL_TEMPLATES, prunePlan, arrange, beatText, placeScene, templateBeats, type PlanTemplate } from "../plan";
import { interactiveOffered } from "../interactive";
import { useSettings } from "../settings";
import { startSeries, type NovelSeries } from "../novelSeries";

export function Volumes({ manage = false }: { manage?: boolean }) {
  const t = useT();
  const v = t.volumes;
  const series = useCosmos(s => s.plan.series);
  const nodes = useCosmos(s => s.nodes);
  const [opened, show] = useState(false);
  const [branching, setBranching] = useState(false);
  const [name, rename] = useState("");
  const store = useCosmos.getState();
  const update = (fn: (s: NovelSeries) => NovelSeries) => store.changeNovelPlan(p => p.series ? { ...p, series: fn(p.series) } : p);
  if (!series) return manage ? <details><summary>{v.convert}</summary><form onSubmit={e => {
    e.preventDefault();
    if (name.trim()) {
      store.changeNovelPlan(p => startSeries(p, name.trim(), store.title, newId()));
      rename("");
      show(true);
    }
  }}><input required aria-label={v.name} placeholder={v.name} value={name} onChange={e => rename(e.target.value)} /><button>{v.convert}</button></form></details> : null;
  const active = series.books.find(b => b.id === series.active)!;
  const shift = (delta: number) => update(s => {
    const books = [...s.books];
    const i = books.findIndex(b => b.id === s.active);
    books.splice(i + delta, 0, ...books.splice(i, 1));
    return { ...s, books };
  });
  const ids = series.milestones.map(m => m.id);
  const beats = arrange(series.arc, ids);
  return <section className="novel-volumes" aria-label={v.series}>
    <label>{series.title} <select aria-label={v.book} value={active.id} onChange={e => store.selectVolume(e.target.value)}>
      {series.books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
    </select></label>
    {manage && <button aria-expanded={opened} onClick={() => show(!opened)}>{v.arc}</button>}
    {manage && opened && <div className="novel-arc">
      <label>{v.name} <input key={series.title} defaultValue={series.title} onBlur={e => e.target.value.trim() && update(s => ({ ...s, title: e.target.value.trim() }))} /></label>
      <label>{v.title} <input key={active.id} defaultValue={active.title} onBlur={e => e.target.value.trim() && update(s => ({ ...s, books: s.books.map(b => b.id === active.id ? { ...b, title: e.target.value.trim() } : b) }))} /></label>
      <button disabled={series.books[0] === active} onClick={() => shift(-1)}>{v.earlier}</button>
      <button disabled={series.books.at(-1) === active} onClick={() => shift(1)}>{v.later}</button>
      <form onSubmit={e => {
        e.preventDefault();
        if (!name.trim()) return;
        const id = newId();
        update(s => ({ ...s, books: [...s.books, { id, title: name.trim(), scenes: [], settings: branching ? { interactive: true } : {} }] }));
        store.selectVolume(id);
        rename("");
      }}><input required aria-label={v.add} placeholder={v.title} value={name} onChange={e => rename(e.target.value)} /><button>{v.add}</button>{interactiveOffered(useSettings.getState().experimental) && <label><input type="checkbox" checked={branching} onChange={e => setBranching(e.target.checked)} />{t.interactive.kind}</label>}</form>
      <label>{v.arc} <select value={series.arc.template} onChange={e => update(s => ({ ...s, arc: { ...s.arc, template: e.target.value as PlanTemplate } }))}>
        {NOVEL_TEMPLATES.map(k => <option key={k} value={k}>{t.plan.templates[k]}</option>)}
      </select></label>
      {[...beats.beats, ...(beats.unplaced.length ? [{ key: "", ids: beats.unplaced }] : [])].map(row => <section key={row.key}>
        <h3>{row.key ? beatText(row.key, t.plan.beats).label : t.plan.unplaced}</h3>
        {row.ids.map(id => {
          const m = series.milestones.find(x => x.id === id)!;
          const patch = (values: Partial<typeof m>) => update(s => ({ ...s, milestones: s.milestones.map(x => x.id === id ? { ...x, ...values } : x) }));
          return <div key={id}><input aria-label={v.milestone} defaultValue={m.title} onBlur={e => patch({ title: e.target.value })} />
            <textarea aria-label={v.notes} defaultValue={m.notes} onBlur={e => patch({ notes: e.target.value })} />
            <select aria-label={v.arc} value={row.key} onChange={e => update(s => ({ ...s, arc: placeScene(s.arc, ids, id, e.target.value) }))}>
              {!row.key && <option value=""/>}{templateBeats(series.arc.template).map(k => <option key={k} value={k}>{beatText(k, t.plan.beats).label}</option>)}
            </select>
            <select aria-label={v.link} value={m.target ?? ""} onChange={e => patch({ target: e.target.value || undefined })}>
              <option value="">{v.link}</option>{series.books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              {nodes.filter(n => n.data.type === "scene").map(n => <option key={n.id} value={n.id}>{n.data.title || t.manuscript.untitled}</option>)}
            </select>
            {m.target && <button onClick={() => {
              if (series.books.some(b => b.id === m.target)) store.selectVolume(m.target!);
              else if (nodes.some(n => n.id === m.target)) store.openInManuscript(m.target!);
            }}>{t.volumes.open}</button>}
            <button onClick={() => update(s => ({ ...s, milestones: s.milestones.filter(x => x.id !== id),
              arc: prunePlan(s.arc, new Set(ids.filter(x => x !== id))) }))}>{t.volumes.remove}</button>
          </div>;
        })}
        <button onClick={() => { const id = newId(); update(s => ({ ...s, milestones: [...s.milestones, { id, title: "", notes: "" }], arc: placeScene(s.arc, [...ids, id], id, row.key || null) })); }}>+ {v.milestone}</button>
      </section>)}
    </div>}
  </section>;
}

export function MoveToBook({ ids, chapter }: { ids: string[]; chapter?: string }) {
  const t = useT();
  const series = useCosmos(s => s.plan.series);
  const [error, setError] = useState("");
  if (!series || series.books.length < 2) return null;
  return <label>{t.volumes.move} <select value="" onChange={e => {
    const dest = e.target.value;
    setError(useCosmos.getState().moveToBook(ids, dest, chapter) ?? "");
  }}><option value=""/>{series.books.filter(b => b.id !== series.active).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>{error && <span role="alert">{t.volumes.choice}: {error}</span>}</label>;
}
