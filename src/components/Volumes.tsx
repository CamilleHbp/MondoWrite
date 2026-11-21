import { useState } from "react";
import { useCosmos } from "../store";
import { newId } from "../projectState";
import { useT } from "../i18n";
import { startSeries } from "../novelSeries";

export function ConvertSeries() {
  const v = useT().volumes;
  const [name, rename] = useState("");
  return <details className="series-convert"><summary>{v.convert}</summary><form onSubmit={e => {
    e.preventDefault();
    const store = useCosmos.getState();
    if (name.trim()) store.changeNovelPlan(p => startSeries(p, name.trim(), store.title, newId()));
  }}><input required aria-label={v.name} placeholder={v.name} value={name} onChange={e => rename(e.target.value)} /><button>{v.convert}</button></form></details>;
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
