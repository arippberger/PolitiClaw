---
layout: page
title: PolitiClaw
titleTemplate: Local-first civic docs
---

<script setup>
import { withBase } from "vitepress";
</script>

<div class="pc-home">

<div class="pc-breadcrumbs">overview<span class="sep">/</span>politiclaw</div>

<section class="pc-hero">
  <div class="pc-eyebrow">overview <span class="red">·</span> v0.0.1 <span class="blue">·</span> openclaw plugin</div>

  <h1 class="pc-hero-h1">
    <img :src="withBase('/politiclaw-mark.png')" alt="" class="pc-hero-mark" />
    <span><span class="politi">politi</span><span class="claw">claw</span></span>
  </h1>

  <div class="pc-tagline">
    <span class="quote">Living docs for a local-first political workflow.</span>
    Generated reference where accuracy matters. Short guides where judgment matters.
  </div>

  <p class="pc-lede">
    PolitiClaw is an <strong>OpenClaw plugin</strong> for federal bills and House votes, federal representative lookup, ballot and election prep, recurring monitoring, candidate finance research, and draft-only outreach. The docs split into a narrative <strong>guide</strong> you read end-to-end and a <strong>reference</strong> generated from the current implementation.
  </p>

  <div class="pc-cta">
    <a href="/guide/getting-started" class="pc-btn primary">get started <span class="arrow">→</span></a>
    <a href="/reference/tools" class="pc-btn secondary">browse reference</a>
    <a href="/maintainers/architecture" class="pc-btn ghost">↗ maintainers</a>
  </div>

  <div class="pc-chips">
    <span class="pc-chip"><span class="dot"></span> v0.0.1 · local-first</span>
    <span class="pc-chip">openclaw plugin</span>
    <span class="pc-chip">us federal · google civic ballots</span>
  </div>
</section>

<div class="pc-card-grid cols-3">
  <a class="pc-card" href="/guide/getting-started">
    <div class="idx">01 · start</div>
    <div class="ttl">getting started</div>
    <div class="desc">Read the two-pass layout of the site and the shortest path from a fresh install to a real answer.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/installation-and-verification">
    <div class="idx">02 · install</div>
    <div class="ttl">installation &amp; verification</div>
    <div class="desc">Link the plugin into an OpenClaw gateway, run the workspace checks, and verify with <code>politiclaw_doctor</code>.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/reference/tools">
    <div class="idx">03 · tools</div>
    <div class="ttl">runtime tool reference</div>
    <div class="desc">Every registered tool with its description, source file, and parameter schema — generated from the current runtime.</div>
    <span class="arrow">→</span>
  </a>
</div>

<section id="what">
<h2 class="pc-h2">what is politiclaw?</h2>

<p>
  PolitiClaw is a <strong>local-first OpenClaw plugin</strong> that teaches your gateway about bills, representatives, ballots, and public-comment windows — then gives the agent the tools to answer questions, monitor changes, and draft outreach without sending your queries to a third-party political platform.
</p>

<p>
  Everything structured lives in plugin-owned storage on your machine. Outbound network calls happen only when a tool needs a provider-backed answer, and the <a href="/reference/source-coverage">source coverage page</a> is explicit about which providers are wired today versus declared in schema only.
</p>

<div class="pc-callout civic">
  <span class="label">honest scope</span>
  <div class="body">
    PolitiClaw does not currently ship a dashboard, a background web service, or a send-on-your-behalf outreach path. Outreach is <strong>draft-only</strong>, and the docs distinguish wired providers from optional upgrades, transport-pending adapters, and schema-only placeholders.
  </div>
</div>
</section>

<section id="how">
<h2 class="pc-h2">how it works</h2>

<p>
  The plugin registers three things with your OpenClaw gateway: a pool of <strong>provider adapters</strong> (api.data.gov, Google Civic, Geocodio, optional FEC), a <strong>tool bundle</strong> the agent can call (<code>politiclaw_doctor</code>, <code>politiclaw_get_my_reps</code>, <code>politiclaw_prepare_me_for_my_next_election</code>, …), and a set of <strong>cron templates</strong> the gateway schedules for monitoring.
</p>

<div class="pc-arch">  your message
      │
      ▼
┌──────────────────────┐      ┌──────────────────┐
│  <span class="h">openclaw gateway</span>    │◀────▶│  <span class="r">politiclaw</span>       │
│  router · sessions   │      │  tools + cron    │
└──────────────────────┘      └────────┬─────────┘
            ▲                          │
            │                   ┌──────┴───────┐
            │                   ▼              ▼
            │            ┌────────────┐ ┌────────────┐
            │            │ <span class="b">providers</span>  │ │ plugin     │
            │            │ api.data,  │ │ sqlite +   │
            │            │ civic,     │ │ shapefile  │
            │            │ geocodio   │ │ cache      │
            │            └────────────┘ └────────────┘
            │
   agent response + generated references</div>

<p>
  For the exact runtime wiring, read the <a href="/maintainers/architecture">architecture notes</a> and the <a href="/reference/source-coverage">source coverage matrix</a>.
</p>
</section>

<section id="capabilities">
<h2 class="pc-h2">what ships today</h2>

<div class="pc-card-grid cols-2">
  <div class="pc-card">
    <div class="idx">01</div>
    <div class="ttl">federal bills &amp; house votes</div>
    <div class="desc">Bills, House roll-call votes, and committee schedules through the shared <code>api.data.gov</code> key against api.congress.gov.</div>
  </div>
  <div class="pc-card">
    <div class="idx">02</div>
    <div class="ttl">rep finder</div>
    <div class="desc">Reps-by-address with a zero-key local shapefile path, or the Geocodio API path when you configure that key.</div>
  </div>
  <div class="pc-card">
    <div class="idx">03</div>
    <div class="ttl">ballot &amp; election prep</div>
    <div class="desc">Contest-by-contest prep for upcoming elections via Google Civic — the only wired ballot source today.</div>
  </div>
  <div class="pc-card">
    <div class="idx">04</div>
    <div class="ttl">recurring monitoring</div>
    <div class="desc">Plugin-owned cron templates plus a saved cadence that controls which default jobs stay enabled.</div>
  </div>
  <div class="pc-card">
    <div class="idx">05</div>
    <div class="ttl">candidate finance research</div>
    <div class="desc">FEC OpenFEC lookups through the same <code>api.data.gov</code> key, scoped for candidate and committee research.</div>
  </div>
  <div class="pc-card">
    <div class="idx">06</div>
    <div class="ttl">draft-only outreach</div>
    <div class="desc">Drafts letters, public comments, and testimony grounded in the bill text and your own saved stance — you send them yourself.</div>
  </div>
</div>
</section>

<section id="quickstart">
<h2 class="pc-h2">first successful run</h2>

<div class="pc-steps">

<div class="pc-step">
  <div class="num"><span class="n">01</span>install</div>
  <div>
    <div class="pc-step-title">link the plugin locally</div>
    <p>From the repository root:</p>
<pre><span class="k">npm</span> install
<span class="k">openclaw</span> plugins install ./packages/politiclaw-plugin --link</pre>
  </div>
</div>

<div class="pc-step">
  <div class="num"><span class="n">02</span>verify</div>
  <div>
    <div class="pc-step-title">check the workspace and runtime</div>
    <p>Run the standard checks, then verify the real environment with the doctor tool:</p>
<pre><span class="k">npm</span> run build
<span class="k">npm</span> run typecheck
<span class="k">npm</span> run test
<span class="c"># then, from inside openclaw:</span>
<span class="k">politiclaw_doctor</span></pre>
  </div>
</div>

<div class="pc-step">
  <div class="num"><span class="n">03</span>seed</div>
  <div>
    <div class="pc-step-title">save an address and load reps</div>
    <p>Save preferences once, then fetch reps. If you are using the zero-key path, prime the shapefile cache first.</p>
<pre><span class="k">politiclaw_set_preferences</span> <span class="s">"address=..."</span>
<span class="k">politiclaw_download_shapefiles</span>   <span class="c"># zero-key path only</span>
<span class="k">politiclaw_get_my_reps</span></pre>
  </div>
</div>

</div>

<p>Need the long version? See <a href="/guide/installation-and-verification">installation &amp; verification</a> and <a href="/guide/configuration">configuration</a>.</p>
</section>

<section id="trust">
<h2 class="pc-h2">sources &amp; trust</h2>

<p>
  Runtime-backed reference pages — tools, config schema, source coverage, cron jobs, skills, storage schema — are generated from the current implementation. Prose guides stay short and practical because the exact facts live in the generated pages next door.
</p>

<div class="pc-callout warn">
  <span class="label">not legal</span>
  <div class="body">
    <strong>PolitiClaw is not legal advice.</strong> It helps you find, read, and act on public-record civic information. For legal interpretation, talk to a lawyer; for voting rules, trust your Secretary of State over the bot.
  </div>
</div>

<div class="pc-callout">
  <span class="label">privacy</span>
  <div class="body">
    Structured state stays in plugin-owned local storage. External calls happen only when a tool needs a provider-backed answer. See <a href="/guide/privacy-and-storage">privacy &amp; storage</a> for the full boundary.
  </div>
</div>
</section>

<section id="start-here">
<h2 class="pc-h2">start here</h2>

<div class="pc-card-grid cols-3">
  <a class="pc-card" href="/guide/configuration">
    <div class="idx">04 · config</div>
    <div class="ttl">configuration</div>
    <div class="desc">Live keys (<code>apiDataGov</code>, <code>googleCivic</code>, <code>geocodio</code>) separated from schema-only placeholders.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/privacy-and-storage">
    <div class="idx">05 · privacy</div>
    <div class="ttl">privacy &amp; storage</div>
    <div class="desc">Where state lives, what leaves the machine, and which adapters are transport-pending.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/monitoring">
    <div class="idx">06 · monitor</div>
    <div class="ttl">monitoring</div>
    <div class="desc">Cadence modes (<code>off</code>, <code>election_proximity</code>, <code>weekly</code>, <code>both</code>) and what each one turns on.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/troubleshooting">
    <div class="idx">07 · fix</div>
    <div class="ttl">troubleshooting</div>
    <div class="desc">Common failure modes and how the doctor tool surfaces them as actionable gaps instead of stack traces.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/reference/config-schema">
    <div class="idx">08 · schema</div>
    <div class="ttl">config schema <span class="pc-pill stable">generated</span></div>
    <div class="desc">Every config key with its current status: <code>implemented</code>, <code>optional_upgrade</code>, or <code>schema_only</code>.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/reference/source-coverage">
    <div class="idx">09 · coverage</div>
    <div class="ttl">source coverage <span class="pc-pill stable">generated</span></div>
    <div class="desc">The provider matrix — which sources the runtime can actually call today, and which are declared only.</div>
    <span class="arrow">→</span>
  </a>
</div>
</section>

<div class="pc-footer-nav">
  <a class="nav-btn next" href="/guide/getting-started">
    <div class="dir">next →</div>
    <div class="ttl">getting started</div>
  </a>
</div>

</div>
