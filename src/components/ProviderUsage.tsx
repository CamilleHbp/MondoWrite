import { invoke } from "@tauri-apps/api/core";
import { useEffect, useId, useRef, useState } from "react";
import type { AiProvider } from "../ai/providers";
import { planModels } from "../ai/chatgpt";
import { requestsToday } from "../ai/usage";
import { fmt, useT } from "../i18n";
import { openExternal } from "../platform";
import { useSettings } from "../settings";

interface UsageWindow { percent: number; reset: number | null }

type CodexSnapshot = { connected: boolean; workspace: string | null; label: string | null; windows: UsageWindow[] };
type UsageAction = "read" | "preview" | "connect" | "disconnect";
const codexUsage = (action: UsageAction, workspace?: string | null) =>
  invoke<CodexSnapshot>("codex_usage", { action, workspace });

export function ProviderUsage({ provider, menuCard = false }: { provider: AiProvider; menuCard?: boolean }) {
  const copy = useT().ai.chatgpt;
  const lang = useSettings((s) => s.lang);
  const [windows, setWindows] = useState<UsageWindow[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  useEffect(() => {
    let active = true;
    const update = () => {
      setNow(new Date());
      if (provider === "chatgpt") {
        void invoke<UsageWindow[]>("chatgpt_usage").then((data) => {
          if (active) setWindows(data);
        }).catch(() => {});
      }
    };
    setWindows([]);
    update();
    if (menuCard && provider === "chatgpt") {
      // The account catalogue is a read-only request. The native client captures
      // any quota headers before returning, so reopening never consumes inference.
      void planModels().then(() => { if (active) update(); }).catch(() => {});
    }
    const timer = window.setInterval(update, 60000);
    window.addEventListener("mondowrite-usage", update);
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("mondowrite-usage", update);
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
    };
  }, [provider, menuCard]);
  const [codex, setCodex] = useState<CodexSnapshot | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const run = async (action: UsageAction, workspace?: string | null) => {
    const id = ++revision.current;
    setBusy(true);
    setIssue("");
    try {
      const result = await codexUsage(action, workspace);
      if (id === revision.current) setCodex(result);
    } catch (error) {
      if (id === revision.current) {
        setCodex(null);
        const code = String(error);
        setIssue(code === "codexMissing" ? copy.codexMissing : code === "codexMismatch" ? copy.codexMismatch :
          code === "codexWorkspace" ? copy.codexWorkspace : copy.codexError);
      }
    } finally {
      if (id === revision.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (menuCard && provider === "chatgpt") void run("read");
    return () => { revision.current++; };
  }, [menuCard, provider]);
  const current = provider === "chatgpt" ? (codex?.connected ? codex.windows : windows).filter((w) => !w.reset || w.reset * 1000 > now.getTime()) : [];
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const date = (d: Date) => d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
  const used = (n: number) => fmt(copy.used, { n: n.toLocaleString(lang) });
  const local = fmt(copy.requests, { n: requestsToday(provider, now) });
  const plan = provider === "chatgpt";
  const summary = current.length ? current.map((w) => used(w.percent)).join(" · ") : plan ? copy.planUsage + " ↗" : local;
  return <div className={menuCard ? "provider-usage menu-usage" : "provider-usage"} onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
    onFocus={() => setExpanded(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false); }}
    onKeyDown={(e) => { if (e.key === "Escape" && expanded) { e.stopPropagation(); setExpanded(false); } }}>
    <button type="button" className="usage-toggle" aria-label={menuCard ? copy.planUsage : undefined} aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded(true)}>
      {menuCard ? <><svg viewBox="0 0 20 16" width="18" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M3 13a8 8 0 1 1 14 0M10 10l4-4" /><circle cx="10" cy="10" r="1" />
      </svg><strong>{copy.planUsage}</strong>{current.length > 0 && <span>{Math.round(current[0].percent)}%</span>}</> : summary}
    </button>
    <div id={id} hidden={!expanded} className="usage-detail settings-hint">
      {!menuCard && <strong>{copy.planUsage}</strong>}
      {current.length ? current.map((w, i) => <div className="usage-window" key={i}>
        <b>{used(w.percent)}</b><progress max={100} value={w.percent} aria-label={used(w.percent)} />
        <span>{w.reset ? fmt(copy.reset, { date: date(new Date(w.reset * 1000)) }) : copy.unknownReset}</span>
      </div>) : <div>{plan ? copy.viewAccount : fmt(copy.localReset, { date: date(midnight) })}</div>}
      {menuCard && <div className="codex-source">
        {codex?.label && <span>{codex.label}</span>}
        {codex?.workspace && !codex.connected && <span>{copy.confirmWorkspace}</span>}
        {issue && <span role="status">{issue}</span>}
        {busy && <span role="status">{copy.checkCodex}</span>}
        {!codex?.connected && <button type="button" className="usage-toggle" disabled={busy}
          onClick={() => void run(codex?.workspace ? "connect" : "preview", codex?.workspace)}>
          {codex?.workspace ? copy.useWorkspace : copy.linkCodex}
        </button>}
        {(codex?.connected || issue) && <button type="button" className="usage-toggle" disabled={busy}
          onClick={() => void run("disconnect")}>{copy.unlinkCodex}</button>}
      </div>}
      {plan && <><div>{local}</div><button type="button" className="usage-toggle" onClick={() => void openExternal("https://chatgpt.com/settings/usage")}>{copy.usage}
        <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12l8-8M5 4h7v7"/></svg>
      </button></>}
    </div>
  </div>;
}
