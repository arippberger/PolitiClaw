(function () {
  "use strict";

  const STATUS_URL = "api/status";
  const PREFS_URL = "api/preferences";
  const MONITORING_URL = "api/monitoring";
  const STANCE_URL = "api/stance-signals";
  const LETTERS_URL = "api/letters/";
  const CSRF_COOKIE = "pc_csrf";
  const CSRF_HEADER = "X-PolitiClaw-CSRF";

  const elements = {
    generated: document.getElementById("pc-generated"),
    toast: document.getElementById("pc-toast"),
    preferences: document.getElementById("pc-preferences-body"),
    preferencesForm: document.getElementById("pc-preferences-form"),
    reps: document.getElementById("pc-reps-body"),
    monitoring: document.getElementById("pc-monitoring-body"),
    monitoringPause: document.getElementById("pc-monitoring-pause"),
    monitoringResume: document.getElementById("pc-monitoring-resume"),
    election: document.getElementById("pc-election-body"),
    alerts: document.getElementById("pc-alerts-body"),
    letters: document.getElementById("pc-letters-body"),
    quickVote: document.getElementById("pc-quick-vote-body"),
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
      [
        "preferences",
        "reps",
        "monitoring",
        "election",
        "alerts",
        "letters",
        "quickVote",
      ].forEach(function (key) {
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
    renderAlerts(payload.recentAlerts);
    renderLetters(payload.recentLetters);
    renderQuickVote(payload.recentVotes);
    primePreferencesForm(payload.preferences);
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
    appendKv(kv, "Mode", section.monitoringMode);
    if (section.accountability) appendKv(kv, "Accountability", section.accountability);
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

  function primePreferencesForm(section) {
    const form = elements.preferencesForm;
    if (!form) return;
    if (section && section.status === "ok") {
      form.address.value = section.address || "";
      form.zip.value = section.zip || "";
      form.state.value = section.state || "";
      form.district.value = section.district || "";
    }
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
        actionable("call politiclaw_configure to install the default monitoring mode"),
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

  function renderAlerts(section) {
    const container = elements.alerts;
    container.innerHTML = "";
    if (!section || section.status === "none") {
      container.appendChild(mutedLine(section ? section.reason : "No alerts."));
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "pc-alerts";
    section.alerts.forEach(function (alert) {
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "pc-alert-head";
      head.appendChild(
        pill(
          alert.kind === "bill_change" ? "accent" : "ok",
          alert.kind === "bill_change" ? "bill" : "event",
        ),
      );
      head.appendChild(pill(null, alert.changeReason));
      head.appendChild(pill("accent", "tier " + alert.sourceTier));
      const summary = document.createElement("span");
      summary.className = "pc-alert-summary";
      summary.textContent = alert.summary;
      head.appendChild(summary);
      li.appendChild(head);

      const meta = document.createElement("div");
      meta.className = "pc-alert-meta";
      meta.textContent =
        formatDate(alert.createdAtMs) +
        " · " +
        alert.sourceAdapterId +
        " · " +
        alert.refId;
      li.appendChild(meta);

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

  function renderLetters(section) {
    const container = elements.letters;
    container.innerHTML = "";
    if (!section || section.status === "none") {
      container.appendChild(mutedLine(section ? section.reason : "No recent letters."));
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "pc-letters";
    section.letters.forEach(function (letter) {
      ul.appendChild(renderLetter(letter));
    });
    container.appendChild(ul);
  }

  function renderLetter(letter) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.className = "pc-letter-head";

    const subject = document.createElement("span");
    subject.className = "pc-rep-name";
    subject.textContent = letter.subject;
    head.appendChild(subject);
    head.appendChild(pill("accent", letter.repOffice));
    if (letter.redraftRequestedAtMs) {
      head.appendChild(pill("warn", "redraft pending"));
    }
    li.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "pc-letter-meta";
    const metaBits = [
      letter.repName,
      letter.issue,
      formatDate(letter.createdAtMs),
      letter.wordCount + " words",
    ];
    if (letter.billId) metaBits.push(letter.billId);
    meta.textContent = metaBits.join(" · ");
    li.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "pc-edit-inline";
    const redraftBtn = document.createElement("button");
    redraftBtn.type = "button";
    redraftBtn.textContent = letter.redraftRequestedAtMs
      ? "Re-request draft"
      : "Request re-draft";
    redraftBtn.addEventListener("click", function () {
      redraftBtn.disabled = true;
      postJson(LETTERS_URL + letter.id + "/redraft", {})
        .then(function (result) {
          toast("Re-draft requested for letter #" + letter.id + ". Next agent session will pick it up.");
          void result;
          return load();
        })
        .catch(function (err) {
          toast("Re-draft failed: " + err.message, true);
          redraftBtn.disabled = false;
        });
    });
    actions.appendChild(redraftBtn);
    li.appendChild(actions);
    return li;
  }

  function renderQuickVote(section) {
    const container = elements.quickVote;
    container.innerHTML = "";
    if (!section || section.status === "none") {
      container.appendChild(mutedLine(section ? section.reason : "No recent votes."));
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "pc-quick-votes";
    section.votes.forEach(function (vote) {
      ul.appendChild(renderQuickVoteItem(vote));
    });
    container.appendChild(ul);
  }

  function renderQuickVoteItem(vote) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.className = "pc-letter-head";
    const title = document.createElement("span");
    title.className = "pc-rep-name";
    title.textContent = vote.billTitle || vote.billId;
    head.appendChild(title);
    head.appendChild(pill("accent", vote.chamber));
    if (vote.result) head.appendChild(pill(null, vote.result));
    li.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "pc-letter-meta";
    const metaBits = [vote.billId];
    if (vote.startDate) metaBits.push(vote.startDate);
    if (vote.voteQuestion) metaBits.push(vote.voteQuestion);
    meta.textContent = metaBits.join(" · ");
    li.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "pc-edit-inline";
    ["agree", "disagree", "skip"].forEach(function (direction) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = direction;
      btn.addEventListener("click", function () {
        Array.from(actions.children).forEach(function (b) {
          b.disabled = true;
        });
        postJson(STANCE_URL, { billId: vote.billId, direction: direction })
          .then(function () {
            toast("Recorded " + direction + " on " + vote.billId + ".");
            btn.classList.add("pc-selected");
          })
          .catch(function (err) {
            toast("Save failed: " + err.message, true);
            Array.from(actions.children).forEach(function (b) {
              b.disabled = false;
            });
          });
      });
      actions.appendChild(btn);
    });
    li.appendChild(actions);
    return li;
  }

  function wirePreferencesForm() {
    const form = elements.preferencesForm;
    if (!form) return;
    form.addEventListener("submit", function (evt) {
      evt.preventDefault();
      const fd = new FormData(form);
      const payload = {};
      const address = String(fd.get("address") || "").trim();
      if (address) payload.address = address;
      const zip = String(fd.get("zip") || "").trim();
      if (zip) payload.zip = zip;
      const state = String(fd.get("state") || "").trim();
      if (state) payload.state = state.toUpperCase();
      const district = String(fd.get("district") || "").trim();
      if (district) payload.district = district;
      const monitoringMode = String(fd.get("monitoringMode") || "").trim();
      if (monitoringMode) payload.monitoringMode = monitoringMode;
      const accountability = String(fd.get("accountability") || "").trim();
      if (accountability) payload.accountability = accountability;

      if (Object.keys(payload).length === 0) {
        toast("Nothing to save.", true);
        return;
      }

      const submit = form.querySelector("button[type=submit]");
      if (submit) submit.disabled = true;
      postJson(PREFS_URL, payload)
        .then(function () {
          toast("Preferences saved.");
          return load();
        })
        .catch(function (err) {
          toast("Save failed: " + err.message, true);
        })
        .finally(function () {
          if (submit) submit.disabled = false;
        });
    });
  }

  function wireMonitoringButtons() {
    if (elements.monitoringPause) {
      elements.monitoringPause.addEventListener("click", function () {
        toggleMonitoring(false, elements.monitoringPause);
      });
    }
    if (elements.monitoringResume) {
      elements.monitoringResume.addEventListener("click", function () {
        toggleMonitoring(true, elements.monitoringResume);
      });
    }
  }

  function toggleMonitoring(enabled, btn) {
    btn.disabled = true;
    postJson(MONITORING_URL, { enabled: enabled })
      .then(function (result) {
        const flipped = (result.outcomes || []).filter(function (o) {
          return o.action === "paused" || o.action === "resumed";
        }).length;
        toast(
          (enabled ? "Resumed " : "Paused ") +
            flipped +
            " job(s). Refreshing…",
        );
        return load();
      })
      .catch(function (err) {
        toast("Toggle failed: " + err.message, true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function postJson(url, body) {
    const token = readCookie(CSRF_COOKIE);
    if (!token) {
      return Promise.reject(new Error("missing CSRF cookie — reload the page"));
    }
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    headers[CSRF_HEADER] = token;
    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok) {
          const message =
            (payload && (payload.message || payload.error)) ||
            "HTTP " + response.status;
          const err = new Error(message);
          err.status = response.status;
          err.payload = payload;
          throw err;
        }
        return payload;
      });
    });
  }

  function readCookie(name) {
    const parts = document.cookie.split(";");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      if (part.slice(0, eq) === name) {
        return decodeURIComponent(part.slice(eq + 1));
      }
    }
    return null;
  }

  function toast(message, isError) {
    const el = elements.toast;
    if (!el) return;
    el.textContent = message;
    el.className = "pc-toast" + (isError ? " pc-toast--error" : " pc-toast--ok");
    window.clearTimeout(toast._handle);
    toast._handle = window.setTimeout(function () {
      el.textContent = "";
      el.className = "pc-toast";
    }, 4000);
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

  wirePreferencesForm();
  wireMonitoringButtons();
  load();
})();
