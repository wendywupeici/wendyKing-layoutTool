# AI Layout

AI Layout is a Canva presentation plugin that automatically reorganizes text and images into cleaner, more visually intentional slide layouts.

It is designed for `design_editor` use cases where users freely place images and text on a slide, then click one button to generate a better composition.

## What It Does

- Rebuilds page elements instead of only nudging existing positions
- Supports two layout modes:
  - `Regular`: clearer information hierarchy, grouped content, better readability
  - `Inspiration`: moodboard / collage direction with stronger visual rhythm
- Prioritizes:
  - text readability
  - image-text separation
  - image hierarchy
  - layout variety across pages
  - preserving full image content as much as possible

## Current Layout Goals

### Regular mode

- More like an editorial information page
- Stronger grouping between title, supporting text, and related images
- Cleaner modular composition
- No image-image overlap
- No text-text overlap
- No text-image overlap

### Inspiration mode

- More like a fashion moodboard / collage page
- Stronger hero image + supporting image rhythm
- Controlled overlap between images only
- More variation in scale, layering, and angle
- Avoids rigid grid-like output
- No text-text overlap
- No text-image overlap

## Tech Stack

- React
- TypeScript
- Canva Apps SDK
- Webpack
- Jest

## Local Development

### Requirements

- Node.js `^20` or newer
- npm

### Install

```bash
npm install
```

### Start local dev server

```bash
npm start
```

This starts the local Canva app bundle for preview inside Canva.

## Build

```bash
npm run build
```

Production assets are emitted to:

```bash
dist/
```

The main bundle used by Canva is:

```bash
dist/app.js
```

## Vercel Deployment

This project can be deployed as a static frontend on Vercel.

### Recommended Vercel settings

- Framework Preset: `Other`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

### Important note for Canva

Canva apps expect a hosted JavaScript bundle URL. After deployment, the important production asset is usually:

```bash
https://your-project.vercel.app/app.js
```

In many cases, this is the URL you should provide in the Canva Developer Portal as the production app source.

This repo also includes a `vercel.json` file so Vercel treats the project as a static build and serves the generated bundle cleanly.

## Project Structure

```bash
src/intents/design_editor/app.tsx
```

Main smart-layout logic lives here.

```bash
src/intents/design_editor/tests/app.tests.tsx
```

Basic UI test coverage lives here.

## Notes

- This project uses heuristic layout rules, not computer vision.
- It does not truly understand image semantics.
- It does not perform real cutout / masking / subject detection.
- It aims to avoid destructive image cropping, but exact behavior can still depend on Canva element constraints.

## License

See [LICENSE.md](/Users/wupeici/ai-layout/LICENSE.md).
