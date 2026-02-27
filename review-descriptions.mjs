#!/usr/bin/env node
import fs from "fs";
import readline from "readline";

const md = fs.readFileSync("description-review.md", "utf8");

// Parse items from the markdown
const items = [];
let currentFile = null;
for (const line of md.split("\n")) {
  const fileMatch = line.match(/^## `(.+)`/);
  if (fileMatch) {
    currentFile = fileMatch[1];
    continue;
  }
  const itemMatch = line.match(
    /^- \[[ x]\] `(.+?)` (?:\((\w+)\) )?— (.+)$/
  );
  if (itemMatch && currentFile) {
    items.push({
      file: currentFile,
      name: itemMatch[1],
      kind: itemMatch[2] || null,
      description: itemMatch[3],
    });
  }
}

console.log(`Found ${items.length} items to review.\n`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q) => new Promise((r) => rl.question(q, r));

// Prompt with prefilled text the user can edit
function askPrefilled(prompt, prefill) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
    rl.write(prefill);
  });
}

function findComment(source, item) {
  const lines = source.split("\n");

  if (item.kind) {
    const declRe = new RegExp(
      `^export\\s+(?:interface|type)\\s+${escapeRe(item.name)}[\\s<({=]`
    );
    for (let i = 0; i < lines.length; i++) {
      if (declRe.test(lines[i].trim())) {
        return findCommentBlockAbove(lines, i);
      }
    }
  } else {
    let propName = item.name;
    if (propName.includes(".")) propName = propName.split(".").pop();
    const bracketMatch = propName.match(/\['(.+)'\]/);
    if (bracketMatch) propName = bracketMatch[1];

    const propRe = new RegExp(
      `^\\s*(?:readonly\\s+)?(?:'${escapeRe(propName)}'|${escapeRe(propName)})\\??\\s*:`
    );
    for (let i = 0; i < lines.length; i++) {
      if (propRe.test(lines[i])) {
        return findCommentBlockAbove(lines, i);
      }
    }
  }
  return null;
}

function findCommentBlockAbove(lines, declLine) {
  let end = declLine - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  if (end < 0 || !lines[end].trim().endsWith("*/")) return null;
  let start = end;
  while (start >= 0 && !lines[start].trim().startsWith("/**")) start--;
  if (start < 0) return null;
  return { start, end, declLine };
}

function extractCommentText(source, loc) {
  const lines = source.split("\n").slice(loc.start, loc.end + 1);
  return lines
    .map((l) => l.trim())
    .map((l) => l.replace(/^\/\*\*\s?/, "").replace(/\s?\*\/$/, "").replace(/^\*\s?/, ""))
    .filter((l) => l !== "")
    .join("\n");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

const OUTPUT_FILE = "description-decisions.md";

// Collect decisions, grouped by file
const decisions = [];
let accepted = 0;
let edited = 0;
let declined = 0;
let skipped = 0;

for (let idx = 0; idx < items.length; idx++) {
  const item = items[idx];
  const progress = `${DIM}[${idx + 1}/${items.length}]${RESET}`;

  console.log(`\n${"─".repeat(70)}`);
  console.log(
    `${progress} ${CYAN}${BOLD}${item.file}${RESET} → ${BOLD}${item.name}${RESET}${item.kind ? ` ${DIM}(${item.kind})${RESET}` : ""}`
  );

  if (!fs.existsSync(item.file)) {
    console.log(`${RED}  File not found, skipping.${RESET}`);
    skipped++;
    continue;
  }

  const source = fs.readFileSync(item.file, "utf8");
  const loc = findComment(source, item);

  if (!loc) {
    console.log(`${YELLOW}  No TSDoc comment found in source, skipping.${RESET}`);
    skipped++;
    continue;
  }

  const commentText = extractCommentText(source, loc);
  console.log(`\n${MAGENTA}  Current comment:${RESET}`);
  for (const line of commentText.split("\n")) {
    console.log(`  ${DIM}│${RESET} ${line}`);
  }

  console.log(
    `\n  ${GREEN}[a]${RESET}ccept  ${YELLOW}[e]${RESET}dit  ${RED}[d]${RESET}ecline  ${DIM}[s]kip  [q]uit${RESET}`
  );

  const answer = (await ask("  > ")).trim().toLowerCase();

  if (answer === "q") {
    console.log("\nQuitting. Saving decisions so far...");
    break;
  }

  if (answer === "a") {
    accepted++;
    decisions.push({ ...item, action: "accept" });
    console.log(`  ${GREEN}✓ Accepted${RESET}`);
  } else if (answer === "e") {
    console.log(`  ${DIM}Edit each line (enter to keep, clear line to delete it, empty line at end to finish):${RESET}`);
    const oldLines = commentText.split("\n");
    const newLines = [];
    // Prefill existing lines for editing
    for (const oldLine of oldLines) {
      const line = await askPrefilled("  │ ", oldLine);
      if (line !== "") newLines.push(line);
    }
    // Allow adding extra lines
    while (true) {
      const line = await ask("  │ ");
      if (line === "") break;
      newLines.push(line);
    }
    if (newLines.length > 0) {
      edited++;
      decisions.push({ ...item, action: "edit", newText: newLines.join("\n") });
      console.log(`  ${YELLOW}✎ Recorded${RESET}`);
    } else {
      console.log(`  ${DIM}Empty input, skipping.${RESET}`);
      skipped++;
    }
  } else if (answer === "d") {
    declined++;
    decisions.push({ ...item, action: "decline" });
    console.log(`  ${RED}✗ Marked for removal${RESET}`);
  } else {
    skipped++;
  }
}

// Write output markdown
let out = `# Description Review Decisions\n\n`;
out += `> Generated by review-descriptions.mjs — feed this file to Claude Code to apply.\n\n`;

let lastFile = null;
for (const d of decisions) {
  if (d.file !== lastFile) {
    out += `## \`${d.file}\`\n\n`;
    lastFile = d.file;
  }

  const label = d.kind ? `\`${d.name}\` (${d.kind})` : `\`${d.name}\``;

  if (d.action === "accept") {
    out += `- **ACCEPT** ${label}\n`;
  } else if (d.action === "decline") {
    out += `- **REMOVE** ${label} — delete the TSDoc comment\n`;
  } else if (d.action === "edit") {
    out += `- **EDIT** ${label} — replace TSDoc comment with:\n`;
    for (const line of d.newText.split("\n")) {
      out += `  > ${line}\n`;
    }
  }
  out += `\n`;
}

fs.writeFileSync(OUTPUT_FILE, out);

console.log(`\n${"─".repeat(70)}`);
console.log(
  `Done! ${GREEN}${accepted} accepted${RESET}, ${YELLOW}${edited} edited${RESET}, ${RED}${declined} declined${RESET}, ${DIM}${skipped} skipped${RESET}`
);
console.log(`\nDecisions written to ${BOLD}${OUTPUT_FILE}${RESET}`);
console.log(`Feed it to Claude Code to apply the changes.`);

rl.close();
