import React from "react";
import { inlineTokens, markdownBlocks } from "./markdown-blocks.js";

// Wiki-link behaviour travels by context so every nested Inline gets it without prop drilling.
// The default renders links as plain text, which is what previews and exports want.
const LinkContext = React.createContext({ onOpenLink: null, linkExists: null });

// Renders Markdown as React elements. Nothing from a note is ever injected as HTML.
function Inline({ text, keyPrefix }) {
  const { onOpenLink, linkExists } = React.useContext(LinkContext);
  return <>{inlineTokens(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === "wikilink") {
      if (!onOpenLink) return <React.Fragment key={key}>{token.text}</React.Fragment>;
      const missing = linkExists ? !linkExists(token.target) : false;
      return <button
        type="button"
        key={key}
        className={`wikilink${missing ? " is-new" : ""}`}
        title={missing ? `Create "${token.target}"` : `Open "${token.target}"`}
        onClick={() => onOpenLink(token.target)}
      >{token.text}</button>;
    }
    if (token.type === "strong") return <strong key={key}>{token.text}</strong>;
    if (token.type === "emphasis") return <em key={key}>{token.text}</em>;
    if (token.type === "code") return <code key={key}>{token.text}</code>;
    if (token.type === "strike") return <s key={key}>{token.text}</s>;
    if (token.type === "link") return <span className="md-link" key={key} title={token.href}>{token.text}</span>;
    return <React.Fragment key={key}>{token.text}</React.Fragment>;
  })}</>;
}

export function Markdown({ source, onToggleTask, onOpenLink, linkExists }) {
  const links = React.useMemo(() => ({ onOpenLink, linkExists }), [onOpenLink, linkExists]);
  const blocks = markdownBlocks(source);
  if (!blocks.length) return null;
  return <LinkContext.Provider value={links}>{blocks.map((block, index) => {
    const key = `b-${index}`;
    if (block.type === "heading") {
      const Tag = `h${block.level}`;
      return <Tag key={key}><Inline text={block.text} keyPrefix={key} /></Tag>;
    }
    if (block.type === "rule") return <hr key={key} />;
    if (block.type === "table") return <div className="md-table" key={key}><table>
      <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex} style={{ textAlign: block.align[cellIndex] }}><Inline text={cell} keyPrefix={`${key}-h${cellIndex}`} /></th>)}</tr></thead>
      <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} style={{ textAlign: block.align[cellIndex] }}><Inline text={cell} keyPrefix={`${key}-${rowIndex}-${cellIndex}`} /></td>)}</tr>)}</tbody>
    </table></div>;
    if (block.type === "code") return <pre key={key}><code>{block.lines.join("\n")}</code></pre>;
    if (block.type === "quote") return <blockquote key={key}>{block.lines.map((line, lineIndex) => <p key={lineIndex}><Inline text={line} keyPrefix={`${key}-${lineIndex}`} /></p>)}</blockquote>;
    if (block.type === "bullets") return <ul key={key}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline text={item} keyPrefix={`${key}-${itemIndex}`} /></li>)}</ul>;
    if (block.type === "ordered") return <ol key={key} start={block.start}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline text={item} keyPrefix={`${key}-${itemIndex}`} /></li>)}</ol>;
    if (block.type === "tasks") return <ul className="md-tasks" key={key}>{block.items.map((item) => <li key={item.lineIndex}>
      <label className={item.checked ? "is-done" : ""}>
        <input type="checkbox" checked={item.checked} onChange={(event) => onToggleTask?.(item.lineIndex, event.target.checked)} aria-label={item.text} />
        <span><Inline text={item.text} keyPrefix={`${key}-${item.lineIndex}`} /></span>
      </label>
    </li>)}</ul>;
    return <p key={key}>{block.lines.map((line, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}<Inline text={line} keyPrefix={`${key}-${lineIndex}`} /></React.Fragment>)}</p>;
  })}</LinkContext.Provider>;
}
