import React, { useState } from "react";
import { openDesign } from "@canva/design";
import { Button, Text, Rows, Title, Alert, Box } from "@canva/app-ui-kit";

// Basic rectangle used throughout the layout pipeline.
type LayoutBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// High-level layout mode between text and image zones.
type Orientation = "side" | "stack" | "single";
type LayoutMode = "regular" | "inspiration";

// Final zone split used by the current page.
type ZoneLayout = {
  textZone: LayoutBox;
  imageZone: LayoutBox;
  templateName: string;
  orientation: Orientation;
};

// Text metadata used for ranking and flow layout.
type TextItem = {
  element: any;
  plain: string;
  regions: any[];
  baseFont: number;
  length: number;
  importance: number;
  baseWidth: number;
  baseHeight: number;
  lineCount: number;
  blankLineCount: number;
};

type ImageShape = "portrait" | "landscape" | "square";

type ThemeProfile = {
  editorial: boolean;
  fashion: boolean;
  moodboard: boolean;
  palette: boolean;
  shortHeadline: boolean;
};

type ImageItem = {
  element: any;
  box: LayoutBox;
  area: number;
  aspectRatio: number;
  shape: ImageShape;
  salience: number;
};

type ImageSlot = LayoutBox & {
  emphasis: number;
  preferredShape: ImageShape | "any";
  rotationDelta?: number;
};

// Size floors used to keep image cards visibly distinct.
type ImageLayoutGuard = {
  minWidth: number;
  minHeight: number;
  imageShare: number;
};

// Numeric guards for robust geometry computation.
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const safeNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

// Inner padding helper for safe subdivisions.
const insetBox = (box: LayoutBox, inset: number): LayoutBox => ({
  left: box.left + inset,
  top: box.top + inset,
  width: Math.max(1, box.width - inset * 2),
  height: Math.max(1, box.height - inset * 2),
});

const fitBoxToAspect = (
  container: LayoutBox,
  aspectRatio: number,
  alignY: "top" | "center" | "bottom" = "center",
): LayoutBox => {
  // Fit image into the planned slot without cropping.
  const safeAspect = Math.max(0.2, Math.min(aspectRatio, 5));
  let width = container.width;
  let height = width / safeAspect;

  if (height > container.height) {
    height = container.height;
    width = height * safeAspect;
  }

  const left = container.left + (container.width - width) / 2;
  const top =
    alignY === "top"
      ? container.top
      : alignY === "bottom"
        ? container.top + container.height - height
        : container.top + (container.height - height) / 2;

  return {
    left,
    top,
    width,
    height,
  };
};

const unionBoxes = (boxes: LayoutBox[]): LayoutBox | undefined => {
  // Used after image placement to understand how much of the page the collage actually occupies.
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};

const intersectionArea = (a: LayoutBox, b: LayoutBox): number => {
  const overlapWidth =
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const overlapHeight =
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return overlapWidth * overlapHeight;
};

const shrinkBox = (box: LayoutBox, factor: number): LayoutBox => {
  const nextWidth = box.width * factor;
  const nextHeight = box.height * factor;
  return {
    left: box.left + (box.width - nextWidth) / 2,
    top: box.top + (box.height - nextHeight) / 2,
    width: nextWidth,
    height: nextHeight,
  };
};

const clampBoxWithinZone = (box: LayoutBox, zone: LayoutBox): LayoutBox => {
  const width = Math.min(box.width, zone.width);
  const height = Math.min(box.height, zone.height);
  return {
    left: clamp(box.left, zone.left, zone.left + zone.width - width),
    top: clamp(box.top, zone.top, zone.top + zone.height - height),
    width,
    height,
  };
};

const clampImageSlotWithinZone = (slot: ImageSlot, zone: LayoutBox): ImageSlot => {
  const box = clampBoxWithinZone(slot, zone);
  return {
    ...slot,
    ...box,
  };
};

const expandBox = (box: LayoutBox, padding: number): LayoutBox => ({
  left: box.left - padding,
  top: box.top - padding,
  width: box.width + padding * 2,
  height: box.height + padding * 2,
});

const withSlotRotation = (
  slot: ImageSlot,
  rotationDelta: number | undefined,
  zone: LayoutBox,
  shrink = 0.94,
): ImageSlot => {
  if (rotationDelta === undefined || rotationDelta === 0) return slot;
  return clampImageSlotWithinZone(
    {
      ...slot,
      ...shrinkBox(slot, shrink),
      rotationDelta,
    },
    zone,
  );
};

const addCreativeTilt = (
  slots: ImageSlot[],
  zone: LayoutBox,
  layoutMode: LayoutMode,
  signature: number,
): ImageSlot[] => {
  const maxAbs = layoutMode === "regular" ? 5 : 8;

  return slots.map((slot, index) => {
    if (index === 0) return slot;
    if (slot.rotationDelta !== undefined) return withSlotRotation(slot, slot.rotationDelta, zone, 0.93);

    const pattern = (signature + index * 17) % 7;
    const rotation =
      pattern === 0
        ? 0
        : pattern === 1
          ? 2
          : pattern === 2
            ? -2
            : pattern === 3
              ? 3
              : pattern === 4
                ? -3
                : pattern === 5
                  ? (layoutMode === "regular" ? 4 : 6)
                  : (layoutMode === "regular" ? -4 : -6);
    const capped = clamp(rotation, -maxAbs, maxAbs);
    return withSlotRotation(slot, capped === 0 ? undefined : capped, zone, layoutMode === "regular" ? 0.95 : 0.92);
  });
};

const boxFromCenter = (centerX: number, centerY: number, width: number, height: number): LayoutBox => ({
  left: centerX - width / 2,
  top: centerY - height / 2,
  width,
  height,
});

const getImageShape = (aspectRatio: number): ImageShape => {
  if (aspectRatio >= 1.2) return "landscape";
  if (aspectRatio <= 0.82) return "portrait";
  return "square";
};

// Treat Canva rect + image media fill as "image-like" element for layout.
const hasImageFill = (element: any): boolean => {
  if (!element || element.type !== "rect") return false;
  return element.fill?.mediaContainer?.ref?.type === "image";
};

// Read element geometry with sane fallbacks.
const getBox = (element: any): LayoutBox => ({
  left: safeNumber(element.left, 0),
  top: safeNumber(element.top, 0),
  width: Math.max(1, safeNumber(element.width, 200)),
  height: Math.max(1, safeNumber(element.height, 200)),
});

// Axis-aligned bounding-box overlap test.
const overlaps = (a: LayoutBox, b: LayoutBox): boolean => {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
};

// Count pairwise overlaps within one list.
const countOverlaps = (boxes: LayoutBox[]): number => {
  let count = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a && b && overlaps(a, b)) count += 1;
    }
  }
  return count;
};

// Count overlaps between two different lists.
const countCrossOverlaps = (aBoxes: LayoutBox[], bBoxes: LayoutBox[]): number => {
  let count = 0;
  for (const a of aBoxes) {
    for (const b of bBoxes) {
      if (overlaps(a, b)) count += 1;
    }
  }
  return count;
};

const overlapsAny = (box: LayoutBox, others: LayoutBox[]): boolean =>
  others.some((other) => overlaps(box, other));

// Deterministic signature hash for style/template variation across pages.
const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 131 + input.charCodeAt(i)) % 2147483647;
  }
  return hash;
};

// Read weak semantic cues from page copy to steer style selection.
const buildThemeProfile = (items: TextItem[]): ThemeProfile => {
  // Weak text-only semantic cues. This does not understand pixels; it only steers template choice.
  const plain = items.map((item) => item.plain.toLowerCase()).join(" ");
  const headline = [...items]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 2)
    .map((item) => item.plain.trim())
    .join(" ");

  const contains = (keywords: string[]): boolean =>
    keywords.some((keyword) => plain.includes(keyword));

  return {
    editorial: contains(["editorial", "story", "brand", "identity", "collection"]),
    fashion: contains(["fashion", "runway", "look", "yohji", "silhouette", "garment"]),
    moodboard: contains(["mood", "board", "inspiration", "concept", "visual"]),
    palette: contains(["palette", "color", "tone", "material", "fabric"]),
    shortHeadline: headline.replace(/\s+/g, " ").trim().length > 0 && headline.length <= 32,
  };
};

// Multi-image pages need more area and larger minimum cards.
const getImageLayoutGuard = (count: number, zone: LayoutBox): ImageLayoutGuard => {
  const density = clamp(count / 8, 0, 1);
  const shortSide = Math.min(zone.width, zone.height);

  return {
    minWidth: clamp(shortSide * (0.12 + density * 0.06), 92, 180),
    minHeight: clamp(shortSide * (0.18 + density * 0.08), 120, 240),
    imageShare: clamp(0.4 + density * 0.22, 0.42, 0.62),
  };
};

// Build image features so layout can separate hero imagery from supporting cards.
const buildImageItems = (
  images: any[],
  pageWidth: number,
  pageHeight: number,
  theme: ThemeProfile,
): ImageItem[] => {
  // Image ranking is still heuristic: geometry + page position + text theme hints.
  return images
    .map((image) => {
      const box = getBox(image);
      const area = box.width * box.height;
      const aspectRatio = box.width / Math.max(1, box.height);
      const shape = getImageShape(aspectRatio);
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const centerDistance =
        Math.abs(centerX - pageWidth / 2) / pageWidth +
        Math.abs(centerY - pageHeight / 2) / pageHeight;
      const portraitBonus =
        theme.fashion && shape === "portrait" ? area * 0.18 : 0;
      const landscapeBonus =
        theme.moodboard && shape === "landscape" ? area * 0.16 : 0;
      const squarePenalty = shape === "square" ? area * 0.04 : 0;
      const salience =
        area * 1.1 +
        portraitBonus +
        landscapeBonus -
        squarePenalty -
        centerDistance * area * 0.35;

      return {
        element: image,
        box,
        area,
        aspectRatio,
        shape,
        salience,
      };
    })
    .sort((a, b) => b.salience - a.salience);
};

const isSimilarArea = (a: ImageItem, b: ImageItem): boolean => {
  const ratio = Math.min(a.area, b.area) / Math.max(a.area, b.area, 1);
  return ratio >= 0.82;
};

const scoreBackgroundCandidate = (item: ImageItem, theme: ThemeProfile): number => {
  // Prefer wider / texture-like material for the deepest collage layer.
  const shapeBonus = item.shape === "landscape" ? 22000 : item.shape === "square" ? 12000 : 0;
  const textureBonus = theme.palette || theme.moodboard ? 18000 : 0;
  return item.area * 0.35 + shapeBonus + textureBonus - (item.shape === "portrait" ? 24000 : 0);
};

// Check slot quality before committing to rebuild.
const isValidImageLayout = (
  boxes: LayoutBox[],
  zone: LayoutBox,
  guard: ImageLayoutGuard,
): boolean => {
  if (boxes.length === 0) return true;
  if (countOverlaps(boxes) > 0) return false;

  return boxes.every((box) => {
    const withinZone =
      box.left >= zone.left - 0.5 &&
      box.top >= zone.top - 0.5 &&
      box.left + box.width <= zone.left + zone.width + 0.5 &&
      box.top + box.height <= zone.top + zone.height + 0.5;

    return withinZone && box.width >= guard.minWidth && box.height >= guard.minHeight;
  });
};

const isControlledCollageLayout = (
  boxes: LayoutBox[],
  zone: LayoutBox,
  maxOverlapRatio: number,
  maxPairCount: number,
): boolean => {
  let overlapPairs = 0;

  for (const box of boxes) {
    const withinZone =
      box.left >= zone.left - 0.5 &&
      box.top >= zone.top - 0.5 &&
      box.left + box.width <= zone.left + zone.width + 0.5 &&
      box.top + box.height <= zone.top + zone.height + 0.5;

    if (!withinZone) return false;
  }

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      const overlap = intersectionArea(a, b);
      if (overlap <= 0) continue;
      overlapPairs += 1;
      const minArea = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
      if (overlap / minArea > maxOverlapRatio) return false;
    }
  }

  return overlapPairs <= maxPairCount;
};

// Stable fallback grid used when decorative layouts become too cramped.
const buildSafeGridSlots = (zone: LayoutBox, count: number): LayoutBox[] => {
  if (count <= 0) return [];
  const gap = clamp(Math.min(zone.width, zone.height) * 0.025, 8, 20);
  const cols = Math.max(1, Math.ceil(Math.sqrt((count * zone.width) / Math.max(zone.height, 1))));
  const rows = Math.max(1, Math.ceil(count / cols));
  const width = (zone.width - gap * (cols - 1)) / cols;
  const height = (zone.height - gap * (rows - 1)) / rows;
  const slots: LayoutBox[] = [];

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    slots.push({
      left: zone.left + col * (width + gap),
      top: zone.top + row * (height + gap),
      width,
      height,
    });
  }

  return slots;
};

// Stack cards into varied columns for a more editorial "gallery wall" look.
const buildMasonrySlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  // Base helper for magazine-like columns. Inspiration mode later perturbs these slots.
  if (items.length === 0) return [];
  const gap = clamp(Math.min(zone.width, zone.height) * 0.026, 8, 18);
  const columnCount = items.length >= 11 ? 4 : items.length >= 6 ? 3 : 2;
  const widthSeeds = [1.05, 0.9, 1.1, 0.86];
  const widths = new Array(columnCount)
    .fill(0)
    .map((_, index) => widthSeeds[(index + signature) % widthSeeds.length] ?? 1);
  const totalWidth = widths.reduce((sum, weight) => sum + weight, 0);
  const usableWidth = zone.width - gap * (columnCount - 1);
  const columnWidths = widths.map((weight) => (usableWidth * weight) / totalWidth);
  const columnLefts: number[] = [];
  let runningLeft = zone.left;

  for (const width of columnWidths) {
    columnLefts.push(runningLeft);
    runningLeft += width + gap;
  }

  const initialOffsets = new Array(columnCount)
    .fill(0)
    .map((_, index) => zone.top + (index % 2 === 0 ? 0 : gap * 1.8));
  const slots: ImageSlot[] = [];

  for (const item of items) {
    let targetColumn = 0;
    for (let i = 1; i < initialOffsets.length; i += 1) {
      if ((initialOffsets[i] ?? zone.top) < (initialOffsets[targetColumn] ?? zone.top)) {
        targetColumn = i;
      }
    }

    const width = columnWidths[targetColumn] ?? columnWidths[0] ?? zone.width;
    const rawHeight = width / Math.max(0.55, Math.min(item.aspectRatio, 1.8));
    const shapeFactor = item.shape === "portrait" ? 1.14 : item.shape === "landscape" ? 0.78 : 0.96;
    const height = rawHeight * shapeFactor;
    const top = initialOffsets[targetColumn] ?? zone.top;

    slots.push({
      left: columnLefts[targetColumn] ?? zone.left,
      top,
      width,
      height,
      emphasis: item.salience,
      preferredShape: item.shape,
    });

    initialOffsets[targetColumn] = top + height + gap;
  }

  const maxBottom = slots.reduce((max, slot) => Math.max(max, slot.top + slot.height), zone.top);
  const totalHeight = Math.max(zone.height, maxBottom - zone.top);
  const scale = Math.min(1, zone.height / Math.max(totalHeight, 1));

  return slots.map((slot) => ({
    ...slot,
    top: zone.top + (slot.top - zone.top) * scale,
    width: slot.width,
    height: slot.height * scale,
  }));
};

// Give the most important asset a poster-like stage, then cascade supporting cards around it.
const buildHeroCascadeSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const gap = clamp(Math.min(zone.width, zone.height) * 0.028, 10, 22);
  const hero = items[0];
  const heroOnRight = signature % 2 === 0;
  const heroPortrait = hero?.shape !== "landscape";

  if (heroPortrait) {
    const heroWidth = zone.width * clamp(0.4 + items.length * 0.01, 0.42, 0.5);
    const heroBox: ImageSlot = {
      left: heroOnRight ? zone.left + zone.width - heroWidth : zone.left,
      top: zone.top,
      width: heroWidth,
      height: zone.height,
      emphasis: hero?.salience ?? 1,
      preferredShape: hero?.shape ?? "portrait",
    };
    const restZone: LayoutBox = {
      left: heroOnRight ? zone.left : zone.left + heroWidth + gap,
      top: zone.top + gap * 0.25,
      width: zone.width - heroWidth - gap,
      height: zone.height - gap * 0.25,
    };

    return [heroBox, ...buildMasonrySlots(restZone, items.slice(1), signature + 5)];
  }

  const heroHeight = zone.height * clamp(0.4 + items.length * 0.012, 0.42, 0.54);
  const heroBox: ImageSlot = {
    left: zone.left,
    top: zone.top,
    width: zone.width,
    height: heroHeight,
    emphasis: hero?.salience ?? 1,
    preferredShape: hero?.shape ?? "landscape",
  };
  const restZone: LayoutBox = {
    left: zone.left,
    top: zone.top + heroHeight + gap,
    width: zone.width,
    height: zone.height - heroHeight - gap,
  };

  return [heroBox, ...buildMasonrySlots(restZone, items.slice(1), signature + 3)];
};

const buildSteppedShowcaseSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const gap = clamp(Math.min(zone.width, zone.height) * 0.026, 10, 22);
  const heroWidth = zone.width * clamp(0.42, 0.36, 0.46);
  const heroHeight = zone.height * clamp(0.6, 0.56, 0.68);
  const heroOnRight = signature % 2 === 0;
  const heroBox: ImageSlot = {
    left: heroOnRight ? zone.left + zone.width - heroWidth : zone.left,
    top: zone.top + zone.height * 0.04,
    width: heroWidth,
    height: heroHeight,
    emphasis: (items[0]?.salience ?? 1) * 2.4,
    preferredShape: items[0]?.shape ?? "portrait",
  };

  const railZone: LayoutBox = {
    left: heroOnRight ? zone.left : heroBox.left + heroBox.width + gap,
    top: zone.top,
    width: zone.width - heroWidth - gap,
    height: zone.height,
  };

  const slots: ImageSlot[] = [heroBox];

  if (items.length >= 2) {
    slots.push({
      left: railZone.left,
      top: railZone.top,
      width: railZone.width,
      height: railZone.height * 0.32,
      emphasis: (items[1]?.salience ?? 1) * 1.5,
      preferredShape: items[1]?.shape ?? "landscape",
      rotationDelta: heroOnRight ? -4 : 4,
    });
  }

  if (items.length >= 3) {
    slots.push({
      left: railZone.left + railZone.width * 0.08,
      top: railZone.top + railZone.height * 0.38,
      width: railZone.width * 0.84,
      height: railZone.height * 0.24,
      emphasis: (items[2]?.salience ?? 1) * 1.2,
      preferredShape: items[2]?.shape ?? "landscape",
    });
  }

  if (items.length >= 4) {
    const bottomZone: LayoutBox = {
      left: zone.left,
      top: zone.top + heroHeight + gap,
      width: zone.width,
      height: zone.height - heroHeight - gap,
    };
    const tail = buildRhythmicGridSlots(bottomZone, items.length - 3, signature + 21).map(
      (slot, index) => ({
        ...slot,
        emphasis: (items[index + 3]?.salience ?? 1) * 0.95,
        preferredShape: (items[index + 3]?.shape ?? "any") as ImageShape | "any",
      }),
    );
    slots.push(...tail);
  }

  return slots.slice(0, items.length);
};

const buildCenteredGallerySlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const gap = clamp(Math.min(zone.width, zone.height) * 0.026, 10, 22);
  const heroWidth = zone.width * 0.44;
  const heroHeight = zone.height * 0.56;
  const heroBox: ImageSlot = {
    left: zone.left + (zone.width - heroWidth) / 2,
    top: zone.top + zone.height * 0.08,
    width: heroWidth,
    height: heroHeight,
    emphasis: (items[0]?.salience ?? 1) * 2.5,
    preferredShape: items[0]?.shape ?? "any",
  };

  const slots: ImageSlot[] = [heroBox];
  const sideWidth = (zone.width - heroWidth - gap * 2) / 2;

  if (items.length >= 2) {
    slots.push({
      left: zone.left,
      top: zone.top + zone.height * 0.02,
      width: sideWidth,
      height: zone.height * 0.34,
      emphasis: (items[1]?.salience ?? 1) * 1.35,
      preferredShape: items[1]?.shape ?? "portrait",
      rotationDelta: -5,
    });
  }

  if (items.length >= 3) {
    slots.push({
      left: zone.left + zone.width - sideWidth,
      top: zone.top + zone.height * 0.2,
      width: sideWidth,
      height: zone.height * 0.3,
      emphasis: (items[2]?.salience ?? 1) * 1.25,
      preferredShape: items[2]?.shape ?? "portrait",
      rotationDelta: 5,
    });
  }

  if (items.length >= 4) {
    const bottomZone: LayoutBox = {
      left: zone.left,
      top: heroBox.top + heroBox.height + gap,
      width: zone.width,
      height: zone.top + zone.height - (heroBox.top + heroBox.height + gap),
    };
    const tail = buildRhythmicGridSlots(bottomZone, items.length - 3, signature + 27).map(
      (slot, index) => ({
        ...slot,
        emphasis: (items[index + 3]?.salience ?? 1) * 0.92,
        preferredShape: (items[index + 3]?.shape ?? "any") as ImageShape | "any",
      }),
    );
    slots.push(...tail);
  }

  return slots.slice(0, items.length);
};

const buildClusteredMosaicSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
  theme: ThemeProfile,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const heroLeft = signature % 2 === 0;
  const slots: ImageSlot[] = [];
  const background = [...items].sort(
    (a, b) => scoreBackgroundCandidate(b, theme) - scoreBackgroundCandidate(a, theme),
  )[0];

  if (background) {
    slots.push({
      left: heroLeft ? zone.left + zone.width * 0.06 : zone.left + zone.width * 0.5,
      top: zone.top + zone.height * 0.06,
      width: zone.width * (background.shape === "portrait" ? 0.24 : 0.3),
      height: zone.height * (background.shape === "portrait" ? 0.38 : 0.26),
      emphasis: scoreBackgroundCandidate(background, theme) * 0.8,
      preferredShape: background.shape,
    });
  }

  const heroBox: ImageSlot = {
    left: heroLeft ? zone.left + zone.width * 0.3 : zone.left + zone.width * 0.16,
    top: zone.top + zone.height * 0.14,
    width: zone.width * 0.34,
    height: zone.height * 0.48,
    emphasis: (items[0]?.salience ?? 1) * 2.8,
    preferredShape: items[0]?.shape ?? "portrait",
  };
  slots.push(heroBox);

  if (items.length >= 2) {
    slots.push({
      left: heroLeft ? heroBox.left + heroBox.width * 0.72 : heroBox.left - zone.width * 0.1,
      top: heroBox.top + zone.height * 0.04,
      width: zone.width * 0.2,
      height: zone.height * 0.26,
      emphasis: (items[1]?.salience ?? 1) * 1.8,
      preferredShape: items[1]?.shape ?? "portrait",
    });
  }

  if (items.length >= 3) {
    slots.push({
      left: heroLeft ? zone.left + zone.width * 0.12 : zone.left + zone.width * 0.52,
      top: zone.top + zone.height * 0.54,
      width: zone.width * 0.26,
      height: zone.height * 0.18,
      emphasis: (items[2]?.salience ?? 1) * 1.45,
      preferredShape: items[2]?.shape ?? "landscape",
      rotationDelta: heroLeft ? -4 : 4,
    });
  }

  const tail = items.slice(3);
  const accentZone: LayoutBox = {
    left: zone.left + (heroLeft ? zone.width * 0.04 : zone.width * 0.32),
    top: zone.top + zone.height * 0.02,
    width: zone.width * 0.4,
    height: zone.height * 0.54,
  };
  const lowerZone: LayoutBox = {
    left: zone.left + (heroLeft ? zone.width * 0.34 : zone.width * 0.08),
    top: zone.top + zone.height * 0.64,
    width: zone.width * 0.38,
    height: zone.height * 0.24,
  };
  const accentTake = Math.ceil(tail.length * 0.7);
  const accentSlots = buildScatteredAccentSlots(accentZone, tail.slice(0, accentTake), signature + 31);
  const lowerSlots = buildScatteredAccentSlots(lowerZone, tail.slice(accentTake), signature + 47).map(
    (slot, index) =>
      clampImageSlotWithinZone(
        {
          ...slot,
          width: slot.width * (index % 2 === 0 ? 1.06 : 0.92),
          height: slot.height * (index % 2 === 0 ? 1.06 : 0.92),
        },
        zone,
      ),
  );

  slots.push(...accentSlots, ...lowerSlots);

  return slots.slice(0, items.length).map((slot, index) => {
    const jitterX = ((signature + index * 13) % 3) - 1;
    const jitterY = ((signature + index * 17) % 3) - 1;
    return clampImageSlotWithinZone(
      {
        ...slot,
        left: slot.left + jitterX * zone.width * 0.01,
        top: slot.top + jitterY * zone.height * 0.008,
      },
      zone,
    );
  });
};

const buildRibbonCollageSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const heroLeft = signature % 2 === 0;
  const heroBox: ImageSlot = {
    left: heroLeft ? zone.left + zone.width * 0.08 : zone.left + zone.width * 0.44,
    top: zone.top + zone.height * 0.18,
    width: zone.width * 0.28,
    height: zone.height * 0.52,
    emphasis: (items[0]?.salience ?? 1) * 2.7,
    preferredShape: items[0]?.shape ?? "portrait",
  };

  const slots: ImageSlot[] = [heroBox];
  const ribbonWidth = zone.width * 0.62;
  const ribbonLeft = heroLeft ? zone.left + zone.width * 0.28 : zone.left + zone.width * 0.1;
  const ribbonTop = zone.top + zone.height * 0.02;
  const ribbonGap = clamp(zone.height * 0.018, 8, 16);
  const ribbonHeights = [0.2, 0.16, 0.18];

  for (let i = 1; i < Math.min(items.length, 4); i += 1) {
    const height = zone.height * (ribbonHeights[i - 1] ?? 0.16);
    slots.push({
      left: ribbonLeft + (i === 2 ? zone.width * 0.03 : 0),
      top: ribbonTop + (i - 1) * (height + ribbonGap) + (i === 3 ? ribbonGap * 1.4 : 0),
      width: ribbonWidth - (i === 2 ? zone.width * 0.06 : 0),
      height,
      emphasis: (items[i]?.salience ?? 1) * (1.7 - i * 0.16),
      preferredShape: items[i]?.shape ?? "landscape",
      rotationDelta: i === 2 ? (heroLeft ? -3 : 3) : undefined,
    });
  }

  const tailZone: LayoutBox = {
    left: zone.left + (heroLeft ? zone.width * 0.02 : zone.width * 0.54),
    top: zone.top + zone.height * 0.56,
    width: zone.width * 0.28,
    height: zone.height * 0.32,
  };
  const tail = buildMasonrySlots(tailZone, items.slice(4), signature + 43).map((slot, index) => ({
    ...slot,
    left: slot.left + (index % 2 === 0 ? -zone.width * 0.012 : zone.width * 0.008),
    top: slot.top + (index % 3 === 0 ? zone.height * 0.008 : 0),
  }));
  slots.push(...tail);

  return slots.slice(0, items.length).map((slot) => clampImageSlotWithinZone(slot, zone));
};

const buildScatteredAccentSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  const centerX = zone.left + zone.width * (signature % 2 === 0 ? 0.44 : 0.56);
  const centerY = zone.top + zone.height * 0.38;
  const radiusX = zone.width * 0.24;
  const radiusY = zone.height * 0.2;

  return items.map((item, index) => {
    const angle = ((signature * 37 + index * 71) % 360) * (Math.PI / 180);
    const orbit = 0.58 + ((signature + index * 11) % 5) * 0.11;
    const cx = centerX + Math.cos(angle) * radiusX * orbit;
    const cy = centerY + Math.sin(angle) * radiusY * orbit;
    const sizeScale =
      index % 6 === 0 ? 1.52 : index % 5 === 0 ? 1.28 : index % 3 === 0 ? 1.12 : index % 4 === 0 ? 0.9 : 1;
    const width =
      zone.width *
      (item.shape === "portrait" ? 0.1 : item.shape === "landscape" ? 0.128 : 0.112) *
      sizeScale;
    const height = width / Math.max(0.55, Math.min(item.aspectRatio, 1.8));
    return clampImageSlotWithinZone(
      {
        ...boxFromCenter(cx, cy, width, height),
        emphasis: item.salience * (1 - index * 0.02),
        preferredShape: item.shape,
        rotationDelta: ((signature + index * 19) % 3) - 1 === 0 ? undefined : (((signature + index * 19) % 3) - 1) * 4,
      },
      zone,
    );
  });
};

const buildDiagonalGallerySlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const heroOnLeft = signature % 2 === 0;
  const slots: ImageSlot[] = [];
  const heroBox: ImageSlot = {
    left: heroOnLeft ? zone.left : zone.left + zone.width * 0.44,
    top: zone.top + zone.height * 0.08,
    width: zone.width * 0.34,
    height: zone.height * 0.52,
    emphasis: (items[0]?.salience ?? 1) * 2.5,
    preferredShape: items[0]?.shape ?? "portrait",
  };
  slots.push(heroBox);

  const tailCount = items.length - 1;
  const stepWidth = zone.width * 0.22;
  const stepHeight = zone.height * 0.2;
  const cols = tailCount <= 3 ? 2 : 3;

  for (let i = 0; i < tailCount; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const xBase = heroOnLeft ? zone.left + zone.width * 0.42 : zone.left + zone.width * 0.02;
    const x = xBase + col * stepWidth + row * zone.width * 0.03;
    const y = zone.top + zone.height * 0.04 + row * stepHeight + col * zone.height * 0.025;
    const item = items[i + 1];
    const width = zone.width * (item?.shape === "landscape" ? 0.18 : 0.14);
    const height = width / Math.max(0.55, Math.min(item?.aspectRatio ?? 1, 1.8));
    slots.push(
      clampImageSlotWithinZone(
        {
          left: x,
          top: y,
          width,
          height,
          emphasis: (item?.salience ?? 1) * (1.2 - row * 0.08),
          preferredShape: item?.shape ?? "any",
          rotationDelta: col % 2 === 0 ? (heroOnLeft ? -3 : 3) : undefined,
        },
        zone,
      ),
    );
  }

  return slots.slice(0, items.length);
};

const buildModularEditorialSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const gap = clamp(Math.min(zone.width, zone.height) * 0.026, 10, 20);
  const heroWide = signature % 2 === 0;
  const heroBox: ImageSlot = heroWide
    ? {
        left: zone.left,
        top: zone.top,
        width: zone.width * 0.62,
        height: zone.height * 0.52,
        emphasis: (items[0]?.salience ?? 1) * 2.7,
        preferredShape: items[0]?.shape ?? "landscape",
      }
    : {
        left: zone.left + zone.width * 0.38,
        top: zone.top + zone.height * 0.04,
        width: zone.width * 0.34,
        height: zone.height * 0.62,
        emphasis: (items[0]?.salience ?? 1) * 2.7,
        preferredShape: items[0]?.shape ?? "portrait",
      };

  const secondaryZone: LayoutBox = heroWide
    ? {
        left: zone.left + heroBox.width + gap,
        top: zone.top,
        width: zone.width - heroBox.width - gap,
        height: zone.height * 0.52,
      }
    : {
        left: zone.left,
        top: zone.top,
        width: zone.width * 0.32,
        height: zone.height * 0.62,
      };

  const lowerZone: LayoutBox = heroWide
    ? {
        left: zone.left,
        top: zone.top + heroBox.height + gap,
        width: zone.width,
        height: zone.height - heroBox.height - gap,
      }
    : {
        left: zone.left,
        top: zone.top + zone.height * 0.68,
        width: zone.width,
        height: zone.height * 0.26,
      };

  const slots: ImageSlot[] = [heroBox];
  const secondary = buildRhythmicGridSlots(secondaryZone, Math.min(2, items.length - 1), signature + 101).map(
    (slot, index) => ({
      ...slot,
      emphasis: (items[index + 1]?.salience ?? 1) * 1.3,
      preferredShape: (items[index + 1]?.shape ?? "any") as ImageShape | "any",
    }),
  );
  const lower = buildRhythmicGridSlots(
    lowerZone,
    Math.max(0, items.length - 1 - secondary.length),
    signature + 107,
  ).map((slot, index) => ({
    ...slot,
    emphasis: (items[index + 1 + secondary.length]?.salience ?? 1) * 0.95,
    preferredShape: (items[index + 1 + secondary.length]?.shape ?? "any") as ImageShape | "any",
  }));
  slots.push(...secondary, ...lower);
  return slots.slice(0, items.length);
};

const buildSwissOffsetSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...zone, emphasis: items[0]?.salience ?? 1, preferredShape: items[0]?.shape ?? "any" }];
  }

  const cols = 4;
  const rows = 4;
  const gap = clamp(Math.min(zone.width, zone.height) * 0.022, 8, 18);
  const colWidth = (zone.width - gap * (cols - 1)) / cols;
  const rowHeight = (zone.height - gap * (rows - 1)) / rows;
  const heroOnRight = signature % 2 === 0;
  const heroBox: ImageSlot = {
    left: zone.left + (heroOnRight ? colWidth * 2 + gap * 2 : 0),
    top: zone.top,
    width: colWidth * 2 + gap,
    height: rowHeight * 3 + gap * 2,
    emphasis: (items[0]?.salience ?? 1) * 2.9,
    preferredShape: items[0]?.shape ?? "portrait",
  };
  const slots: ImageSlot[] = [heroBox];
  const freeZones: LayoutBox[] = heroOnRight
    ? [
        { left: zone.left, top: zone.top, width: colWidth * 2 + gap, height: rowHeight * 1.2 },
        { left: zone.left, top: zone.top + rowHeight * 1.4, width: colWidth * 2 + gap, height: rowHeight * 1.6 + gap },
        { left: zone.left, top: zone.top + rowHeight * 3.2 + gap * 2, width: zone.width, height: rowHeight * 0.8 },
      ]
    : [
        { left: zone.left + colWidth * 2 + gap * 2, top: zone.top, width: colWidth * 2 + gap, height: rowHeight * 1.2 },
        { left: zone.left + colWidth * 2 + gap * 2, top: zone.top + rowHeight * 1.4, width: colWidth * 2 + gap, height: rowHeight * 1.6 + gap },
        { left: zone.left, top: zone.top + rowHeight * 3.2 + gap * 2, width: zone.width, height: rowHeight * 0.8 },
      ];

  let cursor = 1;
  for (const freeZone of freeZones) {
    if (cursor >= items.length) break;
    const take = Math.min(items.length - cursor, freeZone.width > freeZone.height ? 2 : 1);
    const part = buildRhythmicGridSlots(freeZone, take, signature + 113 + cursor).map((slot, index) => ({
      ...slot,
      emphasis: (items[cursor + index]?.salience ?? 1) * 1.08,
      preferredShape: (items[cursor + index]?.shape ?? "any") as ImageShape | "any",
    }));
    slots.push(...part);
    cursor += take;
  }

  return slots.slice(0, items.length);
};

const buildOrbitCollageSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  const heroBox: ImageSlot = {
    left: zone.left + zone.width * 0.3,
    top: zone.top + zone.height * 0.18,
    width: zone.width * 0.34,
    height: zone.height * 0.48,
    emphasis: (items[0]?.salience ?? 1) * 2.8,
    preferredShape: items[0]?.shape ?? "portrait",
  };
  const slots: ImageSlot[] = [heroBox];
  const orbitCenterX = heroBox.left + heroBox.width / 2;
  const orbitCenterY = heroBox.top + heroBox.height / 2;

  for (let i = 1; i < items.length; i += 1) {
    const item = items[i];
    const angle = (((signature + i * 47) % 360) * Math.PI) / 180;
    const radiusX = zone.width * (0.18 + (i % 3) * 0.08);
    const radiusY = zone.height * (0.16 + (i % 2) * 0.06);
    const widthScale = i % 4 === 0 ? 1.18 : i % 3 === 0 ? 0.82 : 1;
    const width = zone.width * (item?.shape === "landscape" ? 0.14 : 0.1) * widthScale;
    const height = width / Math.max(0.55, Math.min(item?.aspectRatio ?? 1, 1.8));
    slots.push(
      clampImageSlotWithinZone(
        {
          ...boxFromCenter(
            orbitCenterX + Math.cos(angle) * radiusX,
            orbitCenterY + Math.sin(angle) * radiusY,
            width,
            height,
          ),
          emphasis: (item?.salience ?? 1) * (1 - i * 0.03),
          preferredShape: item?.shape ?? "any",
          rotationDelta: ((signature + i * 29) % 5) - 2,
        },
        zone,
      ),
    );
  }

  return slots.slice(0, items.length);
};

const buildEditorialSpreadCollageSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  const heroRight = signature % 2 === 0;
  const heroBox: ImageSlot = {
    left: heroRight ? zone.left + zone.width * 0.48 : zone.left + zone.width * 0.08,
    top: zone.top + zone.height * 0.1,
    width: zone.width * 0.38,
    height: zone.height * 0.6,
    emphasis: (items[0]?.salience ?? 1) * 3,
    preferredShape: items[0]?.shape ?? "portrait",
  };
  const mediumBox: ImageSlot | undefined =
    items.length >= 2
      ? {
          left: heroRight ? zone.left + zone.width * 0.18 : zone.left + zone.width * 0.54,
          top: zone.top + zone.height * 0.18,
          width: zone.width * 0.24,
          height: zone.height * 0.3,
          emphasis: (items[1]?.salience ?? 1) * 1.9,
          preferredShape: items[1]?.shape ?? "landscape",
        }
      : undefined;
  const textureBox: ImageSlot | undefined =
    items.length >= 3
      ? {
          left: heroRight ? zone.left + zone.width * 0.12 : zone.left + zone.width * 0.5,
          top: zone.top + zone.height * 0.54,
          width: zone.width * 0.28,
          height: zone.height * 0.22,
          emphasis: (items[2]?.salience ?? 1) * 1.5,
          preferredShape: items[2]?.shape ?? "landscape",
          rotationDelta: heroRight ? -4 : 4,
        }
      : undefined;

  const contactZone: LayoutBox = {
    left: heroRight ? zone.left + zone.width * 0.02 : zone.left + zone.width * 0.62,
    top: zone.top + zone.height * 0.02,
    width: zone.width * 0.24,
    height: zone.height * 0.56,
  };
  const contactSlots = buildScatteredAccentSlots(contactZone, items.slice(3), signature + 59).map(
    (slot, index) => ({
      ...slot,
      width: slot.width * (index % 3 === 0 ? 1.14 : 0.94),
      height: slot.height * (index % 3 === 0 ? 1.14 : 0.94),
    }),
  );

  return [heroBox, mediumBox, textureBox, ...contactSlots].filter(Boolean) as ImageSlot[];
};

const buildRunwayStoryboardSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  const heroTall = signature % 2 === 0;
  const heroBox: ImageSlot = {
    left: zone.left + (heroTall ? zone.width * 0.52 : zone.width * 0.12),
    top: zone.top + zone.height * 0.08,
    width: zone.width * 0.3,
    height: zone.height * 0.62,
    emphasis: (items[0]?.salience ?? 1) * 3,
    preferredShape: items[0]?.shape ?? "portrait",
  };
  const stripZone: LayoutBox = {
    left: heroTall ? zone.left + zone.width * 0.06 : zone.left + zone.width * 0.48,
    top: zone.top + zone.height * 0.06,
    width: zone.width * 0.28,
    height: zone.height * 0.68,
  };
  const stripSlots = buildScatteredAccentSlots(stripZone, items.slice(1, 1 + Math.ceil((items.length - 1) * 0.65)), signature + 73);
  const footerZone: LayoutBox = {
    left: zone.left + zone.width * 0.18,
    top: zone.top + zone.height * 0.72,
    width: zone.width * 0.46,
    height: zone.height * 0.18,
  };
  const footerSlots = buildScatteredAccentSlots(footerZone, items.slice(1 + Math.ceil((items.length - 1) * 0.65)), signature + 89).map(
    (slot, index) => ({
      ...slot,
      rotationDelta: index % 2 === 0 ? -2 : 2,
    }),
  );
  return [heroBox, ...stripSlots, ...footerSlots].slice(0, items.length);
};

const buildObjectSalonCollageSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  const heroLeft = signature % 2 === 0;
  const primary: ImageSlot = {
    left: heroLeft ? zone.left + zone.width * 0.08 : zone.left + zone.width * 0.46,
    top: zone.top + zone.height * 0.22,
    width: zone.width * 0.34,
    height: zone.height * 0.42,
    emphasis: (items[0]?.salience ?? 1) * 3,
    preferredShape: items[0]?.shape ?? "portrait",
  };
  const secondary: ImageSlot | undefined =
    items.length >= 2
      ? {
          left: heroLeft ? zone.left + zone.width * 0.46 : zone.left + zone.width * 0.14,
          top: zone.top + zone.height * 0.08,
          width: zone.width * 0.3,
          height: zone.height * 0.24,
          emphasis: (items[1]?.salience ?? 1) * 1.9,
          preferredShape: items[1]?.shape ?? "landscape",
        }
      : undefined;
  const base: ImageSlot | undefined =
    items.length >= 3
      ? {
          left: heroLeft ? zone.left + zone.width * 0.52 : zone.left + zone.width * 0.12,
          top: zone.top + zone.height * 0.58,
          width: zone.width * 0.26,
          height: zone.height * 0.18,
          emphasis: (items[2]?.salience ?? 1) * 1.5,
          preferredShape: items[2]?.shape ?? "landscape",
          rotationDelta: heroLeft ? 4 : -4,
        }
      : undefined;
  const beadZone: LayoutBox = {
    left: heroLeft ? zone.left + zone.width * 0.02 : zone.left + zone.width * 0.66,
    top: zone.top + zone.height * 0.04,
    width: zone.width * 0.18,
    height: zone.height * 0.72,
  };
  const beadSlots = buildScatteredAccentSlots(beadZone, items.slice(3), signature + 131).map((slot, index) => ({
    ...slot,
    width: slot.width * (index % 4 === 0 ? 0.78 : 0.62),
    height: slot.height * (index % 4 === 0 ? 0.78 : 0.62),
    rotationDelta: index % 2 === 0 ? 5 : -5,
  }));

  return [primary, secondary, base, ...beadSlots].filter(Boolean) as ImageSlot[];
};

const buildLayeredMaterialPanelSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  const columns = 5;
  const bandWidth = zone.width / columns;
  const slots: ImageSlot[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const band = i % columns;
    const stack = Math.floor(i / columns);
    const width = bandWidth * (stack % 2 === 0 ? 1.12 : 0.9);
    const height =
      zone.height *
      (item?.shape === "portrait" ? 0.56 : item?.shape === "landscape" ? 0.34 : 0.44) *
      (stack % 3 === 0 ? 1.08 : 0.9);
    const left = zone.left + band * bandWidth + (stack % 2 === 0 ? -bandWidth * 0.08 : bandWidth * 0.04);
    const top = zone.top + zone.height * 0.06 + stack * zone.height * 0.12 + (band % 2 === 0 ? 0 : zone.height * 0.03);
    slots.push(
      clampImageSlotWithinZone(
        {
          left,
          top,
          width,
          height,
          emphasis: (item?.salience ?? 1) * (1 - stack * 0.05),
          preferredShape: item?.shape ?? "any",
        },
        zone,
      ),
    );
  }

  return slots.slice(0, items.length);
};

const buildMaterialCatalogSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): ImageSlot[] => {
  if (items.length === 0) return [];
  const cols = items.length >= 12 ? 5 : items.length >= 8 ? 4 : 3;
  const gap = clamp(Math.min(zone.width, zone.height) * 0.024, 10, 18);
  const width = (zone.width - gap * (cols - 1)) / cols;
  const rows = Math.ceil(items.length / cols);
  const height = (zone.height - gap * (rows - 1)) / rows;
  const slots: ImageSlot[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const item = items[i];
    const inset = (i + signature) % 3 === 0 ? 0.08 : (i + signature) % 4 === 0 ? 0.14 : 0.11;
    const box: LayoutBox = {
      left: zone.left + col * (width + gap),
      top: zone.top + row * (height + gap),
      width,
      height,
    };
    const insetBoxed = shrinkBox(box, 1 - inset);
    slots.push({
      ...insetBoxed,
      emphasis: item?.salience ?? 1,
      preferredShape: item?.shape ?? "any",
      rotationDelta: col % 2 === 0 && row % 2 === 1 ? -2 : undefined,
    });
  }

  return slots;
};

// Match important images to prominent slots instead of relying on source order.
const assignImagesToSlots = (items: ImageItem[], slots: ImageSlot[]): ImageItem[] => {
  // Match higher-salience images into stronger slots rather than trusting source order.
  const remaining = [...items];
  const orderedSlots = [...slots].sort((a, b) => b.emphasis - a.emphasis);
  const assignments = new Map<ImageSlot, ImageItem>();

  for (const slot of orderedSlots) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      const item = remaining[i];
      if (!item) continue;

      const shapeMatch =
        slot.preferredShape === "any" || slot.preferredShape === item.shape ? 1 : 0;
      const areaFit =
        Math.min(slot.width * slot.height, item.area) / Math.max(slot.width * slot.height, item.area, 1);
      const score = item.salience * 0.7 + shapeMatch * 20000 + areaFit * 12000;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    if (picked) assignments.set(slot, picked);
  }

  return slots.map((slot) => assignments.get(slot)).filter(Boolean) as ImageItem[];
};

// Conservative image layout for standard business/editorial pages.
const buildConventionalImageSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): { slots: ImageSlot[]; styleName: string } => {
  const count = items.length;
  if (count <= 0) return { slots: [], styleName: "无图" };
  const gap = clamp(Math.min(zone.width, zone.height) * 0.026, 8, 18);
  const innerZone = insetBox(zone, Math.min(4, gap * 0.2));
  const guard = getImageLayoutGuard(count, zone);
  const variant = signature % 6;

  if (count === 1) {
    return {
      slots: [
        {
          ...innerZone,
          emphasis: items[0]?.salience ?? 1,
          preferredShape: items[0]?.shape ?? "any",
        },
      ],
      styleName: "单图展示",
    };
  }

  if (variant === 0 && count >= 3) {
    const heroWidth = innerZone.width * clamp(0.42 - (count - 3) * 0.015, 0.32, 0.42);
    const restZone: LayoutBox = {
      left: innerZone.left + heroWidth + gap,
      top: innerZone.top,
      width: innerZone.width - heroWidth - gap,
      height: innerZone.height,
    };
    const slots: ImageSlot[] = [
      {
        left: innerZone.left,
        top: innerZone.top,
        width: heroWidth,
        height: innerZone.height,
        emphasis: items[0]?.salience ?? 1,
        preferredShape: items[0]?.shape ?? "portrait",
      },
      ...buildSafeGridSlots(restZone, count - 1).map((slot, index) => ({
        ...slot,
        emphasis: items[index + 1]?.salience ?? 1,
        preferredShape: (items[index + 1]?.shape ?? "any") as ImageShape | "any",
      })),
    ];

    if (isValidImageLayout(slots, innerZone, guard)) {
      return { slots, styleName: "常规主图+网格" };
    }
  }

  if (variant === 1 && count >= 3) {
    const heroHeight = innerZone.height * clamp(0.4 - (count - 3) * 0.015, 0.3, 0.4);
    const restZone: LayoutBox = {
      left: innerZone.left,
      top: innerZone.top + heroHeight + gap,
      width: innerZone.width,
      height: innerZone.height - heroHeight - gap,
    };
    const slots: ImageSlot[] = [
      {
        left: innerZone.left,
        top: innerZone.top,
        width: innerZone.width,
        height: heroHeight,
        emphasis: items[0]?.salience ?? 1,
        preferredShape: items[0]?.shape ?? "landscape",
      },
      ...buildSafeGridSlots(restZone, count - 1).map((slot, index) => ({
        ...slot,
        emphasis: items[index + 1]?.salience ?? 1,
        preferredShape: (items[index + 1]?.shape ?? "any") as ImageShape | "any",
      })),
    ];

    if (isValidImageLayout(slots, innerZone, guard)) {
      return { slots, styleName: "常规横幅+网格" };
    }
  }

  const rhythmicSlots = buildRhythmicGridSlots(innerZone, count, signature).map((slot, index) => ({
    ...slot,
    emphasis: items[index]?.salience ?? 1,
    preferredShape: (items[index]?.shape ?? "any") as ImageShape | "any",
  }));
  if (isValidImageLayout(rhythmicSlots, innerZone, guard)) {
    return { slots: rhythmicSlots, styleName: "常规节奏网格" };
  }

  return {
    slots: buildSafeGridSlots(innerZone, count).map((slot, index) => ({
      ...slot,
      emphasis: items[index]?.salience ?? 1,
      preferredShape: (items[index]?.shape ?? "any") as ImageShape | "any",
    })),
    styleName: "常规安全网格",
  };
};

// Regular mode still needs hierarchy, but without any image overlaps.
const buildBalancedShowcaseSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
): { slots: ImageSlot[]; styleName: string } => {
  // "Regular" mode: hierarchy is allowed, but images must remain non-overlapping.
  const count = items.length;
  if (count <= 0) return { slots: [], styleName: "无图" };
  if (count === 1) {
    return {
      slots: [
        {
          ...zone,
          emphasis: items[0]?.salience ?? 1,
          preferredShape: items[0]?.shape ?? "any",
        },
      ],
      styleName: "常规单图展示",
    };
  }

  const gap = clamp(Math.min(zone.width, zone.height) * 0.026, 8, 18);
  const innerZone = insetBox(zone, Math.min(4, gap * 0.25));
  const guard = getImageLayoutGuard(count, zone);
  const hero = items[0];
  const heroPortrait = hero?.shape !== "landscape";
  const variant = signature % 8;

  if (variant === 0 && count >= 4) {
    const stepped = addCreativeTilt(
      buildSteppedShowcaseSlots(innerZone, items, signature + 5),
      innerZone,
      "regular",
      signature + 5,
    );
    if (isValidImageLayout(stepped, innerZone, guard)) {
      return { slots: stepped, styleName: "常规阶梯画廊" };
    }
  }

  if (variant === 1 && count >= 4) {
    const centered = addCreativeTilt(
      buildCenteredGallerySlots(innerZone, items, signature + 9),
      innerZone,
      "regular",
      signature + 9,
    );
    if (isValidImageLayout(centered, innerZone, guard)) {
      return { slots: centered, styleName: "常规中心画廊" };
    }
  }

  if (variant === 2 && count >= 4) {
    const diagonal = addCreativeTilt(
      buildDiagonalGallerySlots(innerZone, items, signature + 13),
      innerZone,
      "regular",
      signature + 13,
    );
    if (isValidImageLayout(diagonal, innerZone, guard)) {
      return { slots: diagonal, styleName: "常规斜向画廊" };
    }
  }

  if (variant === 3 && count >= 4) {
    const modular = addCreativeTilt(
      buildModularEditorialSlots(innerZone, items, signature + 17),
      innerZone,
      "regular",
      signature + 17,
    );
    if (isValidImageLayout(modular, innerZone, guard)) {
      return { slots: modular, styleName: "常规模块编辑版" };
    }
  }

  if (variant === 4 && count >= 4) {
    const swiss = addCreativeTilt(
      buildSwissOffsetSlots(innerZone, items, signature + 21),
      innerZone,
      "regular",
      signature + 21,
    );
    if (isValidImageLayout(swiss, innerZone, guard)) {
      return { slots: swiss, styleName: "常规瑞士偏移版" };
    }
  }

  if (variant === 5 && count >= 6) {
    const catalog = addCreativeTilt(
      buildMaterialCatalogSlots(innerZone, items, signature + 25),
      innerZone,
      "regular",
      signature + 25,
    );
    if (isValidImageLayout(catalog, innerZone, guard)) {
      return { slots: catalog, styleName: "常规材料目录版" };
    }
  }

  if (variant === 6 && count >= 6) {
    const layered = addCreativeTilt(
      buildLayeredMaterialPanelSlots(innerZone, items, signature + 29),
      innerZone,
      "regular",
      signature + 29,
    );
    if (isValidImageLayout(layered, innerZone, guard)) {
      return { slots: layered, styleName: "常规材质面板版" };
    }
  }

  if ((variant === 7 || heroPortrait) && count >= 4) {
    const heroWidth = innerZone.width * clamp(0.34 + count * 0.012, 0.36, 0.46);
    const heroHeight = innerZone.height * clamp(0.54 + count * 0.01, 0.56, 0.74);
    const heroOnRight = signature % 2 === 0;
    const heroTop = innerZone.top + (innerZone.height - heroHeight) * 0.5;
    const heroBox: LayoutBox = {
      left: heroOnRight ? innerZone.left + innerZone.width - heroWidth : innerZone.left,
      top: heroTop,
      width: heroWidth,
      height: heroHeight,
    };

    const stripZone: LayoutBox = {
      left: heroOnRight ? innerZone.left : heroBox.left + heroWidth + gap,
      top: innerZone.top,
      width: innerZone.width - heroWidth - gap,
      height: innerZone.height,
    };

    const topBandHeight = stripZone.height * 0.33;
    const topBand: ImageSlot[] = buildRhythmicGridSlots(
      {
        left: stripZone.left,
        top: stripZone.top,
        width: stripZone.width,
        height: topBandHeight,
      },
      Math.min(3, count - 1),
      signature + 7,
    ).map((slot, index) => ({
      ...slot,
      emphasis: (items[index + 1]?.salience ?? 1) * 1.05,
      preferredShape: (items[index + 1]?.shape ?? "any") as ImageShape | "any",
    }));
    const bottomCount = count - 1 - topBand.length;
    const bottomGrid: ImageSlot[] =
      bottomCount > 0
        ? buildRhythmicGridSlots(
            {
              left: stripZone.left,
              top: stripZone.top + topBandHeight + gap,
              width: stripZone.width,
              height: stripZone.height - topBandHeight - gap,
            },
            bottomCount,
            signature + 11,
          ).map((slot, index) => ({
            ...slot,
            emphasis: (items[index + 1 + topBand.length]?.salience ?? 1) * 0.9,
            preferredShape: (items[index + 1 + topBand.length]?.shape ?? "any") as
              | ImageShape
              | "any",
          }))
        : [];
    const slots: ImageSlot[] = [
      {
        ...heroBox,
        emphasis: (items[0]?.salience ?? 1) * 2.2,
        preferredShape: items[0]?.shape ?? "portrait",
      },
      ...topBand,
      ...bottomGrid,
    ];

    if (isValidImageLayout(slots, innerZone, guard)) {
      return { slots, styleName: "常规大图错落陈列" };
    }
  }

  return buildConventionalImageSlots(zone, items, signature);
};

// Inspiration mode can intentionally overlap images to create a moodboard collage.
const buildInspirationCollageSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
  theme: ThemeProfile,
): { slots: ImageSlot[]; styleName: string } => {
  // "Inspiration" mode: more layered and less rigid, but still driven by heuristics.
  const count = items.length;
  if (count <= 0) return { slots: [], styleName: "无图" };
  const gap = clamp(Math.min(zone.width, zone.height) * 0.02, 8, 18);
  const innerZone = insetBox(zone, Math.min(6, gap * 0.25));
  const heroLeft = signature % 2 === 0;
  const slots: ImageSlot[] = [];
  const variant = signature % 3;
  const maxPairs = Math.max(1, Math.floor(count * 0.7));

  if (count === 1) {
    return {
      slots: [
        {
          ...innerZone,
          emphasis: items[0]?.salience ?? 1,
          preferredShape: items[0]?.shape ?? "any",
        },
      ],
      styleName: "灵感单图主视觉",
    };
  }

  const clustered = buildClusteredMosaicSlots(innerZone, items, signature + 3, theme);
  if (
    variant === 0 &&
    isControlledCollageLayout(
      addCreativeTilt(clustered, innerZone, "inspiration", signature + 3),
      innerZone,
      0.16,
      maxPairs,
    )
  ) {
    return {
      slots: addCreativeTilt(clustered, innerZone, "inspiration", signature + 3),
      styleName: "灵感簇状拼贴",
    };
  }

  const ribbon = buildRibbonCollageSlots(innerZone, items, signature + 7);
  if (
    variant === 1 &&
    isControlledCollageLayout(
      addCreativeTilt(ribbon, innerZone, "inspiration", signature + 7),
      innerZone,
      0.14,
      Math.max(1, count - 2),
    )
  ) {
    return {
      slots: addCreativeTilt(ribbon, innerZone, "inspiration", signature + 7),
      styleName: "灵感飘带拼贴",
    };
  }

  const orbit = buildOrbitCollageSlots(innerZone, items, signature + 19);
  if (
    variant === 2 &&
    isControlledCollageLayout(
      addCreativeTilt(orbit, innerZone, "inspiration", signature + 19),
      innerZone,
      0.12,
      Math.max(1, count - 3),
    )
  ) {
    return {
      slots: addCreativeTilt(orbit, innerZone, "inspiration", signature + 19),
      styleName: "灵感环绕拼贴",
    };
  }

  const spread = buildEditorialSpreadCollageSlots(innerZone, items, signature + 23);
  if (
    variant === 3 &&
    isControlledCollageLayout(
      addCreativeTilt(spread, innerZone, "inspiration", signature + 23),
      innerZone,
      0.14,
      Math.max(1, count - 3),
    )
  ) {
    return {
      slots: addCreativeTilt(spread, innerZone, "inspiration", signature + 23),
      styleName: "灵感时尚跨页",
    };
  }

  const storyboard = buildRunwayStoryboardSlots(innerZone, items, signature + 29);
  if (
    variant === 4 &&
    isControlledCollageLayout(
      addCreativeTilt(storyboard, innerZone, "inspiration", signature + 29),
      innerZone,
      0.14,
      Math.max(1, count - 3),
    )
  ) {
    return {
      slots: addCreativeTilt(storyboard, innerZone, "inspiration", signature + 29),
      styleName: "灵感秀场分镜",
    };
  }

  const salon = buildObjectSalonCollageSlots(innerZone, items, signature + 37);
  if (
    variant === 5 &&
    isControlledCollageLayout(
      addCreativeTilt(salon, innerZone, "inspiration", signature + 37),
      innerZone,
      0.16,
      Math.max(1, count - 3),
    )
  ) {
    return {
      slots: addCreativeTilt(salon, innerZone, "inspiration", signature + 37),
      styleName: "灵感物件沙龙",
    };
  }

  const backgroundCandidate = [...items].sort(
    (a, b) => scoreBackgroundCandidate(b, theme) - scoreBackgroundCandidate(a, theme),
  )[0];
  if (backgroundCandidate) {
    // Deepest visual layer. Currently this is still a rect, not a true cutout / masked shape.
    slots.push({
      left: heroLeft ? innerZone.left + innerZone.width * 0.48 : innerZone.left + innerZone.width * 0.02,
      top: innerZone.top + innerZone.height * 0.04,
      width: innerZone.width * (backgroundCandidate.shape === "portrait" ? 0.3 : 0.44),
      height: innerZone.height * (backgroundCandidate.shape === "portrait" ? 0.44 : 0.6),
      emphasis: scoreBackgroundCandidate(backgroundCandidate, theme),
      preferredShape: backgroundCandidate.shape,
    });
  }

  const heroWidth = innerZone.width * 0.34;
  const heroHeight = innerZone.height * 0.7;
  const heroBox: ImageSlot = {
    left: heroLeft ? innerZone.left + innerZone.width * 0.5 : innerZone.left + innerZone.width * 0.16,
    top: innerZone.top + innerZone.height * 0.18,
    width: heroWidth,
    height: heroHeight,
    emphasis: (items[0]?.salience ?? 1) * 2.8,
    preferredShape: "portrait",
  };
  slots.push(heroBox);

  if (count >= 2) {
    const secondaryWidth = innerZone.width * 0.24;
    const secondaryHeight = innerZone.height * 0.42;
    slots.push({
      left: heroLeft ? innerZone.left + innerZone.width * 0.34 : innerZone.left + innerZone.width * 0.58,
      top: innerZone.top,
      width: secondaryWidth,
      height: secondaryHeight,
      emphasis: (items[1]?.salience ?? 1) * 1.7,
      preferredShape: items[1]?.shape ?? "portrait",
    });
  }

  if (count >= 3) {
    const anchorWidth = innerZone.width * 0.28;
    const anchorHeight = innerZone.height * 0.28;
    slots.push({
      left: heroLeft ? innerZone.left + innerZone.width * 0.16 : innerZone.left + innerZone.width * 0.44,
      top: innerZone.top + innerZone.height * 0.58,
      width: anchorWidth,
      height: anchorHeight,
      emphasis: (items[2]?.salience ?? 1) * 1.4,
      preferredShape: items[2]?.shape ?? "landscape",
    });
  }

  const oppositeZone: LayoutBox = {
    left: innerZone.left,
    top: innerZone.top + innerZone.height * 0.02,
    width: innerZone.width * 0.52,
    height: innerZone.height * 0.52,
  };
  const tailItems = items.slice(3);
  const smallSlots = buildMasonrySlots(oppositeZone, tailItems, signature + 13);
  const shiftedSmallSlots = smallSlots.map((slot, index) => {
    // When many assets are similarly sized, deliberately break the rhythm so the collage
    // does not collapse into a uniform grid.
    const item = tailItems[index];
    const prev = tailItems[Math.max(0, index - 1)];
    const similarToNeighbor = item && prev ? isSimilarArea(item, prev) : false;
    const variance = similarToNeighbor
      ? 1 + (((signature + index * 17) % 3) - 1) * 0.22
      : 1 + (((signature + index * 11) % 3) - 1) * 0.1;
    const variedWidth = slot.width * variance;
    const variedHeight = slot.height * variance;
    return clampImageSlotWithinZone({
      ...slot,
      left:
        slot.left +
        (index % 2 === 0 ? -gap * 0.18 : gap * 0.12) -
        (variedWidth - slot.width) * 0.5,
      top:
        slot.top +
        (index % 3 === 0 ? gap * 0.14 : index % 3 === 1 ? -gap * 0.05 : gap * 0.08) -
        (variedHeight - slot.height) * 0.35,
      width: variedWidth,
      height: variedHeight,
      emphasis: slot.emphasis * (similarToNeighbor ? 0.95 : 0.82),
    }, innerZone);
  });
  slots.push(...shiftedSmallSlots);

  if (isControlledCollageLayout(slots.slice(0, count), innerZone, 0.18, maxPairs)) {
    return { slots: slots.slice(0, count), styleName: "灵感艺术拼贴" };
  }

  const tiltedClustered = addCreativeTilt(clustered, innerZone, "inspiration", signature + 3);
  if (isControlledCollageLayout(tiltedClustered, innerZone, 0.16, maxPairs)) {
    return { slots: tiltedClustered, styleName: "灵感簇状拼贴" };
  }

  const tiltedRibbon = addCreativeTilt(ribbon, innerZone, "inspiration", signature + 7);
  if (isControlledCollageLayout(tiltedRibbon, innerZone, 0.14, Math.max(1, count - 2))) {
    return { slots: tiltedRibbon, styleName: "灵感飘带拼贴" };
  }

  const tiltedOrbit = addCreativeTilt(orbit, innerZone, "inspiration", signature + 19);
  if (isControlledCollageLayout(tiltedOrbit, innerZone, 0.12, Math.max(1, count - 3))) {
    return { slots: tiltedOrbit, styleName: "灵感环绕拼贴" };
  }

  const tiltedSpread = addCreativeTilt(spread, innerZone, "inspiration", signature + 23);
  if (isControlledCollageLayout(tiltedSpread, innerZone, 0.14, Math.max(1, count - 3))) {
    return { slots: tiltedSpread, styleName: "灵感时尚跨页" };
  }

  const tiltedStoryboard = addCreativeTilt(storyboard, innerZone, "inspiration", signature + 29);
  if (isControlledCollageLayout(tiltedStoryboard, innerZone, 0.14, Math.max(1, count - 3))) {
    return { slots: tiltedStoryboard, styleName: "灵感秀场分镜" };
  }

  const tiltedSalon = addCreativeTilt(salon, innerZone, "inspiration", signature + 37);
  if (isControlledCollageLayout(tiltedSalon, innerZone, 0.16, Math.max(1, count - 3))) {
    return { slots: tiltedSalon, styleName: "灵感物件沙龙" };
  }

  return { slots: slots.slice(0, count), styleName: "灵感艺术拼贴" };
};

// Create non-overlapping rows with varied card widths/heights for editorial rhythm.
const buildRhythmicGridSlots = (
  zone: LayoutBox,
  count: number,
  signature: number,
): LayoutBox[] => {
  if (count <= 0) return [];
  if (count === 1) return [{ ...zone }];

  const gap = clamp(Math.min(zone.width, zone.height) * 0.026, 8, 20);
  const rows =
    count <= 2 ? 1 : count <= 5 ? 2 : count <= 8 ? 3 : 4;
  const rowCounts = new Array(rows).fill(Math.floor(count / rows));

  for (let i = 0; i < count % rows; i += 1) {
    rowCounts[i] += 1;
  }

  const heightSeeds = [1.16, 0.9, 1.08, 0.86];
  const rowWeights = rowCounts.map(
    (_, index) => heightSeeds[(index + signature) % heightSeeds.length] ?? 1,
  );
  const totalRowWeight = rowWeights.reduce((sum, weight) => sum + weight, 0);
  const usableHeight = zone.height - gap * (rows - 1);
  const rowHeights = rowWeights.map((weight) => (usableHeight * weight) / totalRowWeight);

  const slots: LayoutBox[] = [];
  let y = zone.top;

  for (let row = 0; row < rows; row += 1) {
    const itemCount = rowCounts[row];
    const widthSeeds = [1.28, 0.84, 1.08, 0.92, 1.16];
    const widths = new Array(itemCount).fill(0).map((_, index) => {
      return widthSeeds[(index + row + signature) % widthSeeds.length] ?? 1;
    });
    const totalWidthWeight = widths.reduce((sum, weight) => sum + weight, 0);
    const usableWidth = zone.width - gap * (itemCount - 1);
    let x = zone.left;

    for (let col = 0; col < itemCount; col += 1) {
      const widthWeight = widths[col] ?? 1;
      const width = (usableWidth * widthWeight) / totalWidthWeight;
      slots.push({
        left: x,
        top: y,
        width,
        height: rowHeights[row] ?? usableHeight,
      });
      x += width + gap;
    }

    y += (rowHeights[row] ?? usableHeight) + gap;
  }

  return slots.slice(0, count);
};

// Read rich text regions with fallback region.
const readTextRegions = (textElement: any): any[] => {
  if (!textElement?.text?.readTextRegions) return [{ text: "", formatting: {} }];
  const regions = textElement.text.readTextRegions();
  return Array.isArray(regions) && regions.length > 0
    ? regions
    : [{ text: "", formatting: {} }];
};

// Max font size in a text element, used for importance scoring.
const maxFontSize = (regions: any[]): number => {
  return regions.reduce((max: number, region: any) => {
    const current = safeNumber(region?.formatting?.fontSize, 18);
    return Math.max(max, current);
  }, 18);
};

// Uniformly scale font sizes while preserving other formatting.
const scaleTextRegions = (regions: any[], scale: number): any[] => {
  return regions.map((region: any) => {
    const fontSize = region?.formatting?.fontSize;
    const scaledFont =
      typeof fontSize === "number"
        ? clamp(Math.round(fontSize * scale), 8, 120)
        : undefined;

    return {
      text: String(region?.text ?? ""),
      formatting:
        scaledFont === undefined
          ? { ...(region?.formatting ?? {}) }
          : { ...(region?.formatting ?? {}), fontSize: scaledFont },
    };
  });
};

// Rough but stable text height estimation for flow layout (no DOM measurement).
const estimateTextHeight = (
  item: TextItem,
  width: number,
  scale: number,
): number => {
  const text = item.plain.trim();
  if (!text) return 20;

  const fontSize = Math.max(8, item.baseFont * scale);
  // Bias high on height so recreated Canva text does not spill into the next block.
  const approxCharsPerLine = Math.max(4, Math.floor(width / (fontSize * 0.34)));
  const paragraphs = item.plain.replace(/\r/g, "").split("\n");
  const lines = paragraphs.reduce((sum, paragraph) => {
    const normalized = paragraph.trim();
    if (!normalized) {
      return sum + 1.15;
    }
    return sum + Math.max(1, Math.ceil(normalized.length / approxCharsPerLine));
  }, 0);

  const flowEstimate = Math.max(30, lines * fontSize * 2.02 + 34);
  const widthRatio = item.baseWidth > 0 ? item.baseWidth / Math.max(width, 1) : 1;
  const boxEstimate =
    item.baseHeight *
    Math.max(0.72, scale) *
    Math.pow(clamp(widthRatio, 0.45, 4.5), 0.92) *
    (1 + item.blankLineCount * 0.16);

  return Math.max(flowEstimate, boxEstimate);
};

// Convert existing rect fill into builder-compatible options.
const getRectFillOpts = (element: any): any | undefined => {
  const media = element?.fill?.mediaContainer?.ref;
  const color = element?.fill?.colorContainer?.ref;

  const mediaContainer =
    media?.type === "image"
      ? {
          type: "image",
          imageRef: media.imageRef,
          flipX: media.flipX,
          flipY: media.flipY,
        }
      : media?.type === "video"
        ? {
            type: "video",
            videoRef: media.videoRef,
            flipX: media.flipX,
            flipY: media.flipY,
          }
        : undefined;

  const colorContainer =
    color?.type === "solid"
      ? {
          type: "solid",
          color: color.color,
        }
      : undefined;

  if (mediaContainer && colorContainer) return { mediaContainer, colorContainer };
  if (mediaContainer) return { mediaContainer };
  if (colorContainer) return { colorContainer };
  return undefined;
};

const resetImageViewBoxIfPossible = (element: any): void => {
  // Some Canva image-rects keep internal crop/viewBox state separate from outer geometry.
  // When the SDK exposes it, reset to the full box so rebuilds do not inherit a stale crop.
  const viewBox = element?.viewBox;
  if (!viewBox?.set) return;

  const width = safeNumber(element.width, 0);
  const height = safeNumber(element.height, 0);
  if (width <= 0 || height <= 0) return;

  try {
    viewBox.set({
      left: 0,
      top: 0,
      width,
      height,
    });
  } catch (_error) {
    // Best-effort only. Some rect/image elements do not expose editable viewBox state.
  }
};

// Preserve stroke when recreating image rect elements.
const getStrokeOpts = (element: any): any | undefined => {
  const strokeColor = element?.stroke?.colorContainer?.ref;
  const strokeWeight = safeNumber(element?.stroke?.weight, 0);
  if (strokeColor?.type !== "solid" || strokeWeight <= 0) return undefined;

  return {
    weight: strokeWeight,
    colorContainer: {
      type: "solid",
      color: strokeColor.color,
    },
  };
};

// Build text ranking features (length/font/position importance).
const buildTextItems = (texts: any[]): TextItem[] => {
  return [...texts]
    .sort((a, b) => {
      const topDelta = safeNumber(a.top, 0) - safeNumber(b.top, 0);
      if (topDelta !== 0) return topDelta;
      return safeNumber(a.left, 0) - safeNumber(b.left, 0);
    })
    .map((textEl) => {
      const regions = readTextRegions(textEl);
      const plain = textEl?.text?.readPlaintext
        ? String(textEl.text.readPlaintext() ?? "")
        : "";
      const box = getBox(textEl);
      const rawLines = plain.replace(/\r/g, "").split("\n");
      const length = plain.trim().length;
      const baseFont = maxFontSize(regions);
      const topBonus = clamp(320 - safeNumber(textEl.top, 0), 0, 320) / 32;
      const shortBonus = length > 0 && length <= 90 ? 5 : length <= 180 ? 2 : 0;
      const importance = baseFont * 2 + topBonus + shortBonus;

      return {
        element: textEl,
        plain,
        regions,
        baseFont,
        length,
        importance,
        baseWidth: box.width,
        baseHeight: box.height,
        lineCount: rawLines.length,
        blankLineCount: rawLines.filter((line) => line.trim().length === 0).length,
      };
    });
};

// Decide global text/image zone split first (before element-level layout).
const chooseZoneLayout = (
  contentZone: LayoutBox,
  hasText: boolean,
  hasImages: boolean,
  signature: number,
  textDensity: number,
  imageCount: number,
  layoutMode: LayoutMode,
): ZoneLayout => {
  // First split page-level text/image zones, then compute element-level placement inside each zone.
  const heavyText = textDensity >= 0.18;

  if (!hasText && hasImages) {
    return {
      textZone: { ...contentZone },
      imageZone: { ...contentZone },
      templateName: "纯图片",
      orientation: "single",
    };
  }

  if (hasText && !hasImages) {
    return {
      textZone: { ...contentZone },
      imageZone: { ...contentZone },
      templateName: "纯文字",
      orientation: "single",
    };
  }

  if (layoutMode === "regular" && hasText && hasImages) {
    // Regular mode keeps information clear, but images should still occupy more area than text.
    const gap = clamp(contentZone.width * 0.03, 18, 32);
    if (heavyText) {
      const textHeight = contentZone.height * clamp(0.26 + textDensity * 0.12, 0.28, 0.36);
      return {
        textZone: {
          left: contentZone.left,
          top: contentZone.top + contentZone.height - textHeight,
          width: contentZone.width,
          height: textHeight,
        },
        imageZone: {
          left: contentZone.left,
          top: contentZone.top,
          width: contentZone.width,
          height: contentZone.height - textHeight - gap,
        },
        templateName: "常规图片上 / 宽底文区",
        orientation: "stack",
      };
    }
    const textWidth = contentZone.width * clamp(0.24 + textDensity * 0.08, 0.24, 0.34);
    return {
      textZone: {
        left: contentZone.left,
        top: contentZone.top,
        width: textWidth,
        height: contentZone.height,
      },
      imageZone: {
        left: contentZone.left + textWidth + gap,
        top: contentZone.top,
        width: contentZone.width - textWidth - gap,
        height: contentZone.height,
      },
      templateName: "常规文字组 / 图片列",
      orientation: "side",
    };
  }

  if (layoutMode === "inspiration" && hasText && hasImages) {
    // Inspiration mode keeps text tighter so the collage, not the caption, dominates the page.
    const gap = clamp(contentZone.width * 0.025, 14, 28);
    if (heavyText) {
      const captionHeight = contentZone.height * clamp(0.2 + textDensity * 0.12, 0.22, 0.3);
      return {
        textZone: {
          left: contentZone.left + contentZone.width * 0.08,
          top: contentZone.top + contentZone.height - captionHeight,
          width: contentZone.width * 0.84,
          height: captionHeight,
        },
        imageZone: {
          left: contentZone.left,
          top: contentZone.top,
          width: contentZone.width,
          height: contentZone.height - captionHeight - gap,
        },
        templateName: "灵感拼贴 / 底部说明带",
        orientation: "stack",
      };
    }
    const captionWidth = contentZone.width * clamp(0.14 + textDensity * 0.035, 0.14, 0.2);
    const captionHeight = contentZone.height * clamp(0.14 + textDensity * 0.08, 0.14, 0.26);
    return {
      textZone: {
        left: contentZone.left + contentZone.width - captionWidth,
        top: contentZone.top,
        width: captionWidth,
        height: captionHeight,
      },
      imageZone: {
        left: contentZone.left,
        top: contentZone.top,
        width: contentZone.width - captionWidth - gap,
        height: contentZone.height,
      },
      templateName: "灵感拼贴 / 右上说明",
      orientation: "side",
    };
  }

  const gap = clamp(contentZone.width * 0.03, 18, 40);
  const isLandscape = contentZone.width >= contentZone.height;
  const imageGuard = getImageLayoutGuard(imageCount, contentZone);
  const imageBias = layoutMode === "inspiration" ? 0.08 : -0.02;
  const maxTextShare = clamp(1 - imageGuard.imageShare - imageBias, 0.28, 0.68);

  if (isLandscape) {
    const style = signature % 3;
    const textRatio = clamp(0.42 + textDensity * 0.1, 0.3, maxTextShare);

    if (style === 0) {
      const textWidth = (contentZone.width - gap) * textRatio;
      return {
        textZone: {
          left: contentZone.left,
          top: contentZone.top,
          width: textWidth,
          height: contentZone.height,
        },
        imageZone: {
          left: contentZone.left + textWidth + gap,
          top: contentZone.top,
          width: contentZone.width - textWidth - gap,
          height: contentZone.height,
        },
        templateName: "文字左 / 图片右",
        orientation: "side",
      };
    }

    if (style === 1) {
      const imageWidth = (contentZone.width - gap) * (1 - textRatio);
      return {
        imageZone: {
          left: contentZone.left,
          top: contentZone.top,
          width: imageWidth,
          height: contentZone.height,
        },
        textZone: {
          left: contentZone.left + imageWidth + gap,
          top: contentZone.top,
          width: contentZone.width - imageWidth - gap,
          height: contentZone.height,
        },
        templateName: "图片左 / 文字右",
        orientation: "side",
      };
    }

    const textHeight = (contentZone.height - gap) * clamp(0.38 + textDensity * 0.16, 0.28, maxTextShare);
    return {
      textZone: {
        left: contentZone.left,
        top: contentZone.top,
        width: contentZone.width,
        height: textHeight,
      },
      imageZone: {
        left: contentZone.left,
        top: contentZone.top + textHeight + gap,
        width: contentZone.width,
        height: contentZone.height - textHeight - gap,
      },
      templateName: "文字上 / 图片下",
      orientation: "stack",
    };
  }

  const style = signature % 2;
  const textHeight = (contentZone.height - gap) * clamp(0.42 + textDensity * 0.14, 0.3, maxTextShare);

  if (style === 0) {
    return {
      textZone: {
        left: contentZone.left,
        top: contentZone.top,
        width: contentZone.width,
        height: textHeight,
      },
      imageZone: {
        left: contentZone.left,
        top: contentZone.top + textHeight + gap,
        width: contentZone.width,
        height: contentZone.height - textHeight - gap,
      },
      templateName: "竖版文字上",
      orientation: "stack",
    };
  }

  const imageHeight = contentZone.height - textHeight - gap;
  return {
    imageZone: {
      left: contentZone.left,
      top: contentZone.top,
      width: contentZone.width,
      height: imageHeight,
    },
    textZone: {
      left: contentZone.left,
      top: contentZone.top + imageHeight + gap,
      width: contentZone.width,
      height: textHeight,
    },
    templateName: "竖版图片上",
    orientation: "stack",
  };
};

// Generate editorial-like image slots (hero/offset/grid variants).
const buildEditorialSlots = (
  zone: LayoutBox,
  items: ImageItem[],
  signature: number,
  theme: ThemeProfile,
): { slots: LayoutBox[]; styleName: string } => {
  const count = items.length;
  if (count <= 0) return { slots: [], styleName: "无图" };
  const gap = clamp(Math.min(zone.width, zone.height) * 0.03, 10, 24);
  const guard = getImageLayoutGuard(count, zone);
  const innerZone = insetBox(zone, Math.min(6, gap * 0.25));

  if (count === 1) {
    return { slots: [innerZone], styleName: "单图主视觉" };
  }

  const portraitRatio =
    items.filter((item) => item.shape === "portrait").length / Math.max(items.length, 1);
  const mixedShapes = new Set(items.map((item) => item.shape)).size >= 2;
  const variant = signature % 4;

  if ((theme.fashion || theme.editorial) && portraitRatio >= 0.45) {
    const cascadeSlots = buildHeroCascadeSlots(innerZone, items, signature);
    if (isValidImageLayout(cascadeSlots, innerZone, guard)) {
      return {
        slots: cascadeSlots,
        styleName: theme.palette ? "时装色板拼版" : "时装主视觉拼版",
      };
    }
  }

  if ((theme.moodboard || theme.palette || mixedShapes) && count >= 5) {
    const heroCascade = buildHeroCascadeSlots(innerZone, items, signature + 1);
    if (isValidImageLayout(heroCascade, innerZone, guard)) {
      return { slots: heroCascade, styleName: "情绪板拼贴" };
    }
  }

  if (variant === 0) {
    if (innerZone.width >= innerZone.height) {
      const heroWidth = innerZone.width * clamp(0.58 - (count - 2) * 0.03, 0.42, 0.58);
      const restZone: LayoutBox = {
        left: innerZone.left + heroWidth + gap,
        top: innerZone.top,
        width: innerZone.width - heroWidth - gap,
        height: innerZone.height,
      };
      const slots: ImageSlot[] = [
        {
          left: innerZone.left,
          top: innerZone.top,
          width: heroWidth,
          height: innerZone.height,
          emphasis: items[0]?.salience ?? 1,
          preferredShape: items[0]?.shape ?? "any",
        },
        ...buildRhythmicGridSlots(restZone, count - 1, signature).map((slot) => ({
          ...slot,
          emphasis: slot.width * slot.height,
          preferredShape: "any" as const,
        })),
      ];

      if (isValidImageLayout(slots, innerZone, guard)) {
        return { slots: slots.slice(0, count), styleName: "主图+侧栏拼贴" };
      }
    }

    const heroHeight = innerZone.height * clamp(0.56 - (count - 2) * 0.025, 0.4, 0.56);
    const restZone: LayoutBox = {
      left: innerZone.left,
      top: innerZone.top + heroHeight + gap,
      width: innerZone.width,
      height: innerZone.height - heroHeight - gap,
    };
    const slots: ImageSlot[] = [
      {
        left: innerZone.left,
        top: innerZone.top,
        width: innerZone.width,
        height: heroHeight,
        emphasis: items[0]?.salience ?? 1,
        preferredShape: items[0]?.shape ?? "any",
      },
      ...buildRhythmicGridSlots(restZone, count - 1, signature).map((slot) => ({
        ...slot,
        emphasis: slot.width * slot.height,
        preferredShape: "any" as const,
      })),
    ];

    if (isValidImageLayout(slots, innerZone, guard)) {
      return { slots: slots.slice(0, count), styleName: "主图+底栏拼贴" };
    }
  }

  if (variant === 1) {
    const heroWidth = innerZone.width * clamp(0.5 - (count - 3) * 0.02, 0.36, 0.5);
    const heroHeight = innerZone.height * clamp(0.5 - (count - 3) * 0.02, 0.34, 0.5);
    const heroOnRight = signature % 2 === 0;
    const heroLeft = heroOnRight ? innerZone.left + innerZone.width - heroWidth : innerZone.left;
    const heroTop = innerZone.top;
    const heroBox: ImageSlot = {
      left: heroLeft,
      top: heroTop,
      width: heroWidth,
      height: heroHeight,
      emphasis: items[0]?.salience ?? 1,
      preferredShape: items[0]?.shape ?? "any",
    };

    const remainingZone: LayoutBox =
      innerZone.width >= innerZone.height
        ? {
            left: heroOnRight ? innerZone.left : innerZone.left + heroWidth + gap,
            top: innerZone.top,
            width: innerZone.width - heroWidth - gap,
            height: innerZone.height,
          }
        : {
            left: innerZone.left,
            top: innerZone.top + heroHeight + gap,
            width: innerZone.width,
            height: innerZone.height - heroHeight - gap,
          };

    const slots: ImageSlot[] = [
      heroBox,
      ...buildRhythmicGridSlots(remainingZone, count - 1, signature + 1).map((slot) => ({
        ...slot,
        emphasis: slot.width * slot.height,
        preferredShape: "any" as const,
      })),
    ];
    if (isValidImageLayout(slots, innerZone, guard)) {
      return { slots: slots.slice(0, count), styleName: "主图错落拼贴" };
    }
  }

  const rhythmicSlots: ImageSlot[] = buildRhythmicGridSlots(innerZone, count, signature + 2).map(
    (slot) => ({
      ...slot,
      emphasis: slot.width * slot.height,
      preferredShape: "any",
    }),
  );
  if (isValidImageLayout(rhythmicSlots, innerZone, guard)) {
    return { slots: rhythmicSlots, styleName: "节奏拼贴" };
  }

  return { slots: buildSafeGridSlots(innerZone, count), styleName: "安全平铺网格" };
};

// Flow body text through one or two columns; return placement boxes + scale.
const layoutBodyTextFlow = (
  items: TextItem[],
  zone: LayoutBox,
  layoutMode: LayoutMode,
): {
  scale: number;
  columns: number;
  boxes: LayoutBox[];
  complete: boolean;
} => {
  // Body text is solved after the page zones are known.
  if (items.length === 0) {
    return { scale: 1, columns: 1, boxes: [], complete: true };
  }

  const maxColumns =
    zone.width > 820
      ? 2
      : layoutMode === "inspiration" && zone.width > 560 && items.length >= 4
        ? 2
        : 1;
  const minScale = layoutMode === "regular" ? 0.48 : 0.38;

  for (let columns = maxColumns; columns >= 1; columns -= 1) {
    const columnGap = columns > 1 ? clamp(zone.width * 0.03, 14, 28) : 0;
    const columnWidth = (zone.width - columnGap * (columns - 1)) / columns;

    for (let scale = 1.0; scale >= minScale; scale -= 0.04) {
      const spacing = clamp(zone.height * 0.024, 14, 28);
      const boxes: LayoutBox[] = [];
      let columnIndex = 0;
      let y = zone.top;
      let complete = true;

      for (const item of items) {
        const height = estimateTextHeight(item, columnWidth, scale);

        while (y + height > zone.top + zone.height && columnIndex < columns - 1) {
          columnIndex += 1;
          y = zone.top;
        }

        if (y + height > zone.top + zone.height) {
          complete = false;
          break;
        }

        const left = zone.left + columnIndex * (columnWidth + columnGap);
        boxes.push({ left, top: y, width: columnWidth, height });
        y += height + spacing;
      }

      if (complete && boxes.length === items.length) {
        return { scale, columns, boxes, complete: true };
      }
    }
  }

  return { scale: minScale, columns: 1, boxes: [], complete: false };
};

const resolveTextLayout = (
  split: { title?: TextItem; subtitle?: TextItem; body: TextItem[] },
  textZone: LayoutBox,
  layoutMode: LayoutMode,
): {
  titleScale: number;
  subtitleScale: number;
  titleHeight: number;
  subtitleHeight: number;
  headerGap: number;
  bodyZone: LayoutBox;
  bodyFlow: {
    scale: number;
    columns: number;
    boxes: LayoutBox[];
    complete: boolean;
  };
} => {
  // Jointly solve title / subtitle / body scale. If they do not fit together, shrink them together.
  const titleBase =
    split.title === undefined ? 1 : layoutMode === "regular" ? 0.98 : 0.82;
  const subtitleBase = layoutMode === "regular" ? 0.88 : 0.8;

  for (let titleScale = titleBase; titleScale >= 0.5; titleScale -= 0.04) {
    for (let subtitleScale = subtitleBase; subtitleScale >= 0.5; subtitleScale -= 0.04) {
      const titleHeight = split.title
        ? estimateTextHeight(split.title, textZone.width, titleScale)
        : 0;
      const subtitleHeight = split.subtitle
        ? estimateTextHeight(split.subtitle, textZone.width, subtitleScale)
        : 0;
      const headerGap =
        split.title || split.subtitle ? clamp(textZone.height * 0.04, 22, 40) : 0;
      const headerTotal =
        titleHeight + subtitleHeight + (split.title && split.subtitle ? headerGap : 0);
      const bodyZone: LayoutBox = {
        left: textZone.left,
        top: textZone.top + headerTotal + (split.body.length > 0 ? headerGap : 0),
        width: textZone.width,
        height: Math.max(24, textZone.height - headerTotal - (split.body.length > 0 ? headerGap : 0)),
      };
      const bodyFlow = layoutBodyTextFlow(split.body, bodyZone, layoutMode);

      if (bodyFlow.complete) {
        return {
          titleScale,
          subtitleScale,
          titleHeight,
          subtitleHeight,
          headerGap,
          bodyZone,
          bodyFlow,
        };
      }
    }
  }

  const fallbackHeaderGap = clamp(textZone.height * 0.022, 10, 20);
  const fallbackBodyZone: LayoutBox = {
    left: textZone.left,
    top: textZone.top + fallbackHeaderGap,
    width: textZone.width,
    height: Math.max(24, textZone.height - fallbackHeaderGap),
  };

  return {
    titleScale: 0.62,
    subtitleScale: 0.58,
    titleHeight: split.title
      ? estimateTextHeight(split.title, textZone.width, 0.62)
      : 0,
    subtitleHeight: split.subtitle
      ? estimateTextHeight(split.subtitle, textZone.width, 0.58)
      : 0,
    headerGap: fallbackHeaderGap,
    bodyZone: fallbackBodyZone,
    bodyFlow: layoutBodyTextFlow(split.body, fallbackBodyZone, layoutMode),
  };
};

const candidateTextZonesAroundImages = (
  contentZone: LayoutBox,
  imageBounds: LayoutBox,
  gap: number,
): LayoutBox[] => {
  const contentRight = contentZone.left + contentZone.width;
  const contentBottom = contentZone.top + contentZone.height;
  const imageRight = imageBounds.left + imageBounds.width;
  const imageBottom = imageBounds.top + imageBounds.height;

  return [
    {
      left: contentZone.left,
      top: contentZone.top,
      width: imageBounds.left - contentZone.left - gap,
      height: contentZone.height,
    },
    {
      left: imageRight + gap,
      top: contentZone.top,
      width: contentRight - imageRight - gap,
      height: contentZone.height,
    },
    {
      left: contentZone.left,
      top: contentZone.top,
      width: contentZone.width,
      height: imageBounds.top - contentZone.top - gap,
    },
    {
      left: contentZone.left,
      top: imageBottom + gap,
      width: contentZone.width,
      height: contentBottom - imageBottom - gap,
    },
  ].filter((box) => box.width >= 120 && box.height >= 120);
};

const collectFreeStripCandidates = (
  contentZone: LayoutBox,
  imageBoxes: LayoutBox[],
  gap: number,
): LayoutBox[] => {
  const contentRight = contentZone.left + contentZone.width;
  const contentBottom = contentZone.top + contentZone.height;
  const xEdges = [
    contentZone.left,
    ...imageBoxes.flatMap((box) => [clamp(box.left - gap, contentZone.left, contentRight), clamp(box.left + box.width + gap, contentZone.left, contentRight)]),
    contentRight,
  ].sort((a, b) => a - b);
  const yEdges = [
    contentZone.top,
    ...imageBoxes.flatMap((box) => [clamp(box.top - gap, contentZone.top, contentBottom), clamp(box.top + box.height + gap, contentZone.top, contentBottom)]),
    contentBottom,
  ].sort((a, b) => a - b);
  const candidates: LayoutBox[] = [];

  for (let i = 0; i < xEdges.length - 1; i += 1) {
    const left = xEdges[i] ?? contentZone.left;
    const right = xEdges[i + 1] ?? contentRight;
    const width = right - left;
    if (width < 120) continue;
    const strip: LayoutBox = {
      left,
      top: contentZone.top,
      width,
      height: contentZone.height,
    };
    if (!overlapsAny(strip, imageBoxes)) {
      candidates.push(strip);
    }
  }

  for (let i = 0; i < yEdges.length - 1; i += 1) {
    const top = yEdges[i] ?? contentZone.top;
    const bottom = yEdges[i + 1] ?? contentBottom;
    const height = bottom - top;
    if (height < 120) continue;
    const strip: LayoutBox = {
      left: contentZone.left,
      top,
      width: contentZone.width,
      height,
    };
    if (!overlapsAny(strip, imageBoxes)) {
      candidates.push(strip);
    }
  }

  return candidates;
};

const capTextZoneArea = (
  zone: LayoutBox,
  contentZone: LayoutBox,
  layoutMode: LayoutMode,
): LayoutBox => {
  const maxShare = layoutMode === "inspiration" ? 0.22 : 0.36;
  const maxArea = contentZone.width * contentZone.height * maxShare;
  const area = zone.width * zone.height;
  if (area <= maxArea) return zone;

  if (zone.width < contentZone.width * 0.9) {
    const nextWidth = Math.max(140, Math.min(zone.width, maxArea / Math.max(zone.height, 1)));
    return {
      ...zone,
      width: nextWidth,
    };
  }

  const nextHeight = Math.max(140, Math.min(zone.height, maxArea / Math.max(zone.width, 1)));
  return {
    ...zone,
    height: nextHeight,
  };
};

const chooseResolvedTextPlacement = (
  split: { title?: TextItem; subtitle?: TextItem; body: TextItem[] },
  contentZone: LayoutBox,
  layoutMode: LayoutMode,
  imageBoxes: LayoutBox[],
  fallback: LayoutBox,
): {
  textZone: LayoutBox;
  textLayout: {
    titleScale: number;
    subtitleScale: number;
    titleHeight: number;
    subtitleHeight: number;
    headerGap: number;
    bodyZone: LayoutBox;
    bodyFlow: {
      scale: number;
      columns: number;
      boxes: LayoutBox[];
      complete: boolean;
    };
  };
} => {
  const imageBounds = unionBoxes(imageBoxes);
  const gap = clamp(contentZone.width * 0.026, 16, 28);
  const bodyLength = split.body.reduce((sum, item) => sum + item.length, 0);
  const longBody = bodyLength >= 280;
  const seedCandidates = imageBounds
    ? candidateTextZonesAroundImages(contentZone, imageBounds, gap)
    : [];
  const candidates = [
    ...seedCandidates,
    ...collectFreeStripCandidates(contentZone, imageBoxes, gap),
    fallback,
  ]
    .map((zone) => clampBoxWithinZone(capTextZoneArea(zone, contentZone, layoutMode), contentZone))
    .filter((zone, index, all) => {
      if (zone.width < 140 || zone.height < 120) return false;
      return all.findIndex((other) =>
        Math.abs(other.left - zone.left) < 1 &&
        Math.abs(other.top - zone.top) < 1 &&
        Math.abs(other.width - zone.width) < 1 &&
        Math.abs(other.height - zone.height) < 1,
      ) === index;
    });

  const scored = candidates
    .map((zone) => {
      const textLayout = resolveTextLayout(split, zone, layoutMode);
      const plannedTextBoxes: LayoutBox[] = [];
      if (split.title) {
        plannedTextBoxes.push({
          left: zone.left,
          top: zone.top,
          width: zone.width,
          height: textLayout.titleHeight,
        });
      }
      if (split.subtitle) {
        const titleHeight = split.title ? textLayout.titleHeight + textLayout.headerGap : 0;
        plannedTextBoxes.push({
          left: zone.left,
          top: zone.top + titleHeight,
          width: zone.width,
          height: textLayout.subtitleHeight,
        });
      }
      plannedTextBoxes.push(...textLayout.bodyFlow.boxes);
      const overlapPenalty = countCrossOverlaps(plannedTextBoxes, imageBoxes) * 1000;
      const textShare = (zone.width * zone.height) / Math.max(1, contentZone.width * contentZone.height);
      const completenessBonus = textLayout.bodyFlow.complete ? 200 : 0;
      const scaleScore = textLayout.bodyFlow.scale * 90 + textLayout.titleScale * 45;
      const compactBonus = (1 - textShare) * 120;
      const narrowPenalty =
        zone.width < 280
          ? 220
          : zone.width < 360
            ? 120
            : zone.width < 440
              ? 40
              : 0;
      const stripPenalty =
        zone.width < contentZone.width * 0.24 && zone.height > contentZone.height * 0.72 ? 160 : 0;
      const longBodyPenalty =
        longBody && zone.width < 420
          ? 360
          : longBody && zone.width < 520
            ? 180
            : 0;
      return {
        zone,
        textLayout,
        overlapPenalty,
        complete: textLayout.bodyFlow.complete,
        score:
          completenessBonus +
          scaleScore +
          compactBonus -
          overlapPenalty -
          narrowPenalty -
          stripPenalty -
          longBodyPenalty,
      };
    })
    .sort((a, b) => b.score - a.score);

  const strict = scored.find((item) => item.complete && item.overlapPenalty === 0);
  const best = strict ?? scored[0];
  if (best) {
    return {
      textZone: best.zone,
      textLayout: best.textLayout,
    };
  }

  return {
    textZone: fallback,
    textLayout: resolveTextLayout(split, fallback, layoutMode),
  };
};

const avoidTextBoxesInImages = (
  imageBoxes: LayoutBox[],
  textBoxes: LayoutBox[],
  bounds: LayoutBox,
): LayoutBox[] => {
  const protectedText = textBoxes.map((box) => expandBox(box, 18));
  const adjusted: LayoutBox[] = [];

  for (const box of imageBoxes) {
    let current = { ...box };

    for (const textBox of protectedText) {
      if (!overlaps(current, textBox)) continue;

      const moveLeft = Math.abs(current.left + current.width - textBox.left);
      const moveRight = Math.abs(textBox.left + textBox.width - current.left);
      const moveUp = Math.abs(current.top + current.height - textBox.top);
      const moveDown = Math.abs(textBox.top + textBox.height - current.top);
      const options = [
        { left: current.left - moveLeft - 12, top: current.top },
        { left: current.left + moveRight + 12, top: current.top },
        { left: current.left, top: current.top - moveUp - 12 },
        { left: current.left, top: current.top + moveDown + 12 },
      ];

      let moved = false;
      for (const option of options) {
        const candidate = clampBoxWithinZone(
          {
            ...current,
            left: option.left,
            top: option.top,
          },
          bounds,
        );
        if (!overlaps(candidate, textBox) && !overlapsAny(candidate, adjusted)) {
          current = candidate;
          moved = true;
          break;
        }
      }

      if (!moved) {
        current = shrinkBox(current, 0.86);
        current = clampBoxWithinZone(current, bounds);
      }
    }

    adjusted.push(current);
  }

  return adjusted;
};

const enforceTextImageSeparation = (
  split: { title?: TextItem; subtitle?: TextItem; body: TextItem[] },
  contentZone: LayoutBox,
  layoutMode: LayoutMode,
  imageBoxes: LayoutBox[],
  textZone: LayoutBox,
  textLayout: {
    titleScale: number;
    subtitleScale: number;
    titleHeight: number;
    subtitleHeight: number;
    headerGap: number;
    bodyZone: LayoutBox;
    bodyFlow: {
      scale: number;
      columns: number;
      boxes: LayoutBox[];
      complete: boolean;
    };
  },
): {
  textZone: LayoutBox;
  textLayout: {
    titleScale: number;
    subtitleScale: number;
    titleHeight: number;
    subtitleHeight: number;
    headerGap: number;
    bodyZone: LayoutBox;
    bodyFlow: {
      scale: number;
      columns: number;
      boxes: LayoutBox[];
      complete: boolean;
    };
  };
} => {
  const buildPlannedBoxes = (zone: LayoutBox, layout: typeof textLayout): LayoutBox[] => {
    const boxes: LayoutBox[] = [];
    if (split.title) {
      boxes.push({ left: zone.left, top: zone.top, width: zone.width, height: layout.titleHeight });
    }
    if (split.subtitle) {
      const titleOffset = split.title ? layout.titleHeight + layout.headerGap : 0;
      boxes.push({
        left: zone.left,
        top: zone.top + titleOffset,
        width: zone.width,
        height: layout.subtitleHeight,
      });
    }
    boxes.push(...layout.bodyFlow.boxes);
    return boxes;
  };

  let currentZone = textZone;
  let currentLayout = textLayout;
  let planned = buildPlannedBoxes(currentZone, currentLayout);

  if (countCrossOverlaps(planned, imageBoxes) === 0) {
    return { textZone: currentZone, textLayout: currentLayout };
  }

  for (let i = 0; i < 6; i += 1) {
    const shiftX = contentZone.width * 0.03;
    const shiftY = contentZone.height * 0.03;
    const nextZone =
      currentZone.width < contentZone.width * 0.9
        ? {
            ...currentZone,
            left:
              currentZone.left < contentZone.left + contentZone.width / 2
                ? currentZone.left + shiftX
                : currentZone.left - shiftX,
          }
        : {
            ...currentZone,
            top:
              currentZone.top < contentZone.top + contentZone.height / 2
                ? currentZone.top + shiftY
                : currentZone.top - shiftY,
          };
    currentZone = clampBoxWithinZone(nextZone, contentZone);
    currentLayout = resolveTextLayout(split, currentZone, layoutMode);
    planned = buildPlannedBoxes(currentZone, currentLayout);
    if (countCrossOverlaps(planned, imageBoxes) === 0) {
      return { textZone: currentZone, textLayout: currentLayout };
    }
  }

  return { textZone, textLayout };
};

const deriveTextZoneFromImages = (
  contentZone: LayoutBox,
  layoutMode: LayoutMode,
  plannedImageBoxes: LayoutBox[],
  fallback: LayoutBox,
): LayoutBox => {
  // After image placement is finalized, recompute the text zone from the actual collage footprint.
  const imageBounds = unionBoxes(plannedImageBoxes);
  if (!imageBounds) return fallback;

  const gap = clamp(contentZone.width * 0.026, 16, 28);

  const candidates = candidateTextZonesAroundImages(contentZone, imageBounds, gap).filter((box) => {
    if (layoutMode === "regular") {
      return box.width >= contentZone.width * 0.24 || box.height >= contentZone.height * 0.24;
    }
    return box.width >= contentZone.width * 0.18 || box.height >= contentZone.height * 0.18;
  });

  const ranked = candidates
    .map((box) => {
      const area = box.width * box.height;
      const sidePreference =
        layoutMode === "regular"
          ? box.width < contentZone.width * 0.9
            ? 1.12
            : 0.94
          : box.width < contentZone.width * 0.78
            ? 1.08
            : 0.96;
      const topPenalty = box.top > contentZone.top + contentZone.height * 0.58 ? 0.88 : 1;
      return { box, score: area * sidePreference * topPenalty };
    })
    .sort((a, b) => b.score - a.score);

  if (ranked[0]) {
    return ranked[0].box;
  }

  return fallback;
};

// Heuristic title/subtitle/body split from text importance.
const splitTitleSubtitleBody = (items: TextItem[]): {
  title?: TextItem;
  subtitle?: TextItem;
  body: TextItem[];
} => {
  // Still heuristic. This is better than raw font-size sorting, but not semantic understanding.
  if (items.length === 0) return { body: [] };

  const titleScore = (item: TextItem): number => {
    const text = item.plain.trim();
    const uppercaseRatio =
      text.length > 0 ? (text.match(/[A-Z]/g)?.length ?? 0) / text.length : 0;
    const keywordBonus = /(palette|color|mood|board|fabric|collection|identity)/i.test(text) ? 18 : 0;
    const compactBonus = text.length > 0 && text.length <= 48 ? 24 : text.length <= 90 ? 12 : 0;
    const punctuationPenalty = /[，。；：.!?]{2,}/.test(text) ? 8 : 0;
    const longBodyPenalty = item.length > 220 ? 60 : item.length > 150 ? 32 : 0;
    const multilinePenalty = item.lineCount >= 5 ? 26 : item.lineCount >= 3 ? 12 : 0;
    return (
      item.importance +
      uppercaseRatio * 26 +
      keywordBonus +
      compactBonus -
      punctuationPenalty -
      longBodyPenalty -
      multilinePenalty
    );
  };

  const sorted = [...items].sort((a, b) => titleScore(b) - titleScore(a));
  const candidateTitle = sorted[0];
  const candidateSubtitle = sorted[1];
  const averageFont =
    items.reduce((sum, item) => sum + item.baseFont, 0) / Math.max(items.length, 1);

  const hasTitle =
    candidateTitle &&
    candidateTitle.length <= 140 &&
    candidateTitle.lineCount <= 3 &&
    candidateTitle.baseWidth >= 220 &&
    (candidateTitle.baseFont >= Math.max(24, averageFont * 1.18) || titleScore(candidateTitle) >= 60);

  const hasSubtitle =
    hasTitle &&
    candidateSubtitle &&
    candidateSubtitle.length <= 180 &&
    candidateSubtitle.lineCount <= 4 &&
    candidateSubtitle.baseWidth >= 220 &&
    candidateSubtitle.importance >= (candidateTitle?.importance ?? 0) * 0.5;

  const used = new Set<any>();
  const body: TextItem[] = [];

  if (hasTitle && candidateTitle) used.add(candidateTitle.element);
  if (hasSubtitle && candidateSubtitle) used.add(candidateSubtitle.element);

  for (const item of items) {
    if (!used.has(item.element)) body.push(item);
  }

  return {
    title: hasTitle ? candidateTitle : undefined,
    subtitle: hasSubtitle ? candidateSubtitle : undefined,
    body,
  };
};

export const App = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("regular");

  // Main entry:
  // 1) read current page
  // 2) classify text/images
  // 3) split zones + compute text flow + image slots
  // 4) recreate elements with new geometry
  // 5) sync + report overlap diagnostics
  const handleSmartLayout = async () => {
    setLoading(true);
    setMessage("");

    try {
      await openDesign({ type: "current_page" }, async (session) => {
        if (session.page.type !== "absolute") {
          setMessage("❌ This page type is not supported. Please use the app in a presentation page.");
          return;
        }

        const elements = session.page.elements.toArray() as any[];
        if (elements.length === 0) {
          setMessage("⚠️ There are no layoutable elements on the current page.");
          return;
        }

        const editable = elements.filter((el) => !el.locked && el.type !== "unsupported");
        const texts = editable.filter((el) => el.type === "text");
        const imageRects = editable.filter((el) => hasImageFill(el));

        if (texts.length === 0 && imageRects.length === 0) {
          setMessage("⚠️ No layoutable images or text were found.");
          return;
        }

        const pageWidth = safeNumber(session.page.dimensions?.width, 1920);
        const pageHeight = safeNumber(session.page.dimensions?.height, 1080);
        const margin = clamp(pageWidth * 0.04, 28, 72);

        const contentZone: LayoutBox = {
          left: margin,
          top: margin,
          width: pageWidth - margin * 2,
          height: pageHeight - margin * 2,
        };

        // Signature combines text/content/geometry hints to vary template choice.
        const positionSignature = editable
          .map((el) => {
            const box = getBox(el);
            return `${Math.round(box.left)}:${Math.round(box.top)}:${Math.round(
              box.width,
            )}x${Math.round(box.height)}`;
          })
          .join("|");

        const textSignature = texts
          .map((t) => (t?.text?.readPlaintext ? String(t.text.readPlaintext()) : ""))
          .join("|");

        const signature = hashString(
          `${textSignature}|${positionSignature}|${imageRects.length}|${Math.round(pageWidth)}x${Math.round(
            pageHeight,
          )}`,
        );

        const textItems = buildTextItems(texts);
        const themeProfile = buildThemeProfile(textItems);
        const totalTextLength = textItems.reduce((sum, item) => sum + item.length, 0);
        const textDensity = clamp(totalTextLength / 2600, 0, 1);

        const baseLayout = chooseZoneLayout(
          contentZone,
          texts.length > 0,
          imageRects.length > 0,
          signature,
          textDensity,
          imageRects.length,
          layoutMode,
        );

        let textZone = { ...baseLayout.textZone };
        let imageZone = { ...baseLayout.imageZone };

        // Split heading hierarchy first so body flow can reserve top space.
        const split = splitTitleSubtitleBody(textItems);
        let textLayout = resolveTextLayout(split, textZone, layoutMode);

        // If body doesn't fit, progressively expand text zone at the expense of image zone.
        // Guard rails keep image area above a minimum readable size.
        if (!textLayout.bodyFlow.complete && texts.length > 0 && imageRects.length > 0) {
          for (let i = 0; i < 5; i += 1) {
            if (baseLayout.orientation === "side") {
              const shift = contentZone.width * 0.04;
              const minImageWidth =
                contentZone.width * (layoutMode === "inspiration" ? 0.62 : 0.48);
              if (imageZone.width - shift < minImageWidth) break;

              if (textZone.left < imageZone.left) {
                textZone.width += shift;
                imageZone.left += shift;
                imageZone.width -= shift;
              } else {
                textZone.left -= shift;
                textZone.width += shift;
                imageZone.width -= shift;
              }
            } else if (baseLayout.orientation === "stack") {
              const shift = contentZone.height * 0.04;
              const minImageHeight =
                contentZone.height * (layoutMode === "inspiration" ? 0.58 : 0.46);
              if (imageZone.height - shift < minImageHeight) break;

              if (textZone.top < imageZone.top) {
                textZone.height += shift;
                imageZone.top += shift;
                imageZone.height -= shift;
              } else {
                textZone.top -= shift;
                textZone.height += shift;
                imageZone.height -= shift;
              }
            }
            textLayout = resolveTextLayout(split, textZone, layoutMode);
            if (textLayout.bodyFlow.complete) break;
          }
        }

        const imageItems = buildImageItems(imageRects, pageWidth, pageHeight, themeProfile);
        const imageStyle =
          layoutMode === "inspiration"
            ? buildInspirationCollageSlots(imageZone, imageItems, signature, themeProfile)
            : buildBalancedShowcaseSlots(imageZone, imageItems, signature);
        const imageOrder = assignImagesToSlots(imageItems, imageStyle.slots as ImageSlot[]);
        let plannedImageBoxes: LayoutBox[] = [];

        for (let i = 0; i < imageOrder.length; i += 1) {
          const image = imageOrder[i];
          const slot = imageStyle.slots[i];
          if (!slot) continue;
          if (!image) continue;

          const fittingSlot =
            slot.rotationDelta === undefined ? slot : shrinkBox(slot, 0.92);
          const target = fitBoxToAspect(
            fittingSlot,
            image.aspectRatio,
            layoutMode === "inspiration" ? "bottom" : "center",
          );
          // Important: image targets are now "fit" boxes, not crop-to-fill boxes.
          plannedImageBoxes.push(target);
        }

        const resolvedTextPlacement = chooseResolvedTextPlacement(
          split,
          contentZone,
          layoutMode,
          plannedImageBoxes,
          textZone,
        );
        const separatedTextPlacement = enforceTextImageSeparation(
          split,
          contentZone,
          layoutMode,
          plannedImageBoxes,
          resolvedTextPlacement.textZone,
          resolvedTextPlacement.textLayout,
        );
        textZone = separatedTextPlacement.textZone;
        textLayout = separatedTextPlacement.textLayout;
        // Text is solved after actual image geometry, which is why this happens after image targets.

        const plannedTextBoxes: LayoutBox[] = [];

        // Place title block.
        if (split.title) {
          const box: LayoutBox = {
            left: textZone.left,
            top: textZone.top,
            width: textZone.width,
            height: textLayout.titleHeight,
          };
          plannedTextBoxes.push(box);

          const state = session.helpers.elementStateBuilder.createTextElement({
            top: box.top,
            left: box.left,
            width: box.width,
            rotation: safeNumber(split.title.element.rotation, 0),
            transparency: safeNumber(split.title.element.transparency, 0),
            text: {
              regions: scaleTextRegions(split.title.regions, textLayout.titleScale),
            },
          });

          session.page.elements.insertBefore(split.title.element, state);
          session.page.elements.delete(split.title.element);
        }

        // Place subtitle block right below title.
        if (split.subtitle) {
          const titleBox = plannedTextBoxes[0];
          const subtitleTop =
            split.title !== undefined && titleBox
              ? titleBox.top + titleBox.height + textLayout.headerGap
              : textZone.top;
          const box: LayoutBox = {
            left: textZone.left,
            top: subtitleTop,
            width: textZone.width,
            height: textLayout.subtitleHeight,
          };
          plannedTextBoxes.push(box);

          const state = session.helpers.elementStateBuilder.createTextElement({
            top: box.top,
            left: box.left,
            width: box.width,
            rotation: safeNumber(split.subtitle.element.rotation, 0),
            transparency: safeNumber(split.subtitle.element.transparency, 0),
            text: {
              regions: scaleTextRegions(split.subtitle.regions, textLayout.subtitleScale),
            },
          });

          session.page.elements.insertBefore(split.subtitle.element, state);
          session.page.elements.delete(split.subtitle.element);
        }

        // Place body flow blocks (column layout result).
        if (textLayout.bodyFlow.complete) {
          for (let i = 0; i < split.body.length; i += 1) {
            const item = split.body[i];
            const box = textLayout.bodyFlow.boxes[i];
            if (!item || !box) continue;
            plannedTextBoxes.push(box);

            const state = session.helpers.elementStateBuilder.createTextElement({
              top: box.top,
              left: box.left,
              width: box.width,
              rotation: safeNumber(item.element.rotation, 0),
              transparency: safeNumber(item.element.transparency, 0),
              text: {
                regions: scaleTextRegions(item.regions, textLayout.bodyFlow.scale),
              },
            });

            session.page.elements.insertBefore(item.element, state);
            session.page.elements.delete(item.element);
          }
        }

        plannedImageBoxes = avoidTextBoxesInImages(plannedImageBoxes, plannedTextBoxes, contentZone);

        for (let i = 0; i < imageOrder.length; i += 1) {
          const image = imageOrder[i];
          const slot = imageStyle.slots[i];
          const target = plannedImageBoxes[i];
          if (!slot || !image || !target) continue;
          resetImageViewBoxIfPossible(image.element);

          const state = session.helpers.elementStateBuilder.createRectElement({
            top: target.top,
            left: target.left,
            width: target.width,
            height: target.height,
            rotation: safeNumber(image.element.rotation, 0) + safeNumber(slot.rotationDelta, 0),
            transparency: safeNumber(image.element.transparency, 0),
            fill: getRectFillOpts(image.element),
            stroke: getStrokeOpts(image.element),
          });

          session.page.elements.insertBefore(image.element, state);
          session.page.elements.delete(image.element);
        }

        const imageOverlapCount = countOverlaps(plannedImageBoxes);
        const textOverlapCount = countOverlaps(plannedTextBoxes);
        const textImageOverlapCount = countCrossOverlaps(plannedTextBoxes, plannedImageBoxes);
        const effectiveImageOverlapCount = layoutMode === "inspiration" ? 0 : imageOverlapCount;

        await session.sync();

        if (!textLayout.bodyFlow.complete) {
          setMessage(
            "⚠️ There is too much text on this page. The app expanded the text area and reduced text size, but the content still does not fully fit. Try reducing copy or splitting it across multiple pages.",
          );
          return;
        }

        if (
          effectiveImageOverlapCount === 0 &&
          textOverlapCount === 0 &&
          textImageOverlapCount === 0
        ) {
          setMessage(
            `✅ ${layoutMode === "inspiration" ? "Inspiration" : "Regular"} layout complete: template "${baseLayout.templateName} + ${imageStyle.styleName}", ` +
              `text scale ${Math.round(textLayout.bodyFlow.scale * 100)}%, ${textLayout.bodyFlow.columns} text column(s), and improved visual hierarchy.`,
          );
          return;
        }

        setMessage(
          `⚠️ Layout completed, but conflicts were detected: image-image ${effectiveImageOverlapCount}, text-text ${textOverlapCount}, text-image ${textImageOverlapCount}. You can run the layout again to refine it.`,
        );
      });
    } catch (error) {
      console.error(error);
      setMessage("❌ Layout failed. Please confirm that you are editing a presentation page and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box padding="2u">
      <Rows spacing="3u">
        <Title size="large">🧠 Smart Layout Assistant</Title>

        <Text size="small" tone="secondary">
          Automatically detects hierarchy across headings, body text, and hero images, then
          improves readability before adding stronger visual rhythm.
          <br />
          Goal: no text-text overlap, no text-image overlap, larger hero images, and better
          image variety.
        </Text>

        <Rows spacing="1u">
          <Text size="small" tone="secondary">
            Choose a layout mode
          </Text>
          <Button
            variant={layoutMode === "regular" ? "primary" : "secondary"}
            onClick={() => setLayoutMode("regular")}
            disabled={loading}
            stretch
          >
            Regular Layout
          </Button>
          <Button
            variant={layoutMode === "inspiration" ? "primary" : "secondary"}
            onClick={() => setLayoutMode("inspiration")}
            disabled={loading}
            stretch
          >
            Inspiration Layout
          </Button>
        </Rows>

        <Button
          variant="primary"
          onClick={handleSmartLayout}
          loading={loading}
          disabled={loading}
          stretch
        >
          🚀 Auto Layout
        </Button>

        {message && (
          <Alert tone={message.includes("✅") ? "positive" : "critical"}>
            {message}
          </Alert>
        )}

        <Text size="xsmall" tone="secondary" alignment="center">
          Current mode: {layoutMode === "inspiration" ? "Inspiration Art Collage" : "Regular Editorial Layout"}
        </Text>
      </Rows>
    </Box>
  );
};
