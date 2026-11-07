// Wiki-link rules, and the guarantee that the main process and the renderer agree on them.
//
// The two parsers are separate files on purpose (one CommonJS for Electron, one ESM for the
// bundle). This test runs both over the same corpus, so the duplication cannot drift silently.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { inlineTokens, linkKey, wikilinkTargets, stripLinkMarkup } from "../src/renderer/markdown-blocks.js";
import { markdownToDoc, docToMarkdown } from "../src/renderer/rich-markdown.js";

const main = createRequire(import.meta.url)("../src/main/wikilinks.cjs");

const CORPUS = [
  "",
  "no links here at all",
  "one [[Shot list]] link",
  "two [[A]] and [[B]] links",
  "same [[Note]] twice [[note]] in one line",
  "aliased [[Target|what you read]] link",
  "padded [[  Spaced   Out  ]] target",
  "- bullet with [[Deep]] inside",
  "not a link [not this](http://x.y) or [brackets]",
  "empty [[]] is not a link",
  "nested [[a[b]]] is not a link",
  "punctuation after [[Note]], then more",
];

// 1. Both parsers see the same targets, keys and context.
for (const text of CORPUS) {
  assert.deepEqual(wikilinkTargets(text), main.wikilinkTargets(text), `targets differ for ${JSON.stringify(text)}`);
  assert.equal(stripLinkMarkup(text), main.stripLinkMarkup(text), `stripped text differs for ${JSON.stringify(text)}`);
  for (const target of wikilinkTargets(text)) {
    assert.equal(linkKey(target), main.linkKey(target), `key differs for ${target}`);
    assert.equal(main.linkContext(text, target), stripLinkMarkup(text).trim().slice(0, 240), `context differs for ${target}`);
  }
}

// 2. Targets and aliases.
assert.deepEqual(wikilinkTargets("a [[One]] b [[one]] c [[Two|alias]]"), ["One", "Two"], "targets de-duplicate case-insensitively");
assert.equal(linkKey("  My   Note "), "my note", "keys collapse whitespace and case");
assert.equal(stripLinkMarkup("see [[Target|what you read]]"), "see what you read", "an alias replaces the whole link");
assert.equal(stripLinkMarkup("see [[Plain]]"), "see Plain", "a plain link drops its brackets");

// 3. Things that must NOT be links.
assert.deepEqual(wikilinkTargets("empty [[]] here"), [], "an empty target is not a link");
assert.deepEqual(wikilinkTargets("[a](http://x.y)"), [], "a Markdown link is not a wiki-link");

// 4. Tokenising keeps the display text and the target apart, and leaves other syntax alone.
const tokens = inlineTokens("go [[Target|read me]] and **bold** and [x](http://a.b)");
const wiki = tokens.find((token) => token.type === "wikilink");
assert.equal(wiki.text, "read me", "the alias is what renders");
assert.equal(wiki.target, "Target", "the target is what resolves");
assert.equal(wiki.raw, "[[Target|read me]]", "raw keeps the brackets for the editor");
assert.ok(tokens.some((token) => token.type === "strong"), "bold still parses alongside a wiki-link");
assert.ok(tokens.some((token) => token.type === "link" && token.href === "http://a.b"), "Markdown links still parse");

// 5. The editor round trip is lossless: Markdown -> TipTap -> Markdown.
for (const text of ["Link to [[My Note]] and [[A|B]].", "- item [[Deep]]", "# Heading with [[Link]]", "> quote [[Q]]"]) {
  assert.equal(docToMarkdown(markdownToDoc(text)).trim(), text.trim(), `round trip changed ${JSON.stringify(text)}`);
}

console.log("wiki-links: parsers agree, aliases resolve, round trip is lossless");
