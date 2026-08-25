import React, { forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Quote, Link2 } from "lucide-react";
import { markdownToDoc, docToMarkdown } from "./rich-markdown.js";

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
const RichNoteEditor = forwardRef(function RichNoteEditor({ value, onChange, onBlur, placeholder, ariaLabel }, ref) {
  const lastEmittedRef = useRef(value);
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
    },
    onUpdate: ({ editor: current }) => {
      const markdown = docToMarkdown(current.getJSON());
      if (markdown !== lastEmittedRef.current) {
        lastEmittedRef.current = markdown;
        onChange(markdown);
      }
    },
    onBlur: () => onBlur?.(),
  });

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
      <EditorContent editor={editor} className="note-editor" />
    </div>
  );
});

export default RichNoteEditor;
