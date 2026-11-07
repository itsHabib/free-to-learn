/* Offline authored practice. No network, dynamic code, or learner Python execution. */
(function (root) {
  "use strict";
  const SCHEMA = "re-lab-reader-attempts-v1";
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (object(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function emptyWork(config) {
    return {
      schema: SCHEMA, course_id: config.course_id, course_version: config.course_version,
      page: config.page, question_version: config.question_version,
      questions: clone(config.questions),
      responses: Object.fromEntries(config.questions.map(question => [question.id, {first: null, later: [], imported_first: []}]))
    };
  }
  function validateImport(value, config) {
    if (!object(value) || value.schema !== SCHEMA) throw new Error("This is not a reader lesson export.");
    for (const field of ["course_id", "course_version", "page", "question_version"]) {
      if (value[field] !== config[field]) throw new Error("The " + field + " does not match this exact lesson. Open the original packet/version to read it.");
    }
    if (canonical(value.questions) !== canonical(config.questions)) throw new Error("Question wording or choices differ from this lesson.");
    const ids = config.questions.map(question => question.id);
    if (!object(value.responses) || canonical(Object.keys(value.responses).sort()) !== canonical(ids.slice().sort())) {
      throw new Error("The saved question identities do not match this lesson.");
    }
    const clean = emptyWork(config);
    const seen = new Set();
    for (const question of config.questions) {
      const record = value.responses[question.id];
      if (!object(record) || !own(record, "first") || !Array.isArray(record.later) || !Array.isArray(record.imported_first)) {
        throw new Error("A question's first/later attempt history is malformed.");
      }
      if (record.first === null && (record.later.length || record.imported_first.length)) throw new Error("Later attempts require a preserved first attempt.");
      function attempt(value) {
        if (!object(value) || typeof value.id !== "string" || !value.id || typeof value.choice !== "string" ||
            !question.choices.some(choice => choice.id === value.choice) || typeof value.checked_at !== "string" ||
            !Number.isFinite(Date.parse(value.checked_at))) throw new Error("An attempt has an invalid identity, choice, or check time.");
        if (seen.has(value.id)) throw new Error("An attempt identity occurs more than once.");
        seen.add(value.id);
        return {id: value.id, choice: value.choice, checked_at: value.checked_at};
      }
      clean.responses[question.id] = {
        first: record.first === null ? null : attempt(record.first),
        later: record.later.map(attempt), imported_first: record.imported_first.map(attempt)
      };
    }
    return clean;
  }
  function mergeWork(current, incoming, config) {
    // Validate both entirely before constructing a merged value. Neither input is mutated.
    const result = validateImport(current, config);
    const restored = validateImport(incoming, config);
    const seen = new Map();
    for (const question of config.questions) {
      const record = result.responses[question.id];
      for (const attempt of [record.first, ...record.later, ...record.imported_first].filter(Boolean)) {
        seen.set(attempt.id, {question: question.id, attempt});
      }
    }
    for (const question of config.questions) {
      const target = result.responses[question.id];
      const source = restored.responses[question.id];
      function add(attempt, role) {
        if (!attempt) return;
        if (seen.has(attempt.id)) {
          const previous = seen.get(attempt.id);
          if (previous.question !== question.id || canonical(previous.attempt) !== canonical(attempt)) {
            throw new Error("An existing attempt identity has different contents. Current work was kept.");
          }
          return;
        }
        if (role === "first" && target.first === null) target.first = clone(attempt);
        else if (role === "later") target.later.push(clone(attempt));
        else target.imported_first.push(clone(attempt));
        seen.set(attempt.id, {question: question.id, attempt});
      }
      add(source.first, "first");
      source.later.forEach(attempt => add(attempt, "later"));
      source.imported_first.forEach(attempt => add(attempt, "imported_first"));
    }
    return validateImport(result, config);
  }
  function recordCheck(current, config, questionId, choice, id, checkedAt) {
    const result = validateImport(current, config);
    const question = config.questions.find(item => item.id === questionId);
    if (!question || !question.choices.some(item => item.id === choice)) throw new Error("Select one of this question's choices.");
    const record = result.responses[questionId];
    const attempt = {id, choice, checked_at: checkedAt};
    if (record.first === null) record.first = attempt;
    else record.later.push(attempt);
    return validateImport(result, config);
  }
  function persistWork(storage, key, work) {
    try {
      if (!storage) throw new Error("Storage unavailable");
      storage.setItem(key, JSON.stringify(work));
      return true;
    } catch (_) {
      return false;
    }
  }
  const api = {SCHEMA, canonical, emptyWork, validateImport, mergeWork, recordCheck, persistWork};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root.document) return;

  function boot() {
    const document = root.document;
    const sidebar = document.querySelector(".course-sidebar details");
    if (sidebar && root.matchMedia && root.matchMedia("(max-width:760px)").matches) sidebar.open = false;
    const embedded = document.getElementById("lesson-data");
    if (!embedded) return;
    const config = JSON.parse(embedded.textContent);
    const key = [SCHEMA, config.course_id, config.course_version, config.page, config.question_version].join(":");
    let work = emptyWork(config);
    let storage = null;
    let loadProblem = false;
    try {
      storage = root.localStorage;
      const saved = storage.getItem(key);
      if (saved !== null) work = validateImport(JSON.parse(saved), config);
    } catch (_) {
      loadProblem = true;
    }
    const storageStatus = document.getElementById("storage-status");
    const importStatus = document.getElementById("import-status");
    function reportStorage(saved) {
      storageStatus.textContent = saved
        ? "Checked attempts are saved in this browser. Export JSON to keep a portable copy."
        : "Unsaved in browser storage: your checked work remains in memory on this open page. Export JSON before closing or changing pages.";
    }
    if (loadProblem) {
      storageStatus.textContent = "Browser storage was unavailable or could not be read. Any existing stored data was left unchanged. New checked work can still be exported from this page.";
    } else {
      storageStatus.textContent = "Checked attempts can be kept in this browser. Export JSON after the lesson: file:// storage varies across browsers.";
    }
    function textElement(tag, text, parent) {
      const element = document.createElement(tag);
      element.textContent = text;
      parent.appendChild(element);
      return element;
    }
    function showFeedback(section, question, attempt) {
      const feedback = section.querySelector("[data-feedback]");
      feedback.replaceChildren();
      textElement("p", attempt.choice === question.answer ? "This choice agrees with the worked reasoning." : "This choice needs revision. Compare the explanation with your reasoning.", feedback);
      textElement("p", question.feedback[attempt.choice], feedback);
      textElement("p", "Derivation: " + question.derivation, feedback);
      feedback.hidden = false;
    }
    function renderHistory(section, question) {
      const record = work.responses[question.id];
      const details = section.querySelector("[data-history]");
      const history = section.querySelector("[data-attempts]");
      history.replaceChildren();
      details.hidden = record.first === null;
      if (!record.first) return;
      const label = attempt => {
        const choice = question.choices.find(item => item.id === attempt.choice);
        return choice.id + ": " + choice.text + " — checked " + attempt.checked_at;
      };
      textElement("p", "First checked attempt: " + label(record.first), history);
      if (record.later.length) {
        textElement("p", "Later checked attempts (the first stays unchanged):", history);
        const list = textElement("ol", "", history);
        record.later.forEach(attempt => textElement("li", label(attempt), list));
      }
      if (record.imported_first.length) {
        textElement("p", "Other first attempts preserved from merged exports (your existing first stays above):", history);
        const list = textElement("ul", "", history);
        record.imported_first.forEach(attempt => textElement("li", label(attempt), list));
      }
    }
    const sections = Array.from(document.querySelectorAll("[data-question]"));
    function restoreDisplay() {
      for (const section of sections) {
        const question = config.questions.find(item => item.id === section.dataset.question);
        const record = work.responses[question.id];
        renderHistory(section, question);
        if (record.first) {
          const last = record.later.length ? record.later[record.later.length - 1] : record.first;
          section.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = input.value === last.choice; });
          showFeedback(section, question, last);
          section.querySelector("[data-status]").textContent = "A previously checked answer was restored. A new Check adds a separate attempt.";
        }
      }
    }
    let counter = 0;
    function attemptId() {
      if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
      counter += 1;
      return Date.now().toString(36) + "-" + counter + "-" + Math.random().toString(36).slice(2);
    }
    for (const section of sections) {
      const question = config.questions.find(item => item.id === section.dataset.question);
      const status = section.querySelector("[data-status]");
      section.querySelector("[data-check]").addEventListener("click", () => {
        const selected = section.querySelector('input[type="radio"]:checked');
        if (!selected) {
          status.textContent = "Choose an answer before checking. Nothing has been saved for this check.";
          section.querySelector('input[type="radio"]').focus();
          return;
        }
        try {
          const wasFirst = work.responses[question.id].first === null;
          work = recordCheck(work, config, question.id, selected.value, attemptId(), new Date().toISOString());
          const record = work.responses[question.id];
          showFeedback(section, question, wasFirst ? record.first : record.later[record.later.length - 1]);
          renderHistory(section, question);
          const saved = persistWork(storage, key, work);
          status.textContent = (wasFirst ? "Your first checked attempt is preserved." : "A later attempt was added; your first attempt is unchanged.") +
            (saved ? "" : " Browser storage failed; export JSON before leaving this page.");
          reportStorage(saved);
        } catch (error) {
          status.textContent = "This check could not be saved: " + error.message;
        }
      });
      section.querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener("change", () => {
        section.querySelector("[data-feedback]").hidden = true;
        status.textContent = "Choice selected. Check to preserve this attempt and reveal its explanation.";
      }));
    }
    restoreDisplay();
    document.getElementById("export-progress").addEventListener("click", () => {
      const exported = {...clone(work), exported_at: new Date().toISOString()};
      const contents = JSON.stringify(exported, null, 2) + "\n";
      const fallback = document.getElementById("export-fallback");
      document.getElementById("export-text").value = contents;
      fallback.hidden = false;
      try {
        const url = root.URL.createObjectURL(new Blob([contents], {type: "application/json"}));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "inside-the-shot-" + config.page.split("/").pop().replace(/\.md$/, "") + "-v" + config.course_version + "-practice.json";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
        importStatus.textContent = "JSON export prepared. Keep the downloaded file; a readable copy is also available below.";
      } catch (_) {
        fallback.open = true;
        importStatus.textContent = "The download could not open. Copy the readable JSON backup below into a private .json file.";
      }
    });
    document.getElementById("import-progress").addEventListener("change", async event => {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const candidate = mergeWork(work, parsed, config);
        // Only assign after parsing, exact identity/wording validation and a complete merge.
        work = candidate;
        const saved = persistWork(storage, key, work);
        restoreDisplay();
        reportStorage(saved);
        importStatus.textContent = "Matching lesson history merged. Existing first attempts and later checks were kept; repeated records were not duplicated." +
          (saved ? "" : " The merged work is in memory; export it before leaving.");
      } catch (error) {
        importStatus.textContent = "Restore rejected: " + error.message + " Current work and browser storage were left unchanged.";
      } finally {
        input.value = "";
      }
    });
  }
  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : globalThis);
