# Design QA — Shorts Workspace Layout

## Source truth

- Primary layout reference: `/var/folders/gh/ftfqzpx545n454q89rqnzmkw0000gn/T/codex-clipboard-c6f3266f-012e-4706-9e34-748cacf6d536.png`
- Timeline reference: `/var/folders/gh/ftfqzpx545n454q89rqnzmkw0000gn/T/codex-clipboard-c667c208-0563-43f5-9fe6-de6e119d3791.png`
- Asset-density reference: `/var/folders/gh/ftfqzpx545n454q89rqnzmkw0000gn/T/codex-clipboard-747344b7-e935-48de-a8aa-99fe09632427.png`
- Primary source dimensions: 4080 × 1784 px

## Implementation capture

- Screenshot: `design-qa/shorts-workspace-2048x896.png`
- Source-versus-implementation comparison: `design-qa/source-vs-implementation.png`
- Browser viewport: 2048 × 896 CSS px
- Captured image dimensions: 1720 × 896 px
- State: Shorts / Reels, 9:16 canvas, Contents tab, settings closed, empty timeline

## Comparison evidence

- The source shows the vertical preview ending above a full-width timeline. The implementation moves the timeline to the right workspace and lets the preview span the full editor height.
- The source timeline occupies roughly half of the lower workspace. The implementation starts at 197 px and keeps every unselected track at its 32 px collapsed height.
- The source shows two oversized cards per row. The implementation uses four columns at the validated wide viewport and automatically reduces the column count as available width shrinks.
- Measured implementation geometry:
  - Preview: x 0, y 94, 320 × 802
  - Material library: x 328, y 94, 1432 × 597
  - Inspector: x 1760, y 94, 288 × 597
  - Timeline: x 328, y 699, 1720 × 197
  - Contents grid: 4 columns

## Verification history

1. Replaced the Shorts row layout with a two-dimensional workspace grid.
2. Removed the Shorts-only rule that forced the timeline to at least 44% of the viewport height.
3. Added width-aware Contents card columns with a 300 px minimum card width.
4. Verified the standard YouTube long-form workspace still renders a centered 16:9 preview and a 197 px full-width timeline.
5. Compared the supplied source and the implementation in the same side-by-side image.

## Timeline label column resize QA

### Evidence

- Source visual truth: `/var/folders/gh/ftfqzpx545n454q89rqnzmkw0000gn/T/codex-clipboard-b22ea1a0-51ec-4824-a6f2-d11f4a5fa554.png`
- Source pixels: 466 × 434
- Browser implementation: `design-qa/timeline-label-column-expanded.png`
- Implementation pixels and CSS viewport: 1280 × 720 at 1× density
- Focused normalized implementation region: `design-qa/timeline-label-column-expanded-focus.png`, 466 × 434
- Same-input before/after comparison: `design-qa/timeline-label-source-vs-expanded.png`, 932 × 434
- State: Shorts / Reels, 9:16 canvas, empty collapsed timeline, settings closed; label column dragged from its 208 px default to 372 px.
- Interaction evidence: the drag handle changed the panel from 208 px to 372 px and expanded the V1 name input from 16 px to 180 px. Browser console errors: none.

The source is intentionally the narrow problem state and the implementation is the corrected expanded state, so this is a before/after interaction comparison rather than a claim that both images show the same width state.

### Fidelity surfaces

- Fonts and typography: existing application family, weights, line heights and track-label hierarchy are unchanged; the expanded input removes unnecessary truncation.
- Spacing and layout rhythm: the resizer preserves the 32 px collapsed rows and moves the time ruler without overlap; the adjustable range is 168–440 px.
- Colors and visual tokens: the divider reuses the existing gray border and blue hover/focus tokens.
- Image quality and asset fidelity: no raster, logo, illustration or custom image asset is present in this component.
- Copy and content: existing track names and controls are preserved; the new separator exposes a clear Traditional Chinese accessible label and tooltip.

### Findings

- No actionable P0/P1/P2 mismatch remains. The name column expands without hiding timeline controls, and the existing collapsed timeline density is preserved.

### Comparison history

1. Earlier state: fixed 208 px label panel and fixed-width V1/V2 name input caused long names to truncate.
2. Fix: added a draggable vertical separator, 168–440 px clamping, arrow-key resizing, and a flex-growing track-name input.
3. Post-fix evidence: measured 372 px panel and 180 px input after an actual pointer drag; focused source-versus-implementation comparison confirms the expanded label area.

final result: passed
