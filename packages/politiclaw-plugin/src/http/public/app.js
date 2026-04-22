(function () {
  "use strict";

  const STATUS_URL = "api/status";

  const elements = {
    generated: document.getElementById("pc-generated"),
    preferences: document.getElementById("pc-preferences-body"),
    reps: document.getElementById("pc-reps-body"),
    monitoring: document.getElementById("pc-monitoring-body"),
    election: document.getElementById("pc-election-body"),
  };

  async function load() {
    try {
      const response = await fetch(STATUS_URL, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("status endpoint returned " + response.status);
      }
      const payload = await response.json();
      render(payload);
    } catch (err) {
      setText(elements.generated, "Failed to load status: " + err.message);
      ["preferences", "reps", "monitoring", "election"].forEach(function (key) {
        elements[key].innerHTML = "";
        elements[key].appendChild(textNode("Unavailable: " + err.message));
      });
    }
  }

  function render(payload) {
    setText(
      elements.generated,
      "Generated " +
        new Date(payload.generatedAtMs).toLocaleString() +
        " (schema v" +
        payload.schemaVersion +
        ").",
    );
    renderPreferences(payload.preferences);
    renderReps(payload.reps);
    renderMonitoring(payload.monitoring);
    renderElection(payload.upcomingElection);
  }

  function renderPreferences(section) {
    const container = elements.preferences;
    container.innerHTML = "";
    if (section.status === "missing") {
      container.appendChild(statusLine("missing", section.reason));
      container.appendChild(actionable(section.actionable));
      return;
    }
    const kv = document.createElement("dl");
    kv.className = "pc-kv";
    appendKv(kv, "Address", section.address);
    if (section.zip) appendKv(kv, "ZIP", section.zip);
    if (section.state) appendKv(kv, "State", section.state);
    if (section.district) appendKv(kv, "District", section.district);
    appendKv(kv, "Cadence", section.monitoringCadence);
    appendKv(kv, "Updated", formatDate(section.updatedAtMs));
    container.appendChild(kv);

    if (section.issueStances.length === 0) {
      container.appendChild(mutedLine("No declared issue stances yet."));
      return;
    }
    const stancesLabel = document.createElement("p");
    stancesLabel.style.margin = "0.75rem 0 0.25rem";
    stancesLabel.textContent = "Issue stances";
    container.appendChild(stancesLabel);
    const ul = document.createElement("ul");
    ul.className = "pc-stances";
    section.issueStances.forEach(function (stance) {
      const li = document.createElement("li");
      li.appendChild(
        pill(
          stance.stance === "neutral"
            ? "accent"
            : stance.stance === "support"
              ? "ok"
              : stance.stance === "oppose"
                ? "warn"
                : "accent",
          stance.stance,
        ),
      );
      li.appendChild(
        textNode(
          stance.issue +
            " · weight " +
            stance.weight +
            " · " +
            formatDate(stance.updatedAtMs),
        ),
      );
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  function renderReps(section) {
    const container = elements.reps;
    container.innerHTML = "";
    if (section.status === "no_preferences" || section.status === "none") {
      container.appendChild(statusLine(section.status, section.reason));
      container.appendChild(actionable(section.actionable));
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "pc-reps";
    section.reps.forEach(function (rep) {
      ul.appendChild(renderRep(rep));
    });
    container.appendChild(ul);
  }

  function renderRep(rep) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.className = "pc-rep-head";

    const nameEl = document.createElement("span");
    nameEl.className = "pc-rep-name";
    nameEl.textContent = rep.name;
    head.appendChild(nameEl);
    head.appendChild(pill("accent", rep.office));
    if (rep.party) head.appendChild(pill(null, rep.party));
    head.appendChild(pill("accent", "tier " + rep.sourceTier));

    const meta = document.createElement("div");
    meta.className = "pc-rep-meta";
    const metaBits = [];
    if (rep.state) metaBits.push(rep.state + (rep.district ? "-" + rep.district : ""));
    metaBits.push("synced " + formatDate(rep.lastSyncedMs));
    metaBits.push(rep.sourceAdapterId);
    meta.textContent = metaBits.join(" · ");

    li.appendChild(head);
    li.appendChild(meta);

    const alignment = rep.alignment;
    const align = document.createElement("div");
    align.className = "pc-rep-alignment";
    if (alignment.status === "no_stances") {
      align.appendChild(statusLine("warn", "no declared stances"));
      align.appendChild(mutedLine(alignment.reason));
    } else if (alignment.status === "insufficient_data") {
      align.appendChild(statusLine("warn", "insufficient data"));
      align.appendChild(mutedLine(alignment.reason));
    } else {
      align.appendChild(
        statusLine(
          "ok",
          "Alignment " +
            percent(alignment.aggregateScore) +
            " · confidence " +
            percent(alignment.aggregateConfidence) +
            " · " +
            alignment.consideredVoteCount +
            " vote(s) counted",
        ),
      );
      if (alignment.perIssue.length > 0) {
        const ul = document.createElement("ul");
        ul.className = "pc-issue-list";
        alignment.perIssue.forEach(function (entry) {
          const li2 = document.createElement("li");
          li2.textContent =
            entry.issue +
            " (" +
            entry.stance +
            "): " +
            percent(entry.alignmentScore) +
            " aligned · " +
            entry.alignedCount +
            " aligned / " +
            entry.conflictedCount +
            " conflicted";
          ul.appendChild(li2);
        });
        align.appendChild(ul);
      }
    }
    li.appendChild(align);
    return li;
  }

  function renderMonitoring(section) {
    const container = elements.monitoring;
    container.innerHTML = "";
    if (section.status === "unavailable") {
      container.appendChild(statusLine("warn", section.reason));
      if (section.actionable) container.appendChild(actionable(section.actionable));
      return;
    }
    if (section.jobs.length === 0) {
      container.appendChild(mutedLine("No PolitiClaw monitoring jobs installed."));
      container.appendChild(
        actionable(
          "call politiclaw_configure to install the default cadence",
        ),
      );
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "pc-jobs";
    section.jobs.forEach(function (job) {
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "pc-job-head";
      const nameEl = document.createElement("span");
      nameEl.className = "pc-rep-name";
      nameEl.textContent = job.name;
      head.appendChild(nameEl);
      head.appendChild(pill(job.enabled ? "ok" : "warn", job.enabled ? "enabled" : "paused"));
      head.appendChild(pill(null, job.scheduleSummary));
      head.appendChild(pill(null, "session: " + job.sessionTarget));
      li.appendChild(head);
      if (job.updatedAtMs) {
        const meta = document.createElement("div");
        meta.className = "pc-job-meta";
        meta.textContent = "updated " + formatDate(job.updatedAtMs);
        li.appendChild(meta);
      }
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  function renderElection(section) {
    const container = elements.election;
    container.innerHTML = "";
    if (section.status === "none") {
      container.appendChild(mutedLine(section.reason));
      return;
    }
    if (section.status === "no_preferences" || section.status === "cache_miss") {
      container.appendChild(statusLine(section.status, section.reason));
      container.appendChild(actionable(section.actionable));
      return;
    }
    const kv = document.createElement("dl");
    kv.className = "pc-kv";
    appendKv(kv, "Election", section.electionName || "(unnamed)");
    appendKv(kv, "Date", section.electionDay);
    appendKv(kv, "Days until", String(section.daysUntil));
    appendKv(kv, "Contests", String(section.contestCount));
    if (section.pollingLocationName) {
      appendKv(kv, "Polling", section.pollingLocationName);
    }
    if (section.pollingAddress) {
      appendKv(kv, "Address", section.pollingAddress);
    }
    container.appendChild(kv);
  }

  function statusLine(kind, text) {
    const line = document.createElement("p");
    line.style.margin = "0 0 0.25rem";
    const cls =
      kind === "ok"
        ? "ok"
        : kind === "warn" || kind === "missing" || kind === "no_preferences" || kind === "cache_miss"
          ? "warn"
          : kind === "fail" || kind === "none"
            ? "fail"
            : "accent";
    line.appendChild(pill(cls, kindLabel(kind)));
    line.appendChild(textNode(text));
    return line;
  }

  function kindLabel(kind) {
    switch (kind) {
      case "ok":
        return "ok";
      case "warn":
        return "warn";
      case "fail":
        return "fail";
      case "missing":
        return "missing";
      case "no_preferences":
        return "no address";
      case "cache_miss":
        return "not cached";
      case "none":
        return "none";
      default:
        return kind;
    }
  }

  function actionable(text) {
    if (!text) return document.createComment("");
    const p = document.createElement("p");
    p.className = "pc-actionable";
    p.textContent = "→ " + text;
    return p;
  }

  function mutedLine(text) {
    const p = document.createElement("p");
    p.className = "pc-empty";
    p.style.margin = "0";
    p.textContent = text;
    return p;
  }

  function pill(kind, text) {
    const span = document.createElement("span");
    span.className = "pc-pill" + (kind ? " pc-pill--" + kind : "");
    span.textContent = text;
    return span;
  }

  function appendKv(dl, label, value) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function setText(el, text) {
    el.textContent = text;
  }

  function textNode(text) {
    return document.createTextNode(text);
  }

  function formatDate(ms) {
    if (!ms) return "—";
    try {
      return new Date(ms).toLocaleString();
    } catch (err) {
      return String(ms);
    }
  }

  function percent(fraction) {
    if (!Number.isFinite(fraction)) return "—";
    return Math.round(fraction * 100) + "%";
  }

  load();
})();
