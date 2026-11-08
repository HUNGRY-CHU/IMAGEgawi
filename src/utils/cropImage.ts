import imageCompression from 'browser-image-compression';
import type { Area } from 'react-easy-crop';

export type OutputFormat = 'image/jpeg' | 'image/png';
export const extensionFor = (format: OutputFormat) => format === 'image/png' ? 'png' : 'jpg';

export const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
  image.src = src;
});

export const renderImage = (
  image: HTMLImageElement,
  area: Area | null,
  format: OutputFormat = 'image/jpeg',
  background = '#ffffff',
): Promise<Blob> => {
  const crop = area ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  if (format === 'image/jpeg') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  // Keep the intermediate lossless, including PNG alpha; encode the selected format once during compression.
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('이미지 변환 실패')), 'image/png',
  ));
};

export const getCroppedImg = async (
  imageSrc: string, area: Area | null, format: OutputFormat = 'image/jpeg', background = '#ffffff',
): Promise<Blob> => renderImage(await loadImage(imageSrc), area, format, background);

export const compressImage = async (
  imageBlob: Blob, maxSizeMB = 1, format: OutputFormat = 'image/jpeg',
): Promise<Blob> => {
  if (!Number.isFinite(maxSizeMB) || maxSizeMB <= 0) throw new Error('올바른 목표 용량을 입력하세요.');
  return imageCompression(new File([imageBlob], 'source.png', { type: imageBlob.type }), {
    maxSizeMB,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: format,
  });
};

export const toClipboardPng = async (blob: Blob): Promise<Blob> => {
  const url = URL.createObjectURL(blob);
  try {
    return await renderImage(await loadImage(url), null, 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
};
