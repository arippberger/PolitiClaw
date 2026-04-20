import { defineConfig } from "vitepress";

export default defineConfig({
  title: "PolitiClaw",
  description:
    "Local-first OpenClaw plugin docs for setup, capabilities, privacy, and troubleshooting.",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Get Started", link: "/guide/getting-started" },
      { text: "Capabilities", link: "/guide/capabilities" },
      { text: "Configuration", link: "/guide/configuration" },
      { text: "Privacy", link: "/guide/privacy-and-data" },
      { text: "Troubleshooting", link: "/guide/troubleshooting" }
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Capabilities", link: "/guide/capabilities" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Privacy and Data", link: "/guide/privacy-and-data" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" }
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
