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
      { text: "Reference", link: "/reference/tools" },
      { text: "Maintainers", link: "/maintainers/architecture" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Installation and Verification", link: "/guide/installation-and-verification" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Privacy and Storage", link: "/guide/privacy-and-storage" },
          { text: "Monitoring", link: "/guide/monitoring" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" }
        ]
      },
      {
        text: "Reference",
        items: [
          { text: "Tools", link: "/reference/tools" },
          { text: "Config Schema", link: "/reference/config-schema" },
          { text: "Source Coverage", link: "/reference/source-coverage" },
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
