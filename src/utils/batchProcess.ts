import { compressImage, extensionFor, loadImage, renderImage, type OutputFormat } from './cropImage';

export const centerCropAndCompress = async (
  file: File,
  aspectRatio: number | null,
  targetSizeMB = 1,
  format: OutputFormat = 'image/jpeg',
  background = '#ffffff',
): Promise<{ blob: Blob; fileName: string }> => {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    let area = null;
    if (aspectRatio !== null) {
      const cropWidth = Math.min(width, height * aspectRatio);
      const cropHeight = Math.min(height, width / aspectRatio);
      area = { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
    }
    const rendered = await renderImage(image, area, format, background);
    const blob = await compressImage(rendered, targetSizeMB, format);
    return { blob, fileName: `${file.name.replace(/\.[^/.]+$/, '')}_resized.${extensionFor(format)}` };
  } finally {
    URL.revokeObjectURL(url);
  }
};
