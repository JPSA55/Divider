/* Divider — study engine: material extraction, modality registry, generation. */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 1. Material extraction
   * ------------------------------------------------------------------ */

  var scriptCache = {};
  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { res(true); };
      s.onerror = function () { rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }

  // Vendored, not fetched from a CDN: a page served under a strict content
  // policy cannot start a cross-origin worker, and pdf.js fails outright when
  // it cannot. Served from this site, same-origin, the worker starts normally.
  var PDF_LIB = "vendor/pdf.min.js";
  var PDF_WORKER = "vendor/pdf.worker.min.js";
  var ZIP_LIB = "vendor/jszip.min.js";

  function ext(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function cleanText(t) {
    return String(t || "")
      .replace(/\r\n?/g, "\n")
      .replace(new RegExp(String.fromCharCode(0), "g"), "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }

  function xmlToText(xml, blockTags) {
    var out = xml;
    blockTags.forEach(function (tag) {
      out = out.replace(new RegExp("</" + tag + ">", "g"), "\n");
    });
    out = out.replace(/<[^>]+>/g, "");
    out = out
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&amp;/g, "&");
    return out;
  }

  /** Returns {kind:'text', text} | {kind:'image', blob} | throws with a readable message. */
  async function extractFile(file) {
    var e = ext(file.name);
    var type = file.type || "";

    if (/^image\//.test(type) || ["png", "jpg", "jpeg", "webp", "gif"].indexOf(e) >= 0) {
      return { kind: "image", blob: file };
    }

    if (e === "pdf" || type === "application/pdf") {
      await loadScript(PDF_LIB);
      var pdfjs = global.pdfjsLib;
      if (!pdfjs) throw new Error("The PDF reader could not start. Paste the text instead.");
      try { pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER; } catch (_) {}
      var buf = await file.arrayBuffer();
      var doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
      var parts = [];
      var pages = Math.min(doc.numPages, 400);
      for (var p = 1; p <= pages; p++) {
        var page = await doc.getPage(p);
        var tc = await page.getTextContent();
        var line = "";
        var last = null;
        tc.items.forEach(function (it) {
          if (!it.str) return;
          if (last && it.transform && last.transform && Math.abs(it.transform[5] - last.transform[5]) > 3) {
            parts.push(line); line = "";
          }
          line += (line && !/\s$/.test(line) && !/^\s/.test(it.str) ? " " : "") + it.str;
          last = it;
        });
        if (line) parts.push(line);
        parts.push("");
      }
      var text = cleanText(parts.join("\n"));
      if (text.replace(/\s/g, "").length < 40) {
        throw new Error("This PDF holds scanned pages, not selectable text. Export it as images and upload those, or paste the text.");
      }
      return { kind: "text", text: text, pages: doc.numPages };
    }

    if (e === "docx" || e === "pptx") {
      await loadScript(ZIP_LIB);
      var JSZipL = global.JSZip;
      if (!JSZipL) throw new Error("The Office reader could not start. Paste the text instead.");
      var zip = await JSZipL.loadAsync(await file.arrayBuffer());
      var chunks = [];
      if (e === "docx") {
        var d = zip.file("word/document.xml");
        if (!d) throw new Error("That .docx looks damaged.");
        chunks.push(xmlToText(await d.async("string"), ["w:p", "w:tr"]));
      } else {
        var names = Object.keys(zip.files)
          .filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
          .sort(function (a, b) {
            return (+/(\d+)\.xml$/.exec(a)[1]) - (+/(\d+)\.xml$/.exec(b)[1]);
          });
        for (var i = 0; i < names.length; i++) {
          var s = await zip.file(names[i]).async("string");
          chunks.push("— Slide " + (i + 1) + " —\n" + xmlToText(s, ["a:p"]));
        }
      }
      return { kind: "text", text: cleanText(chunks.join("\n\n")) };
    }

    // plain text family
    var raw = await file.text();
    if (/^\s*[\[{]/.test(raw) && (e === "json")) {
      try { raw = JSON.stringify(JSON.parse(raw), null, 1); } catch (_) {}
    }
    if (/<html[\s>]/i.test(raw)) raw = xmlToText(raw, ["p", "div", "li", "h1", "h2", "h3", "br", "tr"]);
    var out = cleanText(raw);
    if (!out) throw new Error("That file came back empty.");
    return { kind: "text", text: out };
  }

  /* ------------------------------------------------------------------ *
   * 2. Text budgeting
   * ------------------------------------------------------------------ */

  var CHUNK_CHARS = 24000;
  var SINGLE_CHARS = 30000;
  var MAX_CHUNKS = 5;

  function splitChunks(text, size, max) {
    if (text.length <= size) return [text];
    var chunks = [];
    var i = 0;
    while (i < text.length && chunks.length < max) {
      var end = Math.min(i + size, text.length);
      if (end < text.length) {
        var brk = text.lastIndexOf("\n\n", end);
        if (brk > i + size * 0.5) end = brk;
        else {
          var per = text.lastIndexOf(". ", end);
          if (per > i + size * 0.5) end = per + 1;
        }
      }
      chunks.push(text.slice(i, end));
      i = end;
    }
    return chunks;
  }

  /** Even slices across the whole document, so a long text is still represented end to end. */
  function stratify(text, budget) {
    if (text.length <= budget) return text;
    var slices = 6;
    var per = Math.floor(budget / slices);
    var step = Math.floor(text.length / slices);
    var out = [];
    for (var i = 0; i < slices; i++) {
      var start = i * step;
      out.push(text.slice(start, start + per));
    }
    return out.join("\n\n[…]\n\n");
  }

  /* ------------------------------------------------------------------ *
   * 3. Schemas, one per render type
   * ------------------------------------------------------------------ */

  var SCHEMAS = {
    notes: '{"items":[{"heading":"Section title","summary":"1-2 sentences of what this section is about","points":["a compact fact or idea","another"],"terms":[{"term":"word","def":"short definition"}]}]}',
    mcq: '{"items":[{"q":"question","options":["A","B","C","D"],"answer":0,"why":"why the right answer is right and the tempting one is wrong"}]}',
    tf: '{"items":[{"q":"a full statement that is entirely true or entirely false","answer":true,"why":"what makes it so"}]}',
    cloze: '{"items":[{"text":"A sentence with {{1}} and later {{2}} removed.","blanks":[{"answer":"exact word","alt":["accepted variant"]},{"answer":"exact word","alt":[]}],"why":"one line of context"}]}',
    open: '{"items":[{"q":"question","kind":"short","keyPoints":["point a marker looks for","another"],"model":"a model answer a strong student would write"}]}',
    cards: '{"items":[{"front":"prompt — one idea only","back":"the answer, under 30 words","hint":"a nudge, or empty string"}]}',
    match: '{"items":[{"left":"term / person / date","right":"its match — definition, role, event"}]}',
    timeline: '{"items":[{"when":"1517","label":"Short event name","what":"what happened, one sentence","why":"why it matters for the exam"}]}',
    tips: '{"items":[{"target":"the exact thing that is hard to remember","device":"the mnemonic itself — the acronym, sentence, image or story","technique":"acronym | acrostic | story | memory palace | chunking | rhyme | link","how":"how to use it when the question appears"}]}',
    people: '{"items":[{"name":"Person or group","role":"what they were","when":"years or period","did":"what they actually did","why":"why they matter to this topic","linked":["other names or events they connect to"]}]}',
    docs: '{"items":[{"title":"Document, treaty, law or accord","when":"date or year","parties":["who signed or issued it"],"kind":"treaty | constitution | law | manifesto | encyclical | accord","says":["a clause or provision that matters"],"effect":"what changed because of it","why":"the exam angle"}]}',
    glossary: '{"items":[{"term":"term","definition":"a precise definition in the vocabulary of this course","example":"a concrete use, or empty string"}]}',
    cases: '{"items":[{"scenario":"a realistic situation built on the material","ask":"what the student must decide, calculate or argue","steps":["the reasoning step by step"],"answer":"the resolution"}]}',
    feynman: '{"items":[{"concept":"the concept","plain":"explain it to a smart 12-year-old, no jargon","analogy":"an analogy that holds","trap":"the misunderstanding students usually land in","check":"a question you can only answer if you truly get it"}]}',
    table: '{"columns":["Axis of comparison","Thing A","Thing B"],"rows":[{"label":"Axis name","cells":["","value for A","value for B"]}]}',
    map: '{"root":"The central concept","nodes":[{"id":"n1","parent":"","label":"Branch","note":"one line"},{"id":"n2","parent":"n1","label":"Sub-branch","note":""}]}',
    exam: '{"minutes":60,"sections":[{"title":"Part I — Multiple choice","instructions":"Choose the best answer.","items":[{"type":"mcq","q":"","options":["","","",""],"answer":0,"points":2,"why":""},{"type":"tf","q":"","answer":true,"points":1,"why":""},{"type":"short","q":"","keyPoints":[""],"model":"","points":5},{"type":"essay","q":"","keyPoints":[""],"model":"","points":15}]}]}'
  };

  // For "cells" in table rows: cells[0] mirrors label; keep columns[0] as the axis header.

  /* ------------------------------------------------------------------ *
   * 4. Built-in modalities
   * ------------------------------------------------------------------ */

  var MODALITIES = [
    {
      id: "notes", name: "Structured notes", glyph: "§", group: "Understand",
      blurb: "The material rebuilt as sections, key points and defined terms.",
      render: "notes", unit: "sections", count: 8, single: false,
      task: "Rewrite the material as study notes: one entry per real section of the material, in the order the material presents them. Each entry gets a heading, a short summary, the points worth knowing, and any terms the section defines."
    },
    {
      id: "mcq", name: "Multiple choice", glyph: "A·B·C", group: "Drill",
      blurb: "Four options, one right, and an explanation of the trap.",
      render: "mcq", unit: "questions", count: 12,
      task: "Write multiple-choice questions. Exactly four options each, one unambiguously correct. The three wrong options must be plausible to someone who half-learned the material — a common confusion, a near-miss date, a swapped cause and effect — never filler."
    },
    {
      id: "tf", name: "True or false", glyph: "T/F", group: "Drill",
      blurb: "Statements that turn on one precise detail.",
      render: "tf", unit: "statements", count: 14,
      task: "Write true/false statements. Mix them roughly half and half. Each false one must be false for one specific, findable reason — a changed actor, date, quantity or consequence — not because it is vague."
    },
    {
      id: "cloze", name: "Fill in the blanks", glyph: "__", group: "Drill",
      blurb: "Cloze sentences that force recall of the exact term.",
      render: "cloze", unit: "sentences", count: 12,
      task: "Write cloze sentences taken from the substance of the material. Blank out the load-bearing word or number, never an article or connector. One to three blanks per sentence, marked {{1}}, {{2}}, {{3}} in order."
    },
    {
      id: "short", name: "Short answer", glyph: "¶", group: "Write",
      blurb: "Two-to-four sentence questions with a model answer.",
      render: "open", unit: "questions", count: 8, kind: "short",
      task: 'Write short-answer questions answerable in 2-4 sentences. Set "kind" to "short" on every item. Give the key points a marker would look for, and a model answer of that length.'
    },
    {
      id: "essay", name: "Long answer", glyph: "¶¶", group: "Write",
      blurb: "Essay prompts with a marking outline.",
      render: "open", unit: "prompts", count: 4, kind: "long",
      task: 'Write essay prompts that require argument, comparison or causal explanation across the material — not recall. Set "kind" to "long" on every item. Key points are the marking criteria; the model answer is a tight outline-quality response of 150-250 words.'
    },
    {
      id: "cards", name: "Flashcards", glyph: "▭", group: "Memorize",
      blurb: "One idea per card, scheduled by how well you knew it.",
      render: "cards", unit: "cards", count: 20,
      task: "Write flashcards. One single idea per card — split anything compound. Fronts are specific prompts, never 'Explain X' for a large X. Backs stay under 30 words."
    },
    {
      id: "match", name: "Matching", glyph: "⇄", group: "Drill",
      blurb: "Pair terms with definitions, people with roles, dates with events.",
      render: "match", unit: "pairs", count: 10,
      task: "Write matching pairs from the material: term to definition, person to role, date to event, cause to effect. Each right side must fit exactly one left side — no two rights that could both pass for the same left."
    },
    {
      id: "timeline", name: "Timeline", glyph: "⎯", group: "Understand",
      blurb: "Events in order, with what changed and why it matters.",
      render: "timeline", unit: "events", count: 12,
      task: "Build a chronological timeline of what the material covers. Order strictly by date, earliest first. Use the dates the material gives; where it gives a period rather than a year, say the period."
    },
    {
      id: "tips", name: "Memory hooks", glyph: "✳", group: "Memorize",
      blurb: "Mnemonics built for the exact lists and sequences you have to hold.",
      render: "tips", unit: "hooks", count: 8,
      task: "Find the things in this material that are genuinely hard to hold — ordered lists, similar-sounding terms, dates that blur, sequences of steps — and build a memory device for each. Give the actual acronym, sentence, image or story, not advice about making one."
    },
    {
      id: "people", name: "Key figures", glyph: "◉", group: "Understand",
      blurb: "Who they were, what they did, and why the exam asks about them.",
      render: "people", unit: "figures", count: 10,
      task: "Profile the people, groups, schools of thought or institutions that the material treats as significant. For each, what they did and — the part students skip — why they matter to the argument of this topic and who they connect to."
    },
    {
      id: "docs", name: "Documents & treaties", glyph: "❡", group: "Understand",
      blurb: "Texts, laws and accords: parties, provisions, consequences.",
      render: "docs", unit: "documents", count: 8,
      task: "Catalogue the documents the material names — treaties, constitutions, laws, declarations, manifestos, accords, landmark rulings. Who made them, what they actually say, and what changed as a result."
    },
    {
      id: "glossary", name: "Glossary", glyph: "aA", group: "Understand",
      blurb: "Every term the course uses, defined in its own vocabulary.",
      render: "glossary", unit: "terms", count: 20,
      task: "Pull the technical vocabulary out of the material and define each term the way this course uses it. Alphabetical order."
    },
    {
      id: "cases", name: "Applied problems", glyph: "⌘", group: "Write",
      blurb: "Situations where the concept has to be used, not recited.",
      render: "cases", unit: "problems", count: 6,
      task: "Write applied problems: a realistic scenario built from this material, a clear task, the reasoning step by step, and the resolution. Each problem should need a concept from the material that a recall question would miss."
    },
    {
      id: "feynman", name: "Explain it simply", glyph: "◊", group: "Understand",
      blurb: "Each concept in plain words, with the trap students fall into.",
      render: "feynman", unit: "concepts", count: 6,
      task: "Take the concepts that are hardest in this material and explain each in plain language, with an analogy that actually holds, the misunderstanding students usually land in, and a check question."
    },
    {
      id: "compare", name: "Comparison table", glyph: "▦", group: "Understand",
      blurb: "Things that get confused, set side by side on real axes.",
      render: "table", unit: "rows", count: 8, single: true,
      task: 'Find the two to four things in this material that students most confuse with each other and compare them. columns[0] is the axis header (e.g. "Axis"); the remaining columns name the things compared. Each row is one axis of comparison; cells[0] repeats the row label and the rest hold that row\'s values, in column order.'
    },
    {
      id: "map", name: "Concept map", glyph: "⌗", group: "Understand",
      blurb: "The shape of the topic — what hangs off what.",
      render: "map", unit: "nodes", count: 16, single: true,
      task: 'Map the structure of this material. One root concept; top-level branches have parent ""; deeper nodes name their parent id. Go three levels deep where the material supports it. Notes are one line, only where they add something.'
    },
    {
      id: "exam", name: "Mock exam", glyph: "⏱", group: "Drill",
      blurb: "A timed paper in the shape of the real one.",
      render: "exam", unit: "questions", count: 18, single: true, tier: "complex",
      task: "Build a realistic exam paper over this material: a multiple-choice part, a true/false part, a short-answer part, and one essay question. Weight points so the paper totals 100 and set a sensible time in minutes. Cover the breadth of the material, not one corner of it."
    }
  ];

  var RENDER_CHOICES = Object.keys(SCHEMAS);

  var GROUPS = ["Understand", "Drill", "Memorize", "Write", "Yours"];

  /* ------------------------------------------------------------------ *
   * 5. Prompt construction and generation
   * ------------------------------------------------------------------ */

  var DIFFICULTY = {
    recall: "Recall level — the student must retrieve a fact, definition or date stated in the material.",
    applied: "Applied level — the student must use the idea on something the material does not hand them directly.",
    exam: "Exam level — the hardest a fair examiner would set on this material: multi-step, easy to half-answer."
  };

  function buildPrompt(o) {
    var lang = o.language === "source"
      ? "Write in the same language as the material above."
      : "Write everything in " + (o.language || "English") + ".";
    var lines = [];
    lines.push("You are preparing study material for a university student from their own course material.");
    lines.push("");
    lines.push("MATERIAL" + (o.total > 1 ? " (part " + o.part + " of " + o.total + ")" : "") +
      " — from: " + o.titles);
    lines.push('"""');
    lines.push(o.text);
    lines.push('"""');
    lines.push("");
    lines.push("TASK");
    lines.push(o.task);
    if (o.countLine) lines.push(o.countLine);
    lines.push("");
    lines.push("RULES");
    lines.push("- Build only from the material above. Never add a fact, date, name or number that is not in it.");
    lines.push("- If the material cannot support the number asked for, produce fewer strong ones instead of padding.");
    lines.push("- " + (DIFFICULTY[o.difficulty] || DIFFICULTY.applied));
    if (o.focus) lines.push("- Concentrate on: " + o.focus);
    if (o.extra) lines.push("- " + o.extra);
    lines.push("- " + lang);
    lines.push("- No preamble, no meta-commentary, no phrases like \"according to the text\". Write the material itself.");
    lines.push("");
    lines.push("OUTPUT");
    lines.push("Reply with only JSON of exactly this shape:");
    lines.push(o.schema);
    return lines.join("\n");
  }

  /** Read a JSON value out of a reply, the way the platform does. */
  function tolerantJson(text) {
    var t = String(text || "").trim();
    try { return JSON.parse(t); } catch (_) {}
    var fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
    if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
    var starts = [t.indexOf("{"), t.indexOf("[")].filter(function (i) { return i >= 0; });
    if (starts.length) {
      var from = Math.min.apply(null, starts);
      var to = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
      if (to > from) { try { return JSON.parse(t.slice(from, to + 1)); } catch (_) {} }
    }
    return undefined;
  }

  /**
   * Ask for JSON, and survive the two ways that goes wrong: a viewer whose
   * runtime has no json verb, and a reply that came back wrapped in prose.
   * Falls back to a plain call parsed here — once, never in a loop.
   */
  async function askJson(sample, prompt, opts, note) {
    if (typeof sample.json === "function") {
      try {
        return await sample.json(prompt, opts);
      } catch (e) {
        var c = e && e.code;
        if (c !== "capability_removed" && c !== "invalid_json") throw e;
        if (note) note(c === "invalid_json" ? "The reply came back malformed — asking again…" : "Using the plain reader…");
      }
    }
    var out = await sample(prompt, opts);
    var v = tolerantJson(out && out.text);
    if (v === undefined) {
      throw { code: "invalid_json", message: "The reply held no usable JSON.", text: (out && out.text) || "" };
    }
    return v;
  }

  /** UTF-8 length — the prompt cap is measured in bytes, not characters. */
  function byteLength(s) {
    try { return new TextEncoder().encode(s).length; } catch (_) { return s.length * 2; }
  }

  var PROMPT_BYTE_CAP = 60000;   // the platform allows 64 KiB; leave headroom

  /** Shrink the material until the whole prompt fits the byte cap. */
  function fitPrompt(build, text) {
    var body = text;
    var prompt = build(body);
    var guard = 0;
    while (byteLength(prompt) > PROMPT_BYTE_CAP && body.length > 2000 && guard++ < 12) {
      body = body.slice(0, Math.floor(body.length * 0.8));
      prompt = build(body);
    }
    return prompt;
  }

  function emptyPayload(render) {
    if (render === "table") return { columns: [], rows: [] };
    if (render === "map") return { root: "", nodes: [] };
    if (render === "exam") return { minutes: 60, sections: [] };
    return { items: [] };
  }

  function mergePayload(render, a, b) {
    if (!a) return b;
    if (render === "table") {
      return { columns: (a.columns && a.columns.length ? a.columns : b.columns) || [], rows: (a.rows || []).concat(b.rows || []) };
    }
    if (render === "map") {
      var prefix = "c" + ((a.nodes || []).length) + "_";
      var shifted = (b.nodes || []).map(function (n) {
        return {
          id: prefix + n.id,
          parent: n.parent ? prefix + n.parent : "",
          label: n.label, note: n.note
        };
      });
      return { root: a.root || b.root, nodes: (a.nodes || []).concat(shifted) };
    }
    if (render === "exam") {
      return { minutes: a.minutes || b.minutes, sections: (a.sections || []).concat(b.sections || []) };
    }
    return { items: (a.items || []).concat(b.items || []) };
  }

  function countOf(render, payload) {
    if (!payload) return 0;
    if (render === "table") return (payload.rows || []).length;
    if (render === "map") return (payload.nodes || []).length;
    if (render === "exam") {
      return (payload.sections || []).reduce(function (n, s) { return n + ((s.items || []).length); }, 0);
    }
    return (payload.items || []).length;
  }

  /**
   * Generate one study set.
   * opts: {modality, material:{text,titles}, count, difficulty, focus, language, sample, onStep, signal}
   */
  async function generate(opts) {
    var m = opts.modality;
    var render = m.render;
    var schema = SCHEMAS[render];
    if (!schema) throw new Error("That format has no shape to fill.");

    var text = opts.material.text;
    var chunks = m.single
      ? [stratify(text, SINGLE_CHARS)]
      : splitChunks(text, CHUNK_CHARS, MAX_CHUNKS);

    var target = Math.max(1, opts.count || m.count || 10);
    var per = Math.max(2, Math.ceil(target / chunks.length));
    var payload = null;

    for (var i = 0; i < chunks.length; i++) {
      if (opts.signal && opts.signal.aborted) throw { code: "cancelled", message: "stopped" };
      if (opts.onStep) opts.onStep(i + 1, chunks.length);
      var countLine = m.single && render === "exam"
        ? "Aim for about " + target + " questions across the paper."
        : m.single
          ? "Aim for about " + target + " " + (m.unit || "items") + "."
          : "Produce about " + per + " " + (m.unit || "items") + " from this part.";
      var prompt = fitPrompt(function (body) {
        return buildPrompt({
          text: body,
          titles: opts.material.titles,
          part: i + 1, total: chunks.length,
          task: m.task,
          countLine: countLine,
          difficulty: opts.difficulty,
          focus: opts.focus,
          language: opts.language,
          extra: m.extra,
          schema: schema
        });
      }, chunks[i]);

      var got = await askJson(opts.sample, prompt, {
        modelTier: m.tier || "default",
        cache: false,
        signal: opts.signal
      }, opts.onNote);
      payload = mergePayload(render, payload, normalize(render, got));
    }

    payload = postprocess(render, payload, target);
    if (!countOf(render, payload)) {
      throw new Error("Nothing usable came back. Try a different format, or add more material.");
    }
    return payload;
  }

  /** Defensive shaping — the model is asked for a shape, but the page must survive any reply. */
  function normalize(render, raw) {
    var out = emptyPayload(render);
    if (!raw || typeof raw !== "object") return out;
    if (render === "table") {
      out.columns = Array.isArray(raw.columns) ? raw.columns.map(String) : [];
      out.rows = (Array.isArray(raw.rows) ? raw.rows : []).map(function (r) {
        return { label: String(r && r.label || ""), cells: Array.isArray(r && r.cells) ? r.cells.map(function (c) { return c == null ? "" : String(c); }) : [] };
      }).filter(function (r) { return r.label || r.cells.length; });
      return out;
    }
    if (render === "map") {
      out.root = String(raw.root || "");
      out.nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).map(function (n, i) {
        return {
          id: String(n && n.id || "n" + i),
          parent: String(n && n.parent || ""),
          label: String(n && n.label || ""),
          note: String(n && n.note || "")
        };
      }).filter(function (n) { return n.label; });
      return out;
    }
    if (render === "exam") {
      out.minutes = Number(raw.minutes) > 0 ? Math.round(Number(raw.minutes)) : 60;
      out.sections = (Array.isArray(raw.sections) ? raw.sections : []).map(function (s) {
        return {
          title: String(s && s.title || "Section"),
          instructions: String(s && s.instructions || ""),
          items: (Array.isArray(s && s.items) ? s.items : []).map(function (it) {
            return normalizeExamItem(it);
          }).filter(Boolean)
        };
      }).filter(function (s) { return s.items.length; });
      return out;
    }
    var items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : []);
    out.items = items.map(function (it) { return normalizeItem(render, it); }).filter(Boolean);
    return out;
  }

  function s(v) { return v == null ? "" : String(v); }
  function arr(v) {
    if (Array.isArray(v)) return v.map(s).filter(function (x) { return x.trim(); });
    if (v == null || v === "") return [];
    return [s(v)];
  }

  function normalizeExamItem(it) {
    if (!it || typeof it !== "object") return null;
    var type = s(it.type).toLowerCase();
    if (["mcq", "tf", "short", "essay"].indexOf(type) < 0) type = it.options ? "mcq" : (typeof it.answer === "boolean" ? "tf" : "short");
    var base = { type: type, q: s(it.q || it.question), points: Number(it.points) > 0 ? Number(it.points) : (type === "essay" ? 15 : type === "short" ? 5 : 2), why: s(it.why) };
    if (!base.q) return null;
    if (type === "mcq") {
      base.options = arr(it.options);
      if (base.options.length < 2) return null;
      base.answer = Math.max(0, Math.min(base.options.length - 1, Number(it.answer) || 0));
    } else if (type === "tf") {
      base.answer = it.answer === true || s(it.answer).toLowerCase() === "true";
    } else {
      base.keyPoints = arr(it.keyPoints || it.key_points);
      base.model = s(it.model || it.modelAnswer);
    }
    return base;
  }

  function normalizeItem(render, it) {
    if (!it || typeof it !== "object") return null;
    switch (render) {
      case "notes": {
        var n = {
          heading: s(it.heading || it.title), summary: s(it.summary),
          points: arr(it.points), terms: (Array.isArray(it.terms) ? it.terms : []).map(function (t) {
            return { term: s(t && t.term), def: s(t && t.def || t && t.definition) };
          }).filter(function (t) { return t.term; })
        };
        return (n.heading || n.points.length) ? n : null;
      }
      case "mcq": {
        var o = arr(it.options);
        if (!s(it.q) || o.length < 2) return null;
        var ans = Number(it.answer);
        if (!isFinite(ans) || ans < 0 || ans >= o.length) {
          var byText = o.indexOf(s(it.answer));
          ans = byText >= 0 ? byText : 0;
        }
        return { q: s(it.q), options: o, answer: Math.round(ans), why: s(it.why) };
      }
      case "tf": {
        if (!s(it.q)) return null;
        return { q: s(it.q), answer: it.answer === true || s(it.answer).toLowerCase() === "true", why: s(it.why) };
      }
      case "cloze": {
        var text = s(it.text);
        if (!text) return null;
        var blanks = (Array.isArray(it.blanks) ? it.blanks : []).map(function (b) {
          return { answer: s(b && b.answer), alt: arr(b && b.alt) };
        }).filter(function (b) { return b.answer; });
        var marks = (text.match(/\{\{\d+\}\}/g) || []).length;
        if (!marks || !blanks.length) return null;
        if (blanks.length > marks) blanks = blanks.slice(0, marks);
        while (blanks.length < marks) blanks.push({ answer: "", alt: [] });
        return { text: text, blanks: blanks, why: s(it.why) };
      }
      case "open": {
        if (!s(it.q)) return null;
        return { q: s(it.q), kind: s(it.kind) === "long" ? "long" : "short", keyPoints: arr(it.keyPoints || it.key_points), model: s(it.model || it.modelAnswer) };
      }
      case "cards": {
        if (!s(it.front) || !s(it.back)) return null;
        return { front: s(it.front), back: s(it.back), hint: s(it.hint) };
      }
      case "match": {
        if (!s(it.left) || !s(it.right)) return null;
        return { left: s(it.left), right: s(it.right) };
      }
      case "timeline": {
        if (!s(it.label) && !s(it.what)) return null;
        return { when: s(it.when || it.date), label: s(it.label), what: s(it.what), why: s(it.why) };
      }
      case "tips": {
        if (!s(it.device) && !s(it.target)) return null;
        return { target: s(it.target), device: s(it.device), technique: s(it.technique), how: s(it.how) };
      }
      case "people": {
        if (!s(it.name)) return null;
        return { name: s(it.name), role: s(it.role), when: s(it.when), did: s(it.did), why: s(it.why), linked: arr(it.linked) };
      }
      case "docs": {
        if (!s(it.title)) return null;
        return { title: s(it.title), when: s(it.when), parties: arr(it.parties), kind: s(it.kind), says: arr(it.says), effect: s(it.effect), why: s(it.why) };
      }
      case "glossary": {
        if (!s(it.term)) return null;
        return { term: s(it.term), definition: s(it.definition), example: s(it.example) };
      }
      case "cases": {
        if (!s(it.scenario) && !s(it.ask)) return null;
        return { scenario: s(it.scenario), ask: s(it.ask), steps: arr(it.steps), answer: s(it.answer) };
      }
      case "feynman": {
        if (!s(it.concept)) return null;
        return { concept: s(it.concept), plain: s(it.plain), analogy: s(it.analogy), trap: s(it.trap), check: s(it.check) };
      }
      default: {
        // a custom modality landed on an unknown render — keep it readable
        return { heading: s(it.heading || it.title || it.term || it.name), summary: s(it.summary || it.definition || it.what), points: arr(it.points), terms: [] };
      }
    }
  }

  function postprocess(render, p, target) {
    if (render === "timeline") {
      p.items.sort(function (a, b) { return yearOf(a.when) - yearOf(b.when); });
    }
    if (render === "glossary") {
      p.items.sort(function (a, b) { return a.term.localeCompare(b.term); });
    }
    if (render === "map") {
      var ids = {};
      p.nodes.forEach(function (n) { ids[n.id] = true; });
      p.nodes.forEach(function (n) { if (n.parent && !ids[n.parent]) n.parent = ""; });
    }
    if (render === "table") {
      var w = p.columns.length;
      p.rows.forEach(function (r) {
        if (!r.cells.length) r.cells = [r.label];
        if (r.cells[0] !== r.label) r.cells.unshift(r.label);
        while (r.cells.length < w) r.cells.push("—");
        r.cells.length = Math.max(w, r.cells.length);
      });
    }
    // de-duplicate list formats on their identifying field
    var key = { mcq: "q", tf: "q", cloze: "text", open: "q", cards: "front", match: "left", people: "name", docs: "title", glossary: "term", feynman: "concept" }[render];
    if (key && p.items) {
      var seen = {};
      p.items = p.items.filter(function (it) {
        var k = String(it[key]).toLowerCase().replace(/\W+/g, " ").trim();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });
    }
    if (p.items && target && p.items.length > target * 1.8) p.items.length = Math.round(target * 1.8);
    return p;
  }

  function yearOf(when) {
    var t = String(when || "");
    var bc = /\b(a\.?\s?c\.?|bce?|b\.c\.)\b/i.test(t);
    var m = /(\d{1,4})/.exec(t);
    var y = m ? parseInt(m[1], 10) : 99999;
    return bc ? -y : y;
  }

  /* ------------------------------------------------------------------ *
   * 6. Custom modalities
   * ------------------------------------------------------------------ */

  async function designModality(sample, name, wish, language) {
    var prompt = [
      "A student is inventing their own study format for their course material. Turn their description into a reusable format definition.",
      "",
      "THEY CALL IT: " + name,
      "THEY DESCRIBED IT AS: " + wish,
      "",
      "Pick the closest structure from this list of structures the app can display:",
      RENDER_CHOICES.map(function (r) { return "- " + r + ": " + renderDescription(r); }).join("\n"),
      "",
      'Then write "task" — the instruction that will be given each time this format is generated from a student\'s material. Write it as a direct instruction, 2-4 sentences, specific about what goes in each field of the chosen structure, and faithful to what they described.',
      "",
      "Reply with only JSON:",
      '{"name":"a short name for the format","blurb":"one line, under 90 characters, describing what it produces","glyph":"1-3 characters or a single symbol used as its mark","render":"one id from the list","unit":"what one item is called, plural","count":10,"task":"the generation instruction"}',
      "",
      "Write the name, blurb and task in " + (language || "English") + "."
    ].join("\n");
    var d = await sample.json(prompt, { modelTier: "default", cache: false });
    var render = RENDER_CHOICES.indexOf(s(d && d.render)) >= 0 ? d.render : "notes";
    return {
      name: s(d && d.name) || name,
      blurb: s(d && d.blurb) || wish.slice(0, 90),
      glyph: (s(d && d.glyph) || "★").slice(0, 3),
      render: render,
      unit: s(d && d.unit) || "items",
      count: Number(d && d.count) > 0 ? Math.min(40, Math.round(Number(d.count))) : 10,
      task: s(d && d.task) || wish,
      single: ["table", "map", "exam"].indexOf(render) >= 0
    };
  }

  function renderDescription(r) {
    return {
      notes: "sections with a heading, summary, bullet points and defined terms",
      mcq: "questions with four options and one correct answer",
      tf: "true/false statements",
      cloze: "sentences with words blanked out to type back",
      open: "written-answer questions with key points and a model answer",
      cards: "two-sided flashcards, front and back",
      match: "left/right pairs to connect",
      timeline: "dated events in chronological order",
      tips: "memory devices for specific hard-to-hold content",
      people: "profiles of people or groups: role, period, what they did, why they matter",
      docs: "documents, treaties or laws: parties, provisions, effects",
      glossary: "terms with definitions and examples",
      cases: "applied scenarios with a task, reasoning steps and a resolution",
      feynman: "concepts explained plainly, with an analogy, the usual trap, and a check question",
      table: "a comparison table of two or more things across rows of axes",
      map: "a hierarchical concept map of a root concept and its branches",
      exam: "a full timed exam paper with mixed question types and points"
    }[r] || r;
  }

  /* ------------------------------------------------------------------ *
   * 7. Grading helpers
   * ------------------------------------------------------------------ */

  // Built from char codes rather than written as literal characters, so the
  // file stays pure ASCII and cannot be broken by a server that serves it
  // under the wrong encoding.
  var COMBINING_MARKS = new RegExp(
    "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

  function normAnswer(t) {
    // NFD splits an accented letter into letter + mark; dropping the marks
    // makes "atmosferico" match "atmosférico" without listing every accent.
    return String(t || "").toLowerCase()
      .normalize("NFD").replace(COMBINING_MARKS, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function blankCorrect(typed, blank) {
    var t = normAnswer(typed);
    if (!t) return false;
    var candidates = [blank.answer].concat(blank.alt || []);
    for (var i = 0; i < candidates.length; i++) {
      var c = normAnswer(candidates[i]);
      if (!c) continue;
      if (t === c) return true;
      if (c.length > 5 && (t === c.replace(/(es|s)$/, "") || c === t.replace(/(es|s)$/, ""))) return true;
    }
    return false;
  }

  async function gradeOpen(sample, item, answer, language) {
    var prompt = [
      "Mark a student's answer. Be a fair, specific marker: say what they got, what is missing, and what would raise the mark.",
      "",
      "QUESTION: " + item.q,
      "",
      "WHAT A FULL ANSWER COVERS:",
      (item.keyPoints || []).map(function (k, i) { return (i + 1) + ". " + k; }).join("\n") || "(use the model answer below)",
      "",
      "MODEL ANSWER: " + (item.model || "(none given)"),
      "",
      "THE STUDENT WROTE:",
      '"""',
      answer,
      '"""',
      "",
      "Judge only against the question and the points above. Do not penalise phrasing or length if the substance is there.",
      "Reply with only JSON:",
      '{"score":0,"hit":["a point they made"],"missed":["a point they did not make"],"feedback":"two or three sentences, addressed to them, concrete"}',
      "score is 0-100. Write in " + (language || "English") + "."
    ].join("\n");
    var r = await sample.json(prompt, { modelTier: "default", cache: false });
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(r && r.score) || 0))),
      hit: arr(r && r.hit), missed: arr(r && r.missed), feedback: s(r && r.feedback)
    };
  }

  /* ------------------------------------------------------------------ *
   * 8. Spaced repetition (SM-2, trimmed)
   * ------------------------------------------------------------------ */

  var DAY = 86400000;
  function schedule(state, grade) {
    // grade: 0 again, 1 hard, 2 good, 3 easy
    var st = state || { ease: 2.5, interval: 0, reps: 0, lapses: 0 };
    var ease = st.ease || 2.5;
    var interval = st.interval || 0;
    var reps = st.reps || 0;
    var lapses = st.lapses || 0;
    if (grade === 0) {
      reps = 0; lapses += 1; interval = 0; ease = Math.max(1.3, ease - 0.2);
    } else {
      ease = Math.max(1.3, Math.min(2.8, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.1 : 0)));
      reps += 1;
      if (reps === 1) interval = grade === 1 ? 1 : 2;
      else if (reps === 2) interval = grade === 1 ? 3 : 6;
      else interval = Math.round(interval * ease * (grade === 1 ? 0.7 : grade === 3 ? 1.25 : 1));
      interval = Math.max(1, Math.min(365, interval));
    }
    return {
      ease: Math.round(ease * 100) / 100,
      interval: interval,
      reps: reps,
      lapses: lapses,
      due: Date.now() + (grade === 0 ? 6 * 60000 : interval * DAY),
      seen: Date.now()
    };
  }

  global.SS = {
    extractFile: extractFile,
    cleanText: cleanText,
    splitChunks: splitChunks,
    stratify: stratify,
    MODALITIES: MODALITIES,
    GROUPS: GROUPS,
    SCHEMAS: SCHEMAS,
    RENDER_CHOICES: RENDER_CHOICES,
    renderDescription: renderDescription,
    generate: generate,
    tolerantJson: tolerantJson,
    byteLength: byteLength,
    designModality: designModality,
    countOf: countOf,
    normAnswer: normAnswer,
    blankCorrect: blankCorrect,
    gradeOpen: gradeOpen,
    schedule: schedule,
    DAY: DAY
  };
})(window);
