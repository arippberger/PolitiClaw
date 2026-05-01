# Skills

The generated skills reference is built from the current skill front matter in `packages/politiclaw-plugin/skills`.

- [Generated Skills Reference](./generated/skills)
- [Generated Skills JSON](./generated/skills.json)

Use it for exact skill names, directory mapping, and `read_when` triggers.

## Overriding skills

The bundled skills are just a fallback. Drop a skill with the same name into one of the paths below and OpenClaw uses yours instead — no fork, no rebuild. Useful for changing the plugin's voice, loosening or tightening its rules, or changing how letters get drafted. Full rules: [OpenClaw skills docs](https://docs.openclaw.ai/tools/skills#plugins-and-skills).

### Where your override goes

Four paths you control. Anything in any of them beats the bundled version:

| Path | When to use it |
| --- | --- |
| `<workspace>/skills` | Override only when you run OpenClaw inside that repo. |
| `<workspace>/.agents/skills` | Same scope, but lives next to your other project-agent config. |
| `~/.agents/skills` | Follows you across every workspace. **Start here.** |
| `~/.openclaw/skills` | Sits next to `~/.openclaw/openclaw.json` if that's where you already keep OpenClaw config. |

Name the directory exactly the same as the bundled one (see the [Generated Skills Reference](./generated/skills) for names). No `politiclaw:` prefix — just `politiclaw-outreach`.

### Example: change how letters get drafted

```bash
mkdir -p ~/.agents/skills/politiclaw-outreach
cp node_modules/@politiclaw/politiclaw/skills/politiclaw-outreach/SKILL.md \
  ~/.agents/skills/politiclaw-outreach/
$EDITOR ~/.agents/skills/politiclaw-outreach/SKILL.md
```

Reload the gateway. The next letter the agent drafts uses your version.

### Easier path if you have a local checkout

If you installed with `openclaw plugins install ./packages/politiclaw-plugin --link`, just edit `packages/politiclaw-plugin/skills/<name>/SKILL.md` in place. Gateway reload picks it up. See [Override recipes](https://github.com/PolitiClaw/PolitiClaw/blob/main/packages/politiclaw-plugin/README.md#override-recipes) in the plugin README.

### Things to know

- **Match by directory name.** Rename the directory and you should rename the `name:` field in the frontmatter to match — otherwise things drift.
- **It replaces, doesn't merge.** Your `SKILL.md` swaps in for the bundled one whole. Start from a copy if you only want to tweak a few lines.
- **Verify with `/politiclaw-doctor`.** The "Skill overrides" check lists which skills are bundled vs. overridden in `~/.agents/skills` or `~/.openclaw/skills`. Workspace-tier overrides aren't visible to the doctor — for those, run the matching tool (e.g. `politiclaw_draft_outreach`) and check the output.
