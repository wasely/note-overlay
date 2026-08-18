# Design — Notebook

A locked design system for the local Notebook app. Every screen keeps the same
type, colour, spacing, navigation, and interaction voice.

## Genre

Modern-minimal with a utilitarian tone. Information first; decoration removed.

## Macrostructure family

- Workspace views: **Workbench** — compact header, controls, working surface.
- Reference views: **Index-First** — categories and rows are the navigation.
- Writing views: **Long Document** — quiet canvas, minimal controls.

## Theme

- Warm paper surfaces with a low-chroma sage anchor.
- Ink carries hierarchy; accent is reserved for focus and active state.
- Light and dark values live in `src/renderer/tokens.css`.

## Typography

- Display: Geist Variable, weight 700, normal.
- Body: Geist Variable, weight 400.
- Mono: Geist Mono-compatible system stack, weight 400.
- Data uses tabular figures.

## Spacing

4-point named scale. Use tokens, never one-off spacing in new UI.

## Legibility floor

- No rendered text below 11px, no interactive control below 22px tall.
- `scripts/ui-test.mjs` fails the build when either floor is broken.

## Motion

- No page reveals.
- State feedback only: colour and 1 px press translation.
- Reduced motion removes spatial movement.

## Navigation

- One persistent left sidebar: identity, search, four labelled destinations, then the contextual list.
- Destinations are always labelled text with an icon and a count; never an icon-only dock.
- The contextual list owns the remaining height and scrolls on its own.
- Lucide icons only; no brand marks.

## Component voice

- One containment layer. No card-in-card nesting.
- Rows are the primary browsing surface.
- Borders create structure; shadows are reserved for menus and dialogs.
- Controls remain one line and have visible focus states.

## Per-page allowances

- Today: two task columns above a full-width record, one capture bar at the top.
- Notes: function-first writing canvas; no enrichment. Preview shares the canvas measure.
- Skills and Commands: filter chips plus rows; no dashboards, no ranked catalogues.

## What pages MUST share

- Geist type, warm paper, sage accent, radii, focus ring, button geometry.
- Navigation order and icon logic.
- Loading, empty, error, and success language.

## What pages MAY differ on

- Information density and the number of columns.
- Whether the body is a grid, index, editor, or embedded service.

## Exports

The canonical CSS export is `src/renderer/tokens.css`.
