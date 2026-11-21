# Conduit Bending Workshop (3/4" – 2" EMT)

A 3D, browser-based training simulator for marking, placing and bending EMT conduit.

## Run it
Double-click `start-workshop.bat` (needs Python), or run `python -m http.server 8123` in this folder,
then open http://localhost:8123/. Three.js is vendored in `node_modules/` (no internet needed).

## What it does
- **3/4", 1", 1-1/4"**: floor hand bender. The bender rolls along the floor leg like the real thing.
  Arrow (take-up 6" / 8" / 11"), rim notch (center of 45°), star (back of 90°), degree scale.
- **1-1/2", 2"**: electric one-shot bender (Greenlee 854/555 class). Deducts are 14-7/8" / 16-3/8"
  to the hook edge, and the shoe radius follows NEC Ch. 9 Table 2.
- Workflow: **Mark** (tape from an end, the back of a 90, or a mark; or click the conduit) → **Place**
  (mark, reference, which end faces the hook, roll by the printed stripe, slide) → **Bend**
  (pull, springback, release) → **Inspect** (true measured geometry plus lesson grading).
- Lessons: 90° stub, back-to-back, 30° offset, 3-point saddle, 4-point saddle, free bending.
  "Show me this step" demonstrates each step.
- Info tabs: bending math and calculators, bender specs, NEC Chapter 9 conduit fill calculator,
  NEC 358 support rules with a strap planner, and sources.

The conduit is an exact centerline of straight legs and arcs at the shoe radius, so results such as
the 1/16" error from the 2.0 offset multiplier are real geometry, not canned answers.
`node test/lessons.test.mjs` replays every lesson for every size headlessly, and
`node test/obstacles.test.mjs` checks that finished offsets and saddles never pass through their obstruction.

Bender values vary by manufacturer: always check the chart on your own bender.
