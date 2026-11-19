import { ImageSubmissionAnswer } from '../types';

export const ALGORITHM_IMAGE_SUBJECT_IDS = new Set(['sub_algo_intro']);
export const CODE_AI_GRADING_SUBJECT_IDS = new Set([
  'sub_prog_base',
  'sub_prog_adv',
  'sub_oop',
]);

export function isAlgorithmImageSubject(subjectId?: string): boolean {
  return Boolean(subjectId && ALGORITHM_IMAGE_SUBJECT_IDS.has(subjectId));
}

export function isCodeAutoGradedSubject(subjectId?: string): boolean {
  return Boolean(subjectId && CODE_AI_GRADING_SUBJECT_IDS.has(subjectId));
}

export function getSubjectProgrammingLanguage(subjectId?: string): string {
  switch (subjectId) {
    case 'sub_prog_base':
      return 'C';
    case 'sub_prog_adv':
      return 'C++';
    case 'sub_oop':
      return 'JavaScript';
    case 'sub_algo_intro':
      return 'Lưu đồ thuật toán / Mã giả / C++';
    default:
      return 'Lập trình';
  }
}

export function isImageSubmissionAnswer(val: any): val is ImageSubmissionAnswer {
  return Boolean(
    val &&
      typeof val === 'object' &&
      val.kind === 'image' &&
      typeof val.dataUrl === 'string' &&
      val.dataUrl.startsWith('data:image/')
  );
}

export function hasQuestionAnswer(val: any): boolean {
  if (val === undefined || val === null || val === '') return false;
  if (Array.isArray(val)) return val.length > 0;
  if (isImageSubmissionAnswer(val)) return Boolean(val.dataUrl);
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return String(val).trim().length > 0;
}
