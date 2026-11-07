import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Quote, Link2 } from "lucide-react";
import { markdownToDoc, docToMarkdown, looksLikeMarkdown } from "./rich-markdown.js";

const TOOLBAR = [
  [["bold", "Bold", "Ctrl+B", Bold], ["italic", "Italic", "Ctrl+I", Italic], ["strike", "Strikethrough", "", Strikethrough], ["code", "Inline code", "", Code]],
  [["h1", "Heading 1", "", Heading1], ["h2", "Heading 2", "", Heading2], ["h3", "Heading 3", "", Heading3]],
  [["bullet", "Bulleted list", "", List], ["number", "Numbered list", "", ListOrdered], ["todo", "Checklist", "", ListTodo]],
  [["quote", "Quote", "", Quote], ["codeblock", "Code block", "", Code], ["link", "Link", "Ctrl+K", Link2]],
];

const FORMAT_ACTIONS = {
  bold: (chain) => chain.toggleBold(),
  italic: (chain) => chain.toggleItalic(),
  strike: (chain) => chain.toggleStrike(),
  code: (chain) => chain.toggleCode(),
  h1: (chain) => chain.toggleHeading({ level: 1 }),
  h2: (chain) => chain.toggleHeading({ level: 2 }),
  h3: (chain) => chain.toggleHeading({ level: 3 }),
  bullet: (chain) => chain.toggleBulletList(),
  number: (chain) => chain.toggleOrderedList(),
  todo: (chain) => chain.toggleTaskList(),
  quote: (chain) => chain.toggleBlockquote(),
  codeblock: (chain) => chain.toggleCodeBlock(),
};

// WYSIWYG Markdown editor. Markdown is the persisted source of truth: the editor parses it on
// mount and serializes back to it on every change, so the rest of the app is untouched.
const RichNoteEditor = forwardRef(function RichNoteEditor({ value, onChange, onBlur, placeholder, ariaLabel, linkTitles = [] }, ref) {
  const lastEmittedRef = useRef(value);
  const editorRef = useRef(null);
  // `[[` autocomplete. `query` is null when the picker is closed; `from` is the document
  // position of the opening bracket so accepting a suggestion can replace the whole typed run.
  const [suggest, setSuggest] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const titlesRef = useRef(linkTitles);
  titlesRef.current = linkTitles;
  const wrapRef = useRef(null);

  const matches = suggest
    ? titlesRef.current
      .filter((title) => title.toLowerCase().includes(suggest.query.toLowerCase()))
      .slice(0, 6)
    : [];
  // handlePaste/handleKeyDown are installed once when the editor is created, so live state
  // reaches them through refs rather than through the closure.
  const suggestRef = useRef(null);
  const matchesRef = useRef([]);
  const highlightRef = useRef(0);
  suggestRef.current = suggest;
  matchesRef.current = matches;
  highlightRef.current = highlight;

  // Reads the text just before the caret and opens the picker while it ends in `[[something`.
  // The picker is placed under the caret itself, so it never covers the toolbar or the line
  // being typed, whatever the note's length.
  function readSuggest(current) {
    const { state } = current;
    const { from, empty } = state.selection;
    if (!empty) return null;
    const before = state.doc.textBetween(Math.max(0, from - 160), from, "\n", " ");
    const match = /\[\[([^[\]\n]*)$/.exec(before);
    if (!match) return null;
    const start = from - match[0].length;
    let top = 0;
    let left = 0;
    const wrap = wrapRef.current;
    if (wrap) {
      try {
        const caret = current.view.coordsAtPos(start);
        const box = wrap.getBoundingClientRect();
        top = caret.bottom - box.top + 6;
        // Keep the whole list inside the editor even when the caret is near the right edge.
        left = Math.max(0, Math.min(caret.left - box.left, box.width - 240));
      } catch { top = 0; left = 0; }
    }
    return { query: match[1], from: start, to: from, top, left };
  }

  function acceptSuggest(title) {
    const current = editorRef.current;
    const open = suggestRef.current;
    if (!current || !open) return;
    setSuggest(null);
    current.chain().focus().insertContentAt({ from: open.from, to: open.to }, `[[${title}]]`).run();
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Link.configure({ openOnClick: false, autolink: true }).extend({
        addKeyboardShortcuts() {
          return { "Mod-k": () => this.editor.commands.setLink({ href: "https://" }) };
        },
      }),
      Placeholder.configure({ placeholder: placeholder || "Write here. It saves automatically." }),
    ],
    content: markdownToDoc(value),
    editorProps: {
      attributes: { class: "note-editor-surface", "aria-label": ariaLabel || "Note content" },
      handleKeyDown: (_view, event) => {
        if (!suggestRef.current || !matchesRef.current.length) return false;
        const last = matchesRef.current.length - 1;
        if (event.key === "ArrowDown") { setHighlight((index) => (index >= last ? 0 : index + 1)); return true; }
        if (event.key === "ArrowUp") { setHighlight((index) => (index <= 0 ? last : index - 1)); return true; }
        if (event.key === "Enter" || event.key === "Tab") { acceptSuggest(matchesRef.current[highlightRef.current] ?? matchesRef.current[0]); return true; }
        if (event.key === "Escape") { setSuggest(null); return true; }
        return false;
      },
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        if (!data || data.getData("text/html")) return false;
        const text = data.getData("text/plain");
        if (!looksLikeMarkdown(text) || !editorRef.current) return false;
        const doc = markdownToDoc(text);
        if (!doc?.content?.length) return false;
        editorRef.current.chain().focus().insertContent(doc.content).run();
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = docToMarkdown(current.getJSON());
      if (markdown !== lastEmittedRef.current) {
        lastEmittedRef.current = markdown;
        onChange(markdown);
      }
      setSuggest(readSuggest(current));
      setHighlight(0);
    },
    onSelectionUpdate: ({ editor: current }) => setSuggest(readSuggest(current)),
    // Blur saves the note, so the picker has to close with it or it would hang over the page.
    onBlur: () => { setSuggest(null); onBlur?.(); },
  });

  editorRef.current = editor;

  // Sync external Markdown changes (note switch, preview checkbox write-back) into the editor.
  useEffect(() => {
    if (editor && value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      editor.commands.setContent(markdownToDoc(value), { emitUpdate: false });
    }
  }, [value, editor]);

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    insertTodo: () => editor?.chain().focus().toggleTaskList().run(),
  }), [editor]);

  function applyAction(action) {
    if (!editor) return;
    if (action === "link") {
      const previous = editor.getAttributes("link").href;
      if (previous) editor.chain().focus().extendMarkRange("link").unsetLink().run();
      else editor.chain().focus().extendMarkRange("link").setLink({ href: "https://" }).run();
      return;
    }
    const builder = FORMAT_ACTIONS[action];
    if (builder) builder(editor.chain().focus()).run();
  }

  return (
    <div className="rich-note">
      <div className="format-bar" role="toolbar" aria-label="Formatting">
        {TOOLBAR.map((group, index) => (
          <div className="format-group" key={index}>
            {group.map(([action, label, shortcut, Icon]) => (
              <button
                type="button"
                key={action}
                className="format-button"
                aria-label={label}
                title={shortcut ? `${label} (${shortcut})` : label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyAction(action)}
              ><Icon size={15} strokeWidth={1.9} /></button>
            ))}
          </div>
        ))}
      </div>
      <div className="note-editor-wrap" ref={wrapRef}>
        <EditorContent editor={editor} className="note-editor" />
        {suggest && matches.length > 0 && <ul className="link-suggest" role="listbox" aria-label="Link to a note" style={{ top: `${suggest.top}px`, left: `${suggest.left}px` }}>
          {matches.map((title, index) => <li key={title}>
            <button
              type="button"
              role="option"
              aria-selected={index === highlight}
              className={index === highlight ? "is-active" : ""}
              onMouseDown={(event) => { event.preventDefault(); acceptSuggest(title); }}
              onMouseEnter={() => setHighlight(index)}
            >{title}</button>
          </li>)}
          <li className="link-suggest-hint">↑↓ to choose · Enter to link</li>
        </ul>}
      </div>
    </div>
  );
});

export default RichNoteEditor;
