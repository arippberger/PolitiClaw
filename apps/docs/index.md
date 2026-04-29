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
  <div class="pc-eyebrow">overview <span class="red">·</span> v0.0.4 <span class="blue">·</span> openclaw plugin</div>

  <h1 class="pc-hero-h1">
    <img :src="withBase('/politiclaw-mark.png')" alt="" class="pc-hero-mark" />
    <span><span class="politi">politi</span><span class="claw">claw</span></span>
  </h1>

  <div class="pc-tagline">
    <span class="quote">Holds your representatives accountable to the values you declare.</span>
    Generated reference where accuracy matters. Short guides where judgment matters.
  </div>

  <p class="pc-lede">
    PolitiClaw is a <strong>local-first civic copilot</strong> — an OpenClaw plugin that learns the stances you care about, watches federal legislation and your reps' roll-call votes (House and Senate) for you, and flags when their actions align (or don't) with those stances. It drafts letters you send yourself; it never speaks on your behalf and never tells you how to vote. The docs split into a narrative <strong>guide</strong> you read end-to-end and a <strong>reference</strong> generated from the current implementation.
  </p>

  <div class="pc-cta">
    <a href="/guide/getting-started" class="pc-btn primary">get started <span class="arrow">→</span></a>
    <a href="/guide/entry-points-by-goal" class="pc-btn secondary">browse by task</a>
    <a href="/reference/tools" class="pc-btn ghost">browse reference</a>
  </div>

  <div class="pc-chips">
    <span class="pc-chip"><span class="dot"></span> v0.0.4 · local-first</span>
    <span class="pc-chip">openclaw plugin</span>
    <span class="pc-chip">us federal · google civic ballots</span>
  </div>
</section>

<div class="pc-card-grid cols-3">
  <a class="pc-card" href="/guide/see-how-my-reps-align">
    <div class="idx">01 · task</div>
    <div class="ttl">see how my reps align</div>
    <div class="desc">The accountability spine — measure your federal delegation against the stances you declared, with cited votes and honest coverage gaps.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/getting-started">
    <div class="idx">02 · start</div>
    <div class="ttl">getting started</div>
    <div class="desc">Read the two-pass layout of the site and the shortest path from a fresh install to a real answer.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/track-bills-and-votes">
    <div class="idx">03 · task</div>
    <div class="ttl">track bills &amp; votes</div>
    <div class="desc">Use the bill search and scoring path when the main question is what changed and why it matters.</div>
    <span class="arrow">→</span>
  </a>
</div>

<section id="what">
<h2 class="pc-h2">what is politiclaw?</h2>

<p>
  PolitiClaw is a <strong>local-first civic copilot</strong> that holds your representatives accountable to the values you declare. It learns the stances you care about, watches federal legislation and federal roll-call votes (House and Senate) on your behalf, and flags when your reps' actions align — or don't — with those stances. Ballot prep, candidate finance research, and draft-only outreach all build on the same stance-driven loop. Your queries never touch a third-party political platform.
</p>

<p>
  Everything structured lives in plugin-owned storage on your machine. Outbound network calls happen only when a tool needs a provider-backed answer, and the <a href="/reference/source-coverage">source coverage page</a> is explicit about which providers are wired today versus declared in schema only.
</p>

<div class="pc-callout civic">
  <span class="label">honest scope</span>
  <div class="body">
    Outreach is <strong>draft-only</strong> — PolitiClaw never sends mail, posts on your behalf, or routes your message through a political platform, so accountability stays in your hands instead of a vendor's. Coverage today is federal: bills and House roll-call votes through api.congress.gov, Senate roll-call votes through voteview.com, ballots through Google Civic. State legislation and local races are not yet wired; the docs distinguish wired providers from optional upgrades, transport-pending adapters, and schema-only placeholders. For the goal-indexed scope boundaries, see <a href="/reference/source-coverage#what-is-not-covered-today">current coverage</a>.
  </div>
</div>
</section>

<section id="how">
<h2 class="pc-h2">how it works</h2>

<p>
  The plugin registers three things with your OpenClaw gateway: a pool of <strong>provider adapters</strong> (api.data.gov for federal bills, House votes, and FEC finance; voteview.com for Senate votes; Google Civic for ballots; Geocodio as an optional rep-lookup upgrade), a <strong>tool bundle</strong> the agent can call (<code>politiclaw_doctor</code>, <code>politiclaw_configure</code>, <code>politiclaw_issue_stances</code>, <code>politiclaw_get_my_reps</code>, <code>politiclaw_election_brief</code>, …), and a set of <strong>cron templates</strong> the gateway schedules for monitoring.
</p>

```mermaid
graph TB
  user([your message]) --> gateway
  gateway[openclaw gateway<br/>router · sessions] <--> politiclaw[politiclaw<br/>tools + cron]
  politiclaw --> providers[providers<br/>api.data.gov · voteview<br/>google civic · geocodio · fec]
  politiclaw --> storage[local storage<br/>sqlite + shapefiles]
  gateway --> response([agent response +<br/>generated references])
```

<p class="pc-legend">
  <strong>providers</strong>: external network sources reached only when a tool needs a provider-backed answer (api.congress.gov, voteview.com, Google Civic, Geocodio, FEC). <strong>local storage</strong>: plugin-owned files on your machine (SQLite database for structured records; cached shapefiles for the zero-key reps-by-address path).
</p>

<p>
  For the exact runtime wiring, read the <a href="/maintainers/architecture">architecture notes</a> and the <a href="/reference/source-coverage">source coverage matrix</a>.
</p>
</section>

<section id="capabilities">
<h2 class="pc-h2">what ships today</h2>

<div class="pc-card-grid cols-2">
  <div class="pc-card">
    <div class="idx">01</div>
    <div class="ttl">representative accountability</div>
    <div class="desc">Per-rep and per-issue alignment scoring against your declared stances, driven by deterministic matching of House and Senate roll-call votes to the bills you have signal on. Confidence floor preserves "insufficient data" honesty; state/local accountability is not claimed.</div>
  </div>
  <div class="pc-card">
    <div class="idx">02</div>
    <div class="ttl">federal bills &amp; congressional votes</div>
    <div class="desc">The evidence base. Bills, House roll-call votes, and committee schedules through the shared <code>api.data.gov</code> key against api.congress.gov; Senate roll-call votes through voteview.com (zero-key).</div>
  </div>
  <div class="pc-card">
    <div class="idx">03</div>
    <div class="ttl">rep finder</div>
    <div class="desc">Reps-by-address with a zero-key local shapefile path, or the Geocodio API path when you configure that key. Needed before any accountability score can be computed.</div>
  </div>
  <div class="pc-card">
    <div class="idx">04</div>
    <div class="ttl">ballot &amp; election prep</div>
    <div class="desc">Contest-by-contest prep for upcoming elections via Google Civic — the only wired ballot source today.</div>
  </div>
  <div class="pc-card">
    <div class="idx">05</div>
    <div class="ttl">recurring monitoring</div>
    <div class="desc">Plugin-owned cron templates plus a saved cadence that controls which default jobs stay enabled. Feeds the weekly digest and monthly rep report — see <a href="/guide/recurring-monitoring">recurring monitoring</a> for what the jobs do over time.</div>
  </div>
  <div class="pc-card">
    <div class="idx">06</div>
    <div class="ttl">candidate finance research</div>
    <div class="desc">FEC OpenFEC lookups through the same <code>api.data.gov</code> key, scoped for candidate and committee research.</div>
  </div>
  <div class="pc-card">
    <div class="idx">07</div>
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
    <div class="pc-step-title">run configuration once, then verify reps</div>
    <p>Use the single setup tool to save your address, prime the zero-key path if needed, and load reps.</p>
<pre><span class="k">politiclaw_configure</span> <span class="s">"address=..."</span>
<span class="k">politiclaw_get_my_reps</span>   <span class="c"># optional direct verification</span></pre>
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
  <a class="pc-card" href="/guide/see-how-my-reps-align">
    <div class="idx">01 · task</div>
    <div class="ttl">see how my reps align</div>
    <div class="desc">The accountability spine — find your delegation, score each rep against your declared stances, and read the per-issue breakdown with cited votes.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/understand-my-ballot">
    <div class="idx">02 · task</div>
    <div class="ttl">understand my ballot</div>
    <div class="desc">Fold accountability context into the next ballot. Start with the highest-value ballot workflow instead of piecing it together yourself.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/research-candidates">
    <div class="idx">03 · task</div>
    <div class="ttl">research candidates</div>
    <div class="desc">Start from the single-candidate workflow before opening the more detailed race-comparison path.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/draft-outreach">
    <div class="idx">04 · task</div>
    <div class="ttl">draft outreach</div>
    <div class="desc">Turn accountability findings, bill research, or ballot prep into a draft the user can send themselves.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/recurring-monitoring">
    <div class="idx">07 · experience</div>
    <div class="ttl">recurring monitoring</div>
    <div class="desc">What the recurring monitoring jobs actually produce — when they speak, when they stay silent, what each one watches.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/rep-accountability">
    <div class="idx">08 · experience</div>
    <div class="ttl">how accountability works</div>
    <div class="desc">The loop from declared stances through scored reps to a draft letter you send yourself. Includes the dissenting-view rule.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/example-alerts">
    <div class="idx">09 · experience</div>
    <div class="ttl">example alerts</div>
    <div class="desc">What a well-formed rep-vote hit, weekly digest, and quiet-window silence look like — and what a bad alert would look like.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/monitoring">
    <div class="idx">10 · task</div>
    <div class="ttl">manage monitoring</div>
    <div class="desc">Use cadence as the main control for the weekly digest and the monthly rep accountability report.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/guide/configuration">
    <div class="idx">11 · config</div>
    <div class="ttl">configuration</div>
    <div class="desc">Live keys (<code>apiDataGov</code>, <code>googleCivic</code>, <code>geocodio</code>) separated from schema-only placeholders.</div>
    <span class="arrow">→</span>
  </a>
  <a class="pc-card" href="/reference/tools">
    <div class="idx">12 · reference</div>
    <div class="ttl">runtime reference</div>
    <div class="desc">Drop to the generated reference when you need exact tool schemas, config keys, or source coverage facts.</div>
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
