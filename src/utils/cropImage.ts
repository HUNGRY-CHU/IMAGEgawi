import imageCompression from 'browser-image-compression';
import type { Area } from 'react-easy-crop';

export const getCroppedImg = (imageSrc: string, cropAreaPixels: Area): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));

      canvas.width = cropAreaPixels.width;
      canvas.height = cropAreaPixels.height;

      ctx.drawImage(
        image,
        cropAreaPixels.x,
        cropAreaPixels.y,
        cropAreaPixels.width,
        cropAreaPixels.height,
        0,
        0,
        cropAreaPixels.width,
        cropAreaPixels.height
      );

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Crop failed'))),
        'image/jpeg',
        0.95
      );
    };
    image.onerror = (err) => reject(err);
  });
};

export const compressImage = async (imageBlob: Blob, maxSizeMB: number = 1): Promise<Blob> => {
  const imageFile = new File([imageBlob], 'cropped.jpg', { type: 'image/jpeg' });
  return await imageCompression(imageFile, {
    maxSizeMB: maxSizeMB,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
};