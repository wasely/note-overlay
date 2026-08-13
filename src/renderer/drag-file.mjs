export function markdownFileName(note) {
  const title = note?.title?.trim() || "notebook-note";
  const safeTitle = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 72).replace(/[. ]+$/g, "") || "notebook-note";
  return `${safeTitle}.md`;
}

export function addBrowserFileDragData(event, note, environment = globalThis) {
  const title = note?.title?.trim() || "";
  const body = note?.body?.trimEnd() || "";
  const markdown = [title ? `# ${title}` : "", body].filter(Boolean).join("\n\n");
  const dataTransfer = event?.dataTransfer;
  if (!markdown || !dataTransfer) return null;

  const fileName = markdownFileName(note);
  const contents = `${markdown}\n`;
  const file = new environment.File([contents], fileName, { type: "text/markdown" });
  const objectUrl = environment.URL.createObjectURL(file);

  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData("text/plain", fileName);
  dataTransfer.setData("text/uri-list", objectUrl);
  dataTransfer.setData("DownloadURL", `text/markdown:${fileName}:${objectUrl}`);
  try { dataTransfer.items?.add(file); } catch { /* DownloadURL remains the Chromium drag-out fallback. */ }

  environment.setTimeout(() => environment.URL.revokeObjectURL(objectUrl), 60_000);
  return { fileName, contents, objectUrl };
}
