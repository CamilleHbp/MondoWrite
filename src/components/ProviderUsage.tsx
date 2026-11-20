import { invoke } from "@tauri-apps/api/core";
import { useEffect, useId, useState } from "react";
import type { AiProvider } from "../ai/providers";
import { requestsToday } from "../ai/usage";
import { fmt, useT } from "../i18n";
import { openExternal } from "../platform";
import { useSettings } from "../settings";

interface UsageWindow { percent: number; reset: number | null }

export function ProviderUsage({ provider }: { provider: AiProvider }) {
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
  }, [provider]);
  const current = provider === "chatgpt" ? windows.filter((w) => !w.reset || w.reset * 1000 > now.getTime()) : [];
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const date = (d: Date) => d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
  const used = (n: number) => fmt(copy.used, { n: n.toLocaleString(lang) });
  const local = fmt(copy.requests, { n: requestsToday(provider, now) });
  const plan = provider === "chatgpt";
  const summary = current.length ? current.map((w) => used(w.percent)).join(" · ") : plan ? copy.planUsage + " ↗" : local;
  return <div className="provider-usage" onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
    onFocus={() => setExpanded(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false); }}
    onKeyDown={(e) => { if (e.key === "Escape" && expanded) { e.stopPropagation(); setExpanded(false); } }}>
    <button type="button" className="usage-toggle" aria-expanded={expanded} aria-controls={id}
      onClick={() => plan && !current.length ? void openExternal("https://chatgpt.com/settings/usage") : setExpanded(true)}>{summary}</button>
    <div id={id} hidden={!expanded} className="usage-detail settings-hint">
      {current.length ? current.map((w, i) => <div key={i}>{used(w.percent)} · {w.reset ? fmt(copy.reset, { date: date(new Date(w.reset * 1000)) }) : copy.unknownReset}</div>)
        : plan ? copy.viewAccount : fmt(copy.localReset, { date: date(midnight) })}
      {plan && <div>{local}</div>}
      {plan && current.length > 0 && <button type="button" className="usage-toggle" onClick={() => void openExternal("https://chatgpt.com/settings/usage")}>{copy.usage} ↗</button>}
    </div>
  </div>;
}
