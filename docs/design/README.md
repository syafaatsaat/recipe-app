# Design canvas

Source of the M2 design pass (doc §8). The files in `canvas/` are a Design canvas project:

- `canvas.json`: pages, board positions and notes
- `Main`, `MidCentury`, `Notebook`, `Cottage`, `Mix` (`.dc.html`): style directions A–E, page "Style directions". E (`Mix`) was chosen.
- `WfList`, `WfRecipe`, `WfEditor`, `WfImport` (`.dc.html`): the four screens in style E, page "Screens (style E)"

The boards load `./support.js` from the canvas runtime, so they don't render as plain HTML files; open them in the Design canvas. The live private copy is https://claude.ai/artifact/GR9Agyh1n1Wb99F4EZ3NEz.

Recipe amounts on the boards are embedded `render()` output from `lib/culinary` (brownies, 9 in round → 9×13 pan). If a display rule changes, the embedded data goes stale. Regenerate it, or treat the canvas as a picture of 2026-11-25.
