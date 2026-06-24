#!/usr/bin/env node
/** Regenerate PNG icons from app/icon.svg (run after logo changes). */
import sharp from "sharp";

const sizes = [
  { out: "public/apple-touch-icon.png", size: 180 },
  { out: "app/apple-icon.png", size: 180 },
  { out: "public/icon-192.png", size: 192 },
  { out: "public/icon-512.png", size: 512 },
];

for (const { out, size } of sizes) {
  await sharp("app/icon.svg").resize(size, size).png().toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}
