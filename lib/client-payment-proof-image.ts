"use client";

import {
  PAYMENT_PROOF_MAX_DATA_URL_LENGTH,
  PAYMENT_PROOF_MAX_SOURCE_FILE_BYTES,
  PAYMENT_PROOF_MAX_SOURCE_FILE_LABEL,
} from "@/lib/payment-proof-constants";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type PreparedProofImage =
  | { ok: true; dataUrl: string; compressed: boolean }
  | { ok: false; error: string };

export async function preparePaymentProofImage(file: File): Promise<PreparedProofImage> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Upload a PNG, JPG, or WEBP receipt screenshot." };
  }

  if (file.size > PAYMENT_PROOF_MAX_SOURCE_FILE_BYTES) {
    return {
      ok: false,
      error: `Receipt screenshot is too large. Use an image under ${PAYMENT_PROOF_MAX_SOURCE_FILE_LABEL}.`,
    };
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  if (!originalDataUrl) {
    return { ok: false, error: "Could not read receipt screenshot." };
  }

  if (originalDataUrl.length <= PAYMENT_PROOF_MAX_DATA_URL_LENGTH) {
    return { ok: true, dataUrl: originalDataUrl, compressed: false };
  }

  const compressedDataUrl = await compressImageToJpegDataUrl(file);
  if (compressedDataUrl && compressedDataUrl.length <= PAYMENT_PROOF_MAX_DATA_URL_LENGTH) {
    return { ok: true, dataUrl: compressedDataUrl, compressed: true };
  }

  return {
    ok: false,
    error: "Receipt screenshot is still too large. Crop the receipt area, then upload again.",
  };
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function compressImageToJpegDataUrl(file: File): Promise<string | null> {
  const image = await loadImage(file);
  if (!image) return null;

  const sizeTargets = [1800, 1400, 1100, 900];
  const qualities = [0.86, 0.76, 0.66, 0.56];

  for (const maxSide of sizeTargets) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      const dataUrl = await readFileAsDataUrl(blobToFile(blob));
      if (dataUrl && dataUrl.length <= PAYMENT_PROOF_MAX_DATA_URL_LENGTH) {
        return dataUrl;
      }
    }
  }

  return null;
}

function loadImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

function blobToFile(blob: Blob): File {
  return new File([blob], "receipt.jpg", { type: "image/jpeg" });
}
