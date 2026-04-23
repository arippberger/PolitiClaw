import { defineConfig } from "vitepress";

export default defineConfig({
  title: "PolitiClaw",
  description:
    "Living documentation for the PolitiClaw OpenClaw plugin.",
  cleanUrls: true,
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/politiclaw-mark.png" }]
  ],
  themeConfig: {
    logo: { src: "/politiclaw-mark.png", alt: "PolitiClaw" },
    siteTitle: "politiclaw",
    nav: [
      { text: "Get Started", link: "/guide/getting-started" },
      { text: "By Task", link: "/guide/entry-points-by-goal" },
      { text: "Reference", link: "/reference/tools" },
      { text: "Maintainers", link: "/maintainers/architecture" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "See How My Reps Align", link: "/guide/see-how-my-reps-align" },
          { text: "Entry Points by Goal", link: "/guide/entry-points-by-goal" },
          { text: "Understand My Ballot", link: "/guide/understand-my-ballot" },
          { text: "Track Bills and Votes", link: "/guide/track-bills-and-votes" },
          { text: "Research Candidates", link: "/guide/research-candidates" },
          { text: "Draft Outreach", link: "/guide/draft-outreach" },
          { text: "Set It and Forget It", link: "/guide/set-it-and-forget-it" },
          { text: "How Accountability Works", link: "/guide/rep-accountability" },
          { text: "Example Alerts", link: "/guide/example-alerts" },
          { text: "Manage Monitoring", link: "/guide/monitoring" },
          { text: "Installation and Verification", link: "/guide/installation-and-verification" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Privacy and Storage", link: "/guide/privacy-and-storage" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" }
        ]
      },
      {
        text: "Reference",
        items: [
          { text: "Tools", link: "/reference/tools" },
          { text: "Tool Audit", link: "/reference/tool-audit" },
          { text: "Config Schema", link: "/reference/config-schema" },
          { text: "Coverage & Limits", link: "/reference/source-coverage" },
          { text: "Cron Jobs", link: "/reference/cron-jobs" },
          { text: "Storage Schema", link: "/reference/storage-schema" },
          { text: "Skills", link: "/reference/skills" }
        ]
      },
      {
        text: "Maintainers",
        items: [
          { text: "Architecture", link: "/maintainers/architecture" },
          { text: "Docs System", link: "/maintainers/docs-system" },
          { text: "Tool Surface Policy", link: "/maintainers/tool-surface" },
          { text: "Release Checklist", link: "/maintainers/release-checklist" },
          { text: "Legacy Docs Audit", link: "/maintainers/legacy-docs-audit" }
        ]
      }
    ],
    search: {
      provider: "local"
    },
    outline: {
      level: [2, 3]
    },
    footer: {
      message: "Built for people who want local-first political tooling.",
      copyright: "PolitiClaw"
    }
  }
});
