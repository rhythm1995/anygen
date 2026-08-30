#!/usr/bin/env node
// 从 jimeng SSR HTML 提取 window._SSR_DATA / _ROUTER_DATA（括号配平法）
import fs from "node:fs";

const htmlPath = process.argv[2];
const html = fs.readFileSync(htmlPath, "utf8");

function extract(name) {
  const marker = "window." + name + " =";
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf("{", i);
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"' || c === "'") inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return html.slice(start, j + 1);
      }
    }
  }
  return null;
}

for (const name of ["_SSR_DATA", "_ROUTER_DATA"]) {
  const raw = extract(name);
  if (!raw) {
    console.log(name, "NOT FOUND");
    continue;
  }
  try {
    const data = JSON.parse(raw);
    const out = htmlPath.replace(/\.html$/, "") + "-" + name.replace(/^_/, "").toLowerCase() + ".json";
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
    console.log(name, "OK size", raw.length, "->", out);
    console.log("  top keys:", Object.keys(data).join(", "));
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (v && typeof v === "object") console.log("   ", k, "=>", Object.keys(v).slice(0, 12).join(", "));
    }
  } catch (e) {
    console.log(name, "parse fail:", e.message, "raw len", raw.length);
  }
}
