---
layout: home

hero:
  name: "PolitiClaw"
  text: "Living docs for a local-first political workflow."
  tagline: "Generated reference where accuracy matters, short guides where judgment matters."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Browse Reference
      link: /reference/tools

features:
  - title: Runtime-backed reference
    details: Tool pages, config keys, source coverage, cron jobs, skills, and storage schema are generated from the current implementation.
  - title: Honest coverage boundaries
    details: The docs distinguish between features wired today, optional upgrades, transport-pending adapters, and schema-only placeholders.
  - title: User-first, maintainer-aware
    details: The guide stays short and practical, while maintainers get architecture notes and a docs workflow that can fail on drift.
---

## How To Read This Site

Start in the guide if you are installing or using the plugin. Move into reference when you need exact tool names, live config status, storage shape, or the current provider matrix. Maintainer pages explain how the runtime and the docs generator fit together.

## What Is In Scope

PolitiClaw currently focuses on federal bills and House votes, federal representative lookup, ballot and election prep, recurring monitoring, candidate finance research, and draft-only outreach. It does not currently ship a dashboard, a background web service, or a send-on-your-behalf outreach path.
