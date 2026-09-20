"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function Settings() {
  const [settings, setSettings] = useState<{ mode: string; model: string; keyConfigured: boolean; responseModel: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/settings/provider").then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setSettings).catch(() => setError("Could not load settings.")); }, []);
  return <div className="shell">
    <header className="topbar"><Link className="brand" href="/"><span className="logo">J</span> JEV Browser</Link><Link href="/">Back to workspace</Link></header>
    <main className="main"><section className="panel">
      <h1>Models and browser</h1>
      {error && <p role="alert">{error}</p>}
      {!settings ? <p>Loading…</p> : <dl className="model-settings">
        <div><dt>Browser decisions</dt><dd>{settings.model} · {settings.mode}</dd></div>
        <div><dt>Friendly responses</dt><dd>{settings.responseModel} · local Ollama</dd></div>
        <div><dt>OpenRouter key</dt><dd>{settings.keyConfigured ? "Configured (verified when you send a request)" : "Missing"}</dd></div>
        <div><dt>Browser</dt><dd>Playwright · open pages and read their contents</dd></div>
      </dl>}
      <p>Update the models and API key in the project’s .env file, then restart the API to apply changes.</p>
      <p>Jev chooses from the browser actions supplied by the app. Gemma writes the response from the findings and cannot choose or run tools.</p>
    </section></main>
  </div>;
}
