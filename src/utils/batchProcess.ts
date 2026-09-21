import imageCompression from 'browser-image-compression';

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
  });
};

export const centerCropAndCompress = async (
  file: File,
  aspectRatio: number,
  targetSizeMB: number = 1
): Promise<{ blob: Blob; fileName: string }> => {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas context unavailable');

  const imgWidth = img.width;
  const imgHeight = img.height;
  const originalAspect = imgWidth / imgHeight;

  let cropWidth = imgWidth;
  let cropHeight = imgHeight;
  let startX = 0;
  let startY = 0;

  if (originalAspect > aspectRatio) {
    cropWidth = imgHeight * aspectRatio;
    startX = (imgWidth - cropWidth) / 2;
  } else {
    cropHeight = imgWidth / aspectRatio;
    startY = (imgHeight - cropHeight) / 2;
  }

  canvas.width = cropWidth;
  canvas.height = cropHeight;

  ctx.drawImage(
    img,
    startX,
    startY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  URL.revokeObjectURL(img.src);

  const croppedBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob error'))),
      'image/jpeg',
      0.95
    );
  });

  const compressedFile = await imageCompression(
    new File([croppedBlob], file.name, { type: 'image/jpeg' }),
    {
      maxSizeMB: targetSizeMB,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg',
    }
  );

  // 파일명을 원본명_resized.jpg 로 변경
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  return {
    blob: compressedFile,
    fileName: `${baseName}_resized.jpg`,
  };
};