import { ImageSubmissionAnswer } from '../types';

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

/**
 * Reads and resizes/compresses an uploaded image into a compact data URL
 * suitable for localStorage persistence and Gemini Vision evaluation.
 */
export async function processUploadedAlgorithmImage(
  file: File,
  existingNote = ''
): Promise<ImageSubmissionAnswer> {
  if (!file) {
    throw new Error('Không tìm thấy tệp hình ảnh.');
  }

  const lowerName = file.name.toLowerCase();
  const isAllowedType =
    ALLOWED_IMAGE_MIME.has(file.type) ||
    /\.(png|jpe?g|webp|gif)$/i.test(lowerName);

  if (!isAllowedType) {
    throw new Error('Vui lòng chỉ tải lên tệp hình ảnh (.png, .jpg, .jpeg, .webp, .gif).');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Dung lượng ảnh vượt quá 15MB. Vui lòng chọn ảnh nhẹ hơn.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh từ thiết bị.'));
    reader.readAsDataURL(file);
  });

  // Resize/compress via canvas so localStorage and API payloads stay compact (< ~350KB)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      imageEl.onload = () => resolve(imageEl);
      imageEl.onerror = () => reject(new Error('Tệp hình ảnh bị hỏng hoặc không hợp lệ.'));
      imageEl.src = rawDataUrl;
    });

    const maxDim = 1280;
    let targetW = img.naturalWidth || img.width;
    let targetH = img.naturalHeight || img.height;

    if (targetW > maxDim || targetH > maxDim) {
      const ratio = Math.min(maxDim / targetW, maxDim / targetH);
      targetW = Math.max(1, Math.round(targetW * ratio));
      targetH = Math.max(1, Math.round(targetH * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Fill white background before drawing so transparent PNGs convert cleanly to JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      return {
        kind: 'image',
        dataUrl: compressedDataUrl,
        fileName: file.name,
        mimeType: 'image/jpeg',
        note: existingNote,
      };
    }
  } catch {
    // Fallback to rawDataUrl if browser canvas fails
  }

  return {
    kind: 'image',
    dataUrl: rawDataUrl,
    fileName: file.name,
    mimeType: file.type || 'image/png',
    note: existingNote,
  };
}
