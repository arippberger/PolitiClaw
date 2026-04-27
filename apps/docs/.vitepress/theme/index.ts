import { onMounted, watch, nextTick } from "vue";
import { useRoute } from "vitepress";
import DefaultTheme from "vitepress/theme";
import "./custom.css";
import { setupMermaidLightbox } from "./lightbox";

export default {
  extends: DefaultTheme,
  setup() {
    // Click-to-enlarge overlay for Mermaid diagrams. setupMermaidLightbox
    // is idempotent — it installs a single delegated document listener
    // the first time it's called and no-ops on subsequent calls. We
    // still trigger it after route changes so the listener is in place
    // even if a user lands directly on a non-diagram page first.
    if (typeof document === "undefined") return;
    const route = useRoute();
    onMounted(() => {
      setupMermaidLightbox();
    });
    watch(
      () => route.path,
      () => {
        nextTick(() => setupMermaidLightbox());
      },
    );
  },
};
