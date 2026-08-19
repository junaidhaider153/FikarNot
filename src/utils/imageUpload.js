export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_STORED_IMAGES = 5;

const isImageFile = (file) => file && file.type && file.type.startsWith("image/");

export async function prepareImageFile(file, { maxDimension = 1400, quality = 0.82 } = {}) {
  if (!isImageFile(file)) throw new Error("Please choose an image file.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be 4 MB or smaller.");

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });

  if (typeof window === "undefined" || !window.Image || !window.HTMLCanvasElement) return dataUrl;

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the image."));
    img.src = dataUrl;
  });

  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}
