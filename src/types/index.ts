export type UserRole = 'student' | 'lecturer' | 'admin';

export interface User {
  id: string;
  authUid?: string;
  username: string;
  email: string;
  password?: string;
  fullName: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  status: 'active' | 'locked';
  createdAt: string;
  updatedAt?: string;
  lastLogin?: string;
  studentCode?: string;
  lecturerCode?: string;
  className?: string;
  department?: string;
  major?: string;
  assignedSubjectIds?: string[];
  paidSubjectIds?: string[];
  hasPaidExamAccess?: boolean;
  examAccessPaidAt?: string;
  examAccessOrderCode?: string;
}

export interface StudentProfile {
  id: string;
  userId: string;
  studentCode: string;
  fullName: string;
  phone: string;
  className: string;
  major: string;
}

export interface LecturerProfile {
  id: string;
  userId: string;
  lecturerCode: string;
  fullName: string;
  phone: string;
  department: string;
}

export interface LecturerSubjectAssignment {
  id: string;
  lecturerId: string;
  lecturerName?: string;
  subjectId: string;
  assignedAt: string;
}

export type SubjectType = 'theory' | 'practical' | 'project';

export interface Subject {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  description: string;
  category: 'programming' | 'systems' | 'data' | 'software' | 'ai';
  subjectType?: SubjectType;
  credits: number;
  semester: number;
  status: 'active' | 'inactive';
  chaptersCount: number;
  questionsCount: number;
  studentsCount: number;
  assignedLecturerId?: string;
  assignedLecturerName?: string;
  syllabusDocumentId?: string;
  color?: string;
  isHot?: boolean;
}

export interface Chapter {
  id: string;
  subjectId: string;
  chapterNumber: number;
  title: string;
  description: string;
  orderNum: number;
  questionCount?: number;
}

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'essay';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type QuestionUsage = 'practice' | 'exam' | 'both';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  subjectId: string;
  chapterId: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  content: string;
  codeSnippet?: string;
  sampleSolution?: string;
  options?: QuestionOption[];
  correctAnswer: string | string[];
  explanation: string;
  points: number;
  createdBy: string;
  createdAt: string;
  bloomLevel?: BloomLevel;
  sourceReference?: string;
  questionUsage?: QuestionUsage;
}

export interface Exam {
  id: string;
  subjectId: string;
  title: string;
  code: string;
  description: string;
  examFormat?: 'theory' | 'practical';
  durationMinutes: number;
  totalQuestions: number;
  maxScore: number;
  passScore: number;
  allowReview: boolean;
  shuffleQuestions: boolean;
  maxAttempts: number;
  startTime: string;
  endTime: string;
  status: 'published' | 'draft' | 'closed';
  questionIds: string[];
  createdBy: string;
  createdAt: string;
  isOfficialSchoolExam?: boolean;
}

export interface ImageSubmissionAnswer {
  kind: 'image';
  dataUrl: string;
  fileName: string;
  mimeType: string;
  note?: string;
}

export interface AICodeGradingResult {
  isCorrect: boolean;
  score: number;
  maxPoints: number;
  languageCheck?: string;
  summary: string;
  errors: string[];
  suggestions: string[];
  correctedCode?: string;
  gradedBy: 'gemini' | 'fallback';
  gradedAt?: string;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  examTitle: string;
  subjectId: string;
  studentId: string;
  studentName: string;
  startTime: string;
  endTime?: string;
  durationSeconds: number;
  score: number;
  maxScore: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unattempted: number;
  status: 'in_progress' | 'submitted';
  answers: Record<string, any>;
  aiGrading?: Record<string, AICodeGradingResult>;
}

export interface PracticeSession {
  id: string;
  studentId: string;
  subjectId: string;
  chapterId?: string;
  difficulty?: DifficultyLevel;
  totalQuestions: number;
  correctCount: number;
  score: number;
  durationSeconds: number;
  completedAt: string;
  wrongQuestionIds: string[];
}

export interface StudyMaterial {
  id: string;
  subjectId: string;
  chapterId?: string;
  title: string;
  description: string;
  materialCategory?: 'syllabus' | 'lecture' | 'lab' | 'reference';
  content?: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'zip' | 'xlsx';
  fileSize: string;
  downloadCount: number;
  uploadedBy: string;
  uploadedAt: string;
  fileDataUrl?: string;
  originalFileName?: string;
  mimeType?: string;
  serverFileUrl?: string;
}

export interface ProjectTopic {
  id: string;
  subjectId: string;
  code: string;
  title: string;
  description: string;
  guidance: string;
  deliverables: string[];
  maxStudents: number;
  status: 'open' | 'closed';
  createdBy: string;
  createdAt: string;
}

export interface ProjectRegistration {
  id: string;
  subjectId: string;
  topicId: string;
  studentId: string;
  studentName: string;
  studentCode?: string;
  className?: string;
  note?: string;
  repoUrl?: string;
  registeredAt: string;
  status: 'registered' | 'approved' | 'completed';
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'exam' | 'system' | 'study' | 'result';
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  target: string;
  timestamp: string;
  ipAddress: string;
}


// AI Specific Models
export interface LearningDocument {
  id: string;
  subjectId: string;
  chapterId?: string;
  lecturerId?: string;
  title: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'txt';
  fileSize: string;
  description: string;
  filePath?: string;
  uploadedBy: string;
  uploadedAt: string;
  processingStatus: 'uploaded' | 'analyzing' | 'analyzed' | 'failed';
  status?: 'uploaded' | 'analyzing' | 'analyzed' | 'failed' | 'error' | 'pending';
  analysisResult?: {
    subjectName: string;
    courseGoals: string[];
    clos: { code: string; description: string }[];
    chapters: {
      chapterNumber: number;
      title: string;
      summary: string;
      coreConcepts: string[];
    }[];
    keyTopics: string[];
    priorityReview: string[];
  };
  rawContent?: string;
}

export interface DocumentChapter {
  id: string;
  documentId: string;
  chapterNumber: number;
  chapterTitle: string;
  coreConcepts: string[];
  summary: string;
}

export interface AIGenerationJob {
  id: string;
  documentId: string;
  documentTitle: string;
  subjectId: string;
  lecturerId?: string;
  chapterTitle?: string;
  promptConfig: {
    difficulty: DifficultyLevel;
    bloomLevel: BloomLevel;
    questionType: QuestionType;
    questionCount: number;
  };
  requestedCount: number;
  generatedCount: number;
  modelName: string;
  status: 'processing' | 'completed' | 'failed';
  createdBy: string;
  createdAt: string;
}

export interface AIGeneratedQuestion {
  id: string;
  jobId: string;
  documentId: string;
  documentTitle: string;
  subjectId: string;
  chapterId?: string;
  bloomLevel: BloomLevel;
  difficulty: DifficultyLevel;
  questionType: QuestionType;
  content: string;
  codeSnippet?: string;
  options?: QuestionOption[];
  correctAnswer: string | string[];
  explanation: string;
  topic: string;
  sourceReference?: string;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

export interface QuestionReview {
  id: string;
  aiQuestionId: string;
  reviewerId: string;
  reviewerName: string;
  action: 'approved' | 'rejected' | 'modified';
  reviewNotes?: string;
  reviewedAt: string;
}

export interface QuestionSource {
  id: string;
  questionId: string;
  documentId: string;
  documentTitle: string;
  chapterName: string;
  pageOrSection: string;
  citationText: string;
}

export interface AIExplanation {
  id: string;
  questionId: string;
  studentId: string;
  studentAnswer: string;
  aiResponse: {
    isCorrect?: boolean;
    whyCorrect: string;
    whyOthersWrong: { option: string; reason: string }[];
    keyTakeaway: string;
    codeExample?: string;
    textbookCitation?: string;
  };
  createdAt: string;
}

export interface PaymentConfig {
  provider: 'manual' | 'sepay';
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  examFeeVnd: number;
  webhookToken?: string;
  hasWebhookToken?: boolean;
  enabled: boolean;
  updatedAt?: string;
}

export interface ExamPaymentOrder {
  id: string;
  orderCode: string;
  userId: string;
  username: string;
  fullName: string;
  studentCode?: string;
  email: string;
  subjectId?: string;
  subjectName?: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  qrUrl: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  createdAt: string;
  studentSubmittedAt?: string;
  paidAt?: string;
  sepayTransactionId?: string;
  gateway?: string;
  referenceCode?: string;
  confirmedBy?: string;
}

