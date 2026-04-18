import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "politiclaw",
  name: "PolitiClaw",
  description:
    "Local-first personal political co-pilot: monitors legislation, tracks representatives, prepares you for elections, and drafts outreach.",
  register(api) {
    api.logger.info("politiclaw: registered");
  },
});
