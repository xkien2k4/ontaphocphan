import { AICodeGradingResult, Question } from '../types';
import { hasQuestionAnswer, isImageSubmissionAnswer } from './subjectGrading';

export interface QuestionEvaluation {
  isAttempted: boolean;
  isCorrect: boolean;
  earnedPoints: number;
  maxPoints: number;
  matchedKeywords: string[];
  totalKeywords: number;
  aiGrading?: AICodeGradingResult;
}

export function evaluateQuestionScore(
  q: Question,
  userAns: any,
  aiGrading?: AICodeGradingResult
): QuestionEvaluation {
  const maxPoints = q.points && q.points > 0 ? q.points : 1;
  const isAttempted = hasQuestionAnswer(userAns);

  if (!isAttempted) {
    return {
      isAttempted: false,
      isCorrect: false,
      earnedPoints: 0,
      maxPoints,
      matchedKeywords: [],
      totalKeywords: 0,
    };
  }

  // Prefer Gemini AI grading result when available for code or uploaded algorithm images
  if (aiGrading) {
    const clampedScore = Math.max(
      0,
      Math.min(maxPoints, Number(aiGrading.score) || 0)
    );
    const roundedScore = Math.round(clampedScore * 4) / 4;
    return {
      isAttempted: true,
      isCorrect: Boolean(aiGrading.isCorrect),
      earnedPoints: roundedScore,
      maxPoints,
      matchedKeywords: [],
      totalKeywords: 0,
      aiGrading: {
        ...aiGrading,
        score: roundedScore,
        maxPoints,
      },
    };
  }

  if (q.questionType === 'essay') {
    // Uploaded algorithm image without AI response fallback
    if (isImageSubmissionAnswer(userAns)) {
      const noteText = String(userAns.note || '').trim();
      const rawKeywords = Array.isArray(q.correctAnswer)
        ? q.correctAnswer
        : String(q.correctAnswer || '').split(/[|,;]+/);
      const keywords = rawKeywords.map(k => k.trim()).filter(Boolean);
      const matched = noteText
        ? keywords.filter(k => noteText.toLowerCase().includes(k.toLowerCase()))
        : [];
      const earned = Math.round(0.6 * maxPoints * 4) / 4;
      return {
        isAttempted: true,
        isCorrect: true,
        earnedPoints: earned,
        maxPoints,
        matchedKeywords: matched,
        totalKeywords: keywords.length,
      };
    }

    const text = String(userAns).trim();
    const lowerText = text.toLowerCase();
    const rawKeywords = Array.isArray(q.correctAnswer)
      ? q.correctAnswer
      : String(q.correctAnswer || '').split(/[|,;]+/);
    const keywords = rawKeywords.map(k => k.trim()).filter(k => k.length > 0);

    if (keywords.length === 0) {
      const ratio = text.length >= 40 ? 1 : text.length >= 15 ? 0.5 : 0.2;
      const earned = Math.round(ratio * maxPoints * 4) / 4;
      return {
        isAttempted: true,
        isCorrect: ratio >= 0.5,
        earnedPoints: earned,
        maxPoints,
        matchedKeywords: [],
        totalKeywords: 0,
      };
    }

    const matched = keywords.filter(k => lowerText.includes(k.toLowerCase()));
    const kwRatio = matched.length / keywords.length;
    const lengthBonus = text.length >= 50 ? 0.15 : text.length >= 20 ? 0.05 : 0;
    const totalRatio = matched.length === 0 && text.length < 15
      ? 0
      : Math.min(1, kwRatio * 0.85 + lengthBonus);
    const earned = Math.round(totalRatio * maxPoints * 4) / 4;

    return {
      isAttempted: true,
      isCorrect: totalRatio >= 0.5,
      earnedPoints: earned,
      maxPoints,
      matchedKeywords: matched,
      totalKeywords: keywords.length,
    };
  }

  let isCorrect = false;
  if (Array.isArray(q.correctAnswer)) {
    if (Array.isArray(userAns)) {
      const userSet = new Set(userAns);
      const correctSet = new Set(q.correctAnswer);
      isCorrect =
        userSet.size === correctSet.size &&
        [...correctSet].every(v => userSet.has(v));
    }
  } else if (q.questionType === 'fill_blank') {
    isCorrect =
      String(userAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();
  } else {
    isCorrect = userAns === q.correctAnswer;
  }

  return {
    isAttempted: true,
    isCorrect,
    earnedPoints: isCorrect ? maxPoints : 0,
    maxPoints,
    matchedKeywords: [],
    totalKeywords: 0,
  };
}
