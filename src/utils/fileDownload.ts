import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { LearningDocument, StudyMaterial } from '../types';

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  zip: 'application/zip',
  txt: 'text/plain;charset=utf-8',
};

export function normalizeVietnameseNFC(input: string): string {
  if (!input) return '';
  return input.replace(/^\uFEFF/, '').normalize('NFC');
}

export function sanitizeDownloadFilename(rawName: string, extension: string): string {
  const cleaned = normalizeVietnameseNFC(rawName || 'tai-lieu')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned || 'tai-lieu';
  const ext = extension.replace(/^\./, '').toLowerCase();
  if (ext && base.toLowerCase().endsWith(`.${ext}`)) {
    return base;
  }
  return ext ? `${base}.${ext}` : base;
}

export function formatBytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '1 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Đọc tệp văn bản (TXT, MD, CSV, SQL...) bảo toàn 100% tiếng Việt:
 * - Nhận diện UTF-16 LE / BE BOM
 * - Nhận diện UTF-8 BOM & UTF-8 strict (`fatal: true`)
 * - Fallback Windows-1258 (bảng mã tiếng Việt cũ) nếu file lưu bằng ANSI/CP1258
 * - Chuẩn hóa Unicode sang NFC để hiển thị và xuất Word không lỗi dấu rời (NFD)
 */
export async function readTextFileCleanly(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return normalizeVietnameseNFC(new TextDecoder('utf-16le').decode(bytes.subarray(2)));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return normalizeVietnameseNFC(new TextDecoder('utf-16be').decode(bytes.subarray(2)));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return normalizeVietnameseNFC(new TextDecoder('utf-8').decode(bytes.subarray(3)));
  }

  try {
    return normalizeVietnameseNFC(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    try {
      return normalizeVietnameseNFC(new TextDecoder('windows-1258').decode(bytes));
    } catch {
      return normalizeVietnameseNFC(new TextDecoder('utf-8').decode(bytes));
    }
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể đọc dữ liệu nhị phân của tệp tin.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Lỗi đọc tệp tin.'));
    reader.readAsDataURL(file);
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    return new Blob([dataUrl], { type: fallbackMime });
  }
  const header = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/^data:([^;]+)/i);
  const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
  const isBase64 = /;base64$/i.test(header);

  if (isBase64) {
    const binary = atob(payload);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/**
 * Tạo file Word (.docx) chuẩn Unicode Times New Roman từ nội dung văn bản,
 * tránh tuyệt đối lỗi mất dấu / hỏng phông chữ khi mở trên Microsoft Word, WPS hoặc Google Docs.
 */
async function buildCleanDocxBlob(params: {
  title: string;
  subtitle?: string;
  description?: string;
  metadataLines?: string[];
  bodyText: string;
}): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: normalizeVietnameseNFC(params.title),
          bold: true,
          size: 32,
          font: 'Times New Roman',
          color: '0F172A',
        }),
      ],
    }),
  ];

  if (params.subtitle) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: normalizeVietnameseNFC(params.subtitle),
            bold: true,
            size: 22,
            font: 'Times New Roman',
            color: '1D4ED8',
          }),
        ],
      })
    );
  }

  if (params.description) {
    children.push(
      new Paragraph({
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: normalizeVietnameseNFC(params.description),
            italics: true,
            size: 22,
            font: 'Times New Roman',
            color: '334155',
          }),
        ],
      })
    );
  }

  if (params.metadataLines && params.metadataLines.length > 0) {
    for (const meta of params.metadataLines) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: normalizeVietnameseNFC(meta),
              size: 20,
              font: 'Times New Roman',
              color: '475569',
            }),
          ],
        })
      );
    }
  }

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 160 },
      children: [
        new TextRun({
          text: '----------------------------------------------------------------------',
          size: 20,
          font: 'Times New Roman',
          color: '94A3B8',
        }),
      ],
    })
  );

  const normalizedLines = normalizeVietnameseNFC(params.bodyText || '').split(/\r?\n/);
  for (const line of normalizedLines) {
    const trimmed = line.trim();
    const isHeadingLine =
      /^(\d+\.|CHƯƠNG\s+\d+|PHẦN\s+[IVX\d]+|[IVX]+\.)/i.test(trimmed) ||
      (trimmed.length > 3 && trimmed.length <= 90 && trimmed === trimmed.toUpperCase() && /[A-ZÀ-Ỹ]/.test(trimmed));

    children.push(
      new Paragraph({
        spacing: { after: 100, line: 276 },
        children: [
          new TextRun({
            text: line || ' ',
            bold: isHeadingLine,
            size: 24,
            font: 'Times New Roman',
            color: '0F172A',
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/**
 * Tải xuống StudyMaterial nguyên vẹn 100% không lỗi phông:
 * 1. Nếu giảng viên đã upload file nhị phân gốc (`fileDataUrl` hoặc `serverFileUrl`), tải đúng file gốc + tên gốc.
 * 2. Nếu là tài liệu dạng văn bản biên soạn sẵn (seed hoặc nhập nội dung chữ), xuất sang `.docx` chuẩn Unicode NFC
 *    (với font Times New Roman nhúng chuẩn OOXML) để mở bằng mọi trình đọc Word/Google Docs không bao giờ lỗi font.
 */
export async function downloadStudyMaterialFile(
  material: StudyMaterial,
  subjectLabel?: string
): Promise<void> {
  if (material.fileDataUrl && material.fileDataUrl.startsWith('data:')) {
    const extFromName = material.originalFileName?.split('.').pop()?.toLowerCase() || material.fileType || 'docx';
    const fallbackMime = material.mimeType || MIME_MAP[extFromName] || 'application/octet-stream';
    const blob = dataUrlToBlob(material.fileDataUrl, fallbackMime);
    const filename = material.originalFileName
      ? sanitizeDownloadFilename(material.originalFileName, extFromName)
      : sanitizeDownloadFilename(material.title, extFromName);
    triggerBlobDownload(blob, filename);
    return;
  }

  if (material.serverFileUrl) {
    try {
      const res = await fetch(material.serverFileUrl);
      if (res.ok) {
        const blob = await res.blob();
        const ext = material.originalFileName?.split('.').pop()?.toLowerCase() || material.fileType || 'docx';
        const filename = material.originalFileName
          ? sanitizeDownloadFilename(material.originalFileName, ext)
          : sanitizeDownloadFilename(material.title, ext);
        triggerBlobDownload(blob, filename);
        return;
      }
    } catch {
      // Fall back to clean client-side DOCX export below
    }
  }

  const bodyText =
    material.content && material.content.trim().length > 0
      ? material.content
      : `${material.title}\n\n${material.description || ''}\n\nGiảng viên biên soạn: ${material.uploadedBy}`;

  const blob = await buildCleanDocxBlob({
    title: material.title,
    subtitle: subjectLabel ? `Học phần: ${subjectLabel}` : 'Khoa Công nghệ Thông tin - Trường Đại học Hải Phòng',
    description: material.description,
    metadataLines: [
      `Giảng viên biên soạn: ${material.uploadedBy || 'Khoa CNTT'}`,
      `Định dạng chuẩn hóa: Microsoft Word (.docx) - Unicode NFC (Times New Roman)`,
    ],
    bodyText,
  });

  const filename = sanitizeDownloadFilename(material.title, 'docx');
  triggerBlobDownload(blob, filename);
}

export async function downloadLearningDocFile(
  doc: LearningDocument,
  subjectLabel?: string
): Promise<void> {
  const raw = doc.rawContent && doc.rawContent.trim().length > 0
    ? doc.rawContent
    : [
        doc.title,
        doc.description,
        doc.analysisResult?.courseGoals?.length
          ? `Mục tiêu học phần:\n- ${doc.analysisResult.courseGoals.join('\n- ')}`
          : '',
        doc.analysisResult?.chapters?.length
          ? `Nội dung các chương:\n${doc.analysisResult.chapters
              .map(c => `Chương ${c.chapterNumber}: ${c.title}\n${c.summary}`)
              .join('\n\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

  if (doc.fileType === 'txt') {
    const bomText = '\uFEFF' + normalizeVietnameseNFC(raw);
    const blob = new Blob([bomText], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, sanitizeDownloadFilename(doc.title, 'txt'));
    return;
  }

  const blob = await buildCleanDocxBlob({
    title: doc.title,
    subtitle: subjectLabel ? `Học phần: ${subjectLabel}` : 'Tài liệu Đề cương / Bài giảng chuẩn hóa',
    description: doc.description,
    metadataLines: [
      `Giảng viên tải lên: ${doc.uploadedBy || 'Khoa CNTT'}`,
      `Chuẩn mã hóa: Unicode NFC (Times New Roman)`,
    ],
    bodyText: raw,
  });
  triggerBlobDownload(blob, sanitizeDownloadFilename(doc.title, 'docx'));
}
