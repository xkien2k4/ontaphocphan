import React, { useState, useEffect, useMemo } from 'react';
import {
  Subject, SubjectType, Question, Exam, ExamAttempt, User,
  QuestionType, QuestionUsage, DifficultyLevel, LearningDocument, AIGeneratedQuestion,
  StudyMaterial, ProjectTopic, ProjectRegistration, ExamPaymentOrder
} from '../../types';
import {
  Plus, Edit3, Trash2, Download, CheckCircle, Search,
  Code, X, FileText, CheckSquare, AlertCircle,
  Upload, FolderKanban, BookOpen, Check, ExternalLink, RotateCcw,
  QrCode, ShieldCheck, RefreshCw
} from 'lucide-react';
import mammoth from 'mammoth';
import {
  saveQuestion, deleteQuestion, saveExam, deleteExam, getChapters,
  getLearningDocuments, getLearningDocumentsForUser, getAIGeneratedQuestions,
  saveSubject, getStudyMaterials, uploadMaterialToServer, deleteStudyMaterial,
  getProjectTopics, saveProjectTopic, deleteProjectTopic,
  getProjectRegistrations, updateProjectRegistration, cancelProjectRegistration,
  getUploadedQuestionsCount, resetUploadedQuestions,
  getPaymentOrders, adminGrantExamAccess, getUsers, syncUsersWithServer, extractErrorMessage
} from '../../services/storageService';
import {
  downloadStudyMaterialFile,
  fileToDataUrl,
  formatBytesLabel,
  normalizeVietnameseNFC,
  readTextFileCleanly,
} from '../../utils/fileDownload';
import { AILearningDocsManager } from '../ai/AILearningDocsManager';
import { AIQuestionReviewWorkspace } from '../ai/AIQuestionReviewWorkspace';
import { AIDocumentAnalyzerModal } from '../ai/AIDocumentAnalyzerModal';
import { AIQuestionGeneratorModal } from '../ai/AIQuestionGeneratorModal';
import { QuestionBankUploadModal } from './QuestionBankUploadModal';

interface LecturerDashboardProps {
  currentUser: User;
  subjects: Subject[];
  questions: Question[];
  exams: Exam[];
  attempts: ExamAttempt[];
  onRefreshData: () => void;
}

export const LecturerDashboard: React.FC<LecturerDashboardProps> = ({
  currentUser,
  subjects,
  questions,
  exams,
  attempts,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'questions' | 'exams' | 'materials' | 'projects' | 'students' | 'payments' | 'ai_docs' | 'ai_review'>('ai_docs');
  
  // Filter subjects assigned to current lecturer (admin sees all)
  const assignedSubjects = useMemo(() => {
    if (currentUser.role === 'admin') return subjects;
    return subjects.filter(
      s => s.assignedLecturerId === currentUser.id || currentUser.assignedSubjectIds?.includes(s.id)
    );
  }, [currentUser.id, currentUser.role, currentUser.assignedSubjectIds, subjects]);

  const assignedSubjectIds = useMemo(() => assignedSubjects.map(s => s.id), [assignedSubjects]);

  const scopedQuestions = useMemo(
    () => (currentUser.role === 'admin' ? questions : questions.filter(q => assignedSubjectIds.includes(q.subjectId))),
    [currentUser.role, questions, assignedSubjectIds]
  );
  const scopedExams = useMemo(
    () => (currentUser.role === 'admin' ? exams : exams.filter(e => assignedSubjectIds.includes(e.subjectId))),
    [currentUser.role, exams, assignedSubjectIds]
  );
  const scopedAttempts = useMemo(
    () => (currentUser.role === 'admin' ? attempts : attempts.filter(a => assignedSubjectIds.includes(a.subjectId))),
    [currentUser.role, attempts, assignedSubjectIds]
  );

  // AI Documents & Questions state
  const [learningDocs, setLearningDocs] = useState<LearningDocument[]>(() =>
    currentUser.role === 'admin' ? getLearningDocuments() : getLearningDocumentsForUser(currentUser)
  );
  const [aiQuestions, setAiQuestions] = useState<AIGeneratedQuestion[]>(() => getAIGeneratedQuestions());
  const [analyzerDoc, setAnalyzerDoc] = useState<LearningDocument | null>(null);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [generatorDoc, setGeneratorDoc] = useState<LearningDocument | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  useEffect(() => {
    setLearningDocs(currentUser.role === 'admin' ? getLearningDocuments() : getLearningDocumentsForUser(currentUser));
    setAiQuestions(getAIGeneratedQuestions());
  }, [currentUser.id, currentUser.role, subjects]);

  const refreshAiData = () => {
    setLearningDocs(currentUser.role === 'admin' ? getLearningDocuments() : getLearningDocumentsForUser(currentUser));
    setAiQuestions(getAIGeneratedQuestions());
    onRefreshData();
  };

  const handleOpenAnalyzer = (doc: LearningDocument) => {
    setAnalyzerDoc(doc);
    setIsAnalyzerOpen(true);
  };

  const handleOpenGenerator = (doc: LearningDocument) => {
    setGeneratorDoc(doc);
    setIsGeneratorOpen(true);
  };

  // Question Modal state
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [qSubjectId, setQSubjectId] = useState(assignedSubjects[0]?.id || subjects[0]?.id || '');
  const [qChapterId, setQChapterId] = useState('');
  const [qType, setQType] = useState<QuestionType>('single_choice');
  const [qUsage, setQUsage] = useState<QuestionUsage>('practice');
  const [qDifficulty, setQDifficulty] = useState<DifficultyLevel>('medium');
  const [qPoints, setQPoints] = useState<number>(1);
  const [qContent, setQContent] = useState('');
  const [qCode, setQCode] = useState('');
  const [qOptA, setQOptA] = useState('');
  const [qOptB, setQOptB] = useState('');
  const [qOptC, setQOptC] = useState('');
  const [qOptD, setQOptD] = useState('');
  const [qCorrect, setQCorrect] = useState('opt_1');
  const [qCorrectMulti, setQCorrectMulti] = useState<string[]>(['opt_1']);
  const [qSampleSolution, setQSampleSolution] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [questionModalError, setQuestionModalError] = useState<string | null>(null);

  // Word / Excel Upload Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const allChapters = useMemo(() => getChapters(), [subjects, isUploadModalOpen]);

  // Create Subject Modal state (Lecturer can create subjects too)
  const [isCreateSubjectOpen, setIsCreateSubjectOpen] = useState(false);
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subNameEn, setSubNameEn] = useState('');
  const [subType, setSubType] = useState<SubjectType>('theory');
  const [subCategory, setSubCategory] = useState<'programming' | 'systems' | 'data' | 'software' | 'ai'>('programming');
  const [subCredits, setSubCredits] = useState<number>(3);
  const [subSemester, setSubSemester] = useState<number>(1);
  const [subDesc, setSubDesc] = useState('');
  const [subModalError, setSubModalError] = useState<string | null>(null);

  // Exam Modal state
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [exSubjectId, setExSubjectId] = useState(assignedSubjects[0]?.id || subjects[0]?.id || '');
  const [exFormat, setExFormat] = useState<'theory' | 'practical'>('theory');
  const [exTitle, setExTitle] = useState('');
  const [exCode, setExCode] = useState('');
  const [exDuration, setExDuration] = useState(45);
  const [exQuestionsCount, setExQuestionsCount] = useState(45);
  const [exMaxScore, setExMaxScore] = useState(10);
  const [examModalError, setExamModalError] = useState<string | null>(null);

  // Materials (Đề cương & Bài giảng tải về không lỗi font) state
  const [materials, setMaterials] = useState<StudyMaterial[]>(() => getStudyMaterials());
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [matSubjectId, setMatSubjectId] = useState(assignedSubjects[0]?.id || subjects[0]?.id || '');
  const [matCategory, setMatCategory] = useState<'syllabus' | 'lecture' | 'lab' | 'reference'>('syllabus');
  const [matTitle, setMatTitle] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matFileType, setMatFileType] = useState<'pdf' | 'docx' | 'pptx' | 'xlsx' | 'zip'>('docx');
  const [matContent, setMatContent] = useState('');
  const [matFileDataUrl, setMatFileDataUrl] = useState<string>('');
  const [matOriginalFileName, setMatOriginalFileName] = useState<string>('');
  const [matMimeType, setMatMimeType] = useState<string>('');
  const [matFileSizeLabel, setMatFileSizeLabel] = useState<string>('');
  const [matSaving, setMatSaving] = useState(false);
  const [matModalError, setMatModalError] = useState<string | null>(null);

  // Project Topics & Student Registrations state (Đồ án học phần)
  const [projectTopics, setProjectTopics] = useState<ProjectTopic[]>(() => getProjectTopics());
  const [projectRegistrations, setProjectRegistrations] = useState<ProjectRegistration[]>(() => getProjectRegistrations());
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<ProjectTopic | null>(null);
  const [topicSubjectId, setTopicSubjectId] = useState('');
  const [topicCode, setTopicCode] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDesc, setTopicDesc] = useState('');
  const [topicGuidance, setTopicGuidance] = useState('');
  const [topicDeliverablesText, setTopicDeliverablesText] = useState('');
  const [topicMaxStudents, setTopicMaxStudents] = useState(3);
  const [topicStatus, setTopicStatus] = useState<'open' | 'closed'>('open');
  const [topicModalError, setTopicModalError] = useState<string | null>(null);

  // Confirm delete modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Lecturer 10k/subject Payment Verification state
  const [paymentOrders, setPaymentOrders] = useState<ExamPaymentOrder[]>([]);
  const [allUsersList, setAllUsersList] = useState<User[]>(() => getUsers());
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'mine'>('all');
  const [quickStudentId, setQuickStudentId] = useState('');
  const [quickSubjectId, setQuickSubjectId] = useState(assignedSubjects[0]?.id || subjects[0]?.id || '');
  const [confirmingPaymentKey, setConfirmingPaymentKey] = useState<string | null>(null);

  const refreshMaterialsAndProjects = () => {
    setMaterials(getStudyMaterials());
    setProjectTopics(getProjectTopics());
    setProjectRegistrations(getProjectRegistrations());
  };

  const loadLecturerPayments = async () => {
    setLoadingPayments(true);
    try {
      const [orders, syncedUsers] = await Promise.all([
        getPaymentOrders(),
        syncUsersWithServer().catch(() => getUsers()),
      ]);
      setPaymentOrders(orders || []);
      setAllUsersList(syncedUsers || getUsers());
    } catch (err: any) {
      setNotificationMsg(extractErrorMessage(err, 'Không thể tải danh sách giao dịch từ máy chủ.'));
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    refreshMaterialsAndProjects();
  }, [subjects, currentUser.id]);

  useEffect(() => {
    if (activeTab === 'payments') {
      void loadLecturerPayments();
    }
  }, [activeTab]);

  useEffect(() => {
    const defaultSub = assignedSubjects[0]?.id || subjects[0]?.id || '';
    if (defaultSub && !assignedSubjects.some(s => s.id === qSubjectId)) {
      setQSubjectId(defaultSub);
    }
    if (defaultSub && !assignedSubjects.some(s => s.id === exSubjectId)) {
      setExSubjectId(defaultSub);
    }
  }, [assignedSubjects, subjects]);

  const availableChaptersForModal = useMemo(
    () => (qSubjectId ? getChapters(qSubjectId) : []),
    [qSubjectId, isQuestionModalOpen]
  );

  useEffect(() => {
    if (availableChaptersForModal.length > 0 && !availableChaptersForModal.some(c => c.id === qChapterId)) {
      setQChapterId(availableChaptersForModal[0].id);
    } else if (availableChaptersForModal.length === 0) {
      setQChapterId('ch_general');
    }
  }, [availableChaptersForModal]);

  const showToast = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(null), 3500);
  };

  const handleLecturerConfirmPayment = async (
    userId: string,
    subjectId: string,
    subjectName?: string,
    orderCode?: string
  ) => {
    const key = orderCode || `${userId}_${subjectId}`;
    const resolvedSubName = subjectName || subjects.find(s => s.id === subjectId)?.name || subjectId;
    setConfirmingPaymentKey(key);
    try {
      const res = await adminGrantExamAccess(
        userId,
        subjectId,
        resolvedSubName,
        orderCode,
        `Giảng viên: ${currentUser.fullName}`
      );
      if (Array.isArray(res.orders)) setPaymentOrders(res.orders);
      if (Array.isArray(res.users)) setAllUsersList(res.users);
      onRefreshData();
      showToast(`Đã xác nhận 10.000đ & mở khóa môn "${resolvedSubName}" cho sinh viên!`);
    } catch (err: any) {
      showToast(extractErrorMessage(err, 'Lỗi khi xác nhận mở khóa môn thi.'));
    } finally {
      setConfirmingPaymentKey(null);
    }
  };

  const handleOpenNewQuestion = () => {
    const defaultSub = assignedSubjects[0]?.id || subjects[0]?.id || '';
    const subObj = subjects.find(s => s.id === defaultSub);
    const chaps = defaultSub ? getChapters(defaultSub) : [];
    const isPrac = subObj?.subjectType === 'practical';
    setEditingQuestion(null);
    setQSubjectId(defaultSub);
    setQChapterId(chaps[0]?.id || 'ch_general');
    setQType(isPrac ? 'essay' : 'single_choice');
    setQUsage('practice');
    setQDifficulty('medium');
    setQPoints(isPrac ? 5 : 1);
    setQContent('');
    setQCode('');
    setQOptA('');
    setQOptB('');
    setQOptC('');
    setQOptD('');
    setQCorrect(isPrac ? '' : 'opt_1');
    setQCorrectMulti(['opt_1']);
    setQSampleSolution('');
    setQExplanation('');
    setQuestionModalError(null);
    setIsQuestionModalOpen(true);
  };

  const handleOpenEditQuestion = (q: Question) => {
    setEditingQuestion(q);
    setQSubjectId(q.subjectId);
    const chaps = getChapters(q.subjectId);
    setQChapterId(q.chapterId || chaps[0]?.id || 'ch_general');
    setQType(q.questionType);
    setQUsage(q.questionUsage || 'practice');
    setQDifficulty(q.difficulty);
    setQPoints(q.points || 1);
    setQContent(q.content);
    setQCode(q.codeSnippet || '');
    setQOptA(q.options?.[0]?.text || '');
    setQOptB(q.options?.[1]?.text || '');
    setQOptC(q.options?.[2]?.text || '');
    setQOptD(q.options?.[3]?.text || '');
    if (q.questionType === 'multiple_choice') {
      setQCorrectMulti(Array.isArray(q.correctAnswer) ? q.correctAnswer : [String(q.correctAnswer || 'opt_1')]);
      setQCorrect('opt_1');
    } else if (q.questionType === 'essay' || q.questionType === 'fill_blank') {
      setQCorrect(Array.isArray(q.correctAnswer) ? (q.correctAnswer[0] || '') : String(q.correctAnswer || ''));
      setQCorrectMulti(['opt_1']);
    } else {
      setQCorrect(Array.isArray(q.correctAnswer) ? (q.correctAnswer[0] || 'opt_1') : String(q.correctAnswer || 'opt_1'));
      setQCorrectMulti(['opt_1']);
    }
    setQSampleSolution(q.sampleSolution || '');
    setQExplanation(q.explanation || '');
    setQuestionModalError(null);
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuestionModalError(null);
    if (!qSubjectId) {
      setQuestionModalError('Chưa có môn học được phân công để thêm câu hỏi.');
      return;
    }
    if (!qContent.trim()) {
      setQuestionModalError('Vui lòng nhập nội dung câu hỏi.');
      return;
    }
    if (qType === 'multiple_choice' && qCorrectMulti.length === 0) {
      setQuestionModalError('Vui lòng chọn ít nhất một đáp án đúng cho câu hỏi nhiều lựa chọn.');
      return;
    }

    const options = qType === 'single_choice' || qType === 'multiple_choice' ? [
      { id: 'opt_1', text: qOptA.trim() || 'Phương án A' },
      { id: 'opt_2', text: qOptB.trim() || 'Phương án B' },
      { id: 'opt_3', text: qOptC.trim() || 'Phương án C' },
      { id: 'opt_4', text: qOptD.trim() || 'Phương án D' },
    ] : qType === 'true_false' ? [
      { id: 'opt_true', text: 'Đúng' },
      { id: 'opt_false', text: 'Sai' },
    ] : [];

    const resolvedCorrectAnswer =
      qType === 'multiple_choice'
        ? qCorrectMulti
        : qType === 'true_false'
        ? (qCorrect === 'opt_true' ? 'opt_true' : 'opt_false')
        : qCorrect;

    saveQuestion({
      id: editingQuestion?.id,
      subjectId: qSubjectId,
      chapterId: qChapterId || 'ch_general',
      questionType: qType,
      questionUsage: qUsage,
      difficulty: qDifficulty,
      content: normalizeVietnameseNFC(qContent.trim()),
      codeSnippet: qCode.trim() || undefined,
      options,
      correctAnswer: resolvedCorrectAnswer,
      sampleSolution: qType === 'essay' ? (qSampleSolution.trim() || undefined) : undefined,
      explanation: normalizeVietnameseNFC(qExplanation.trim()),
      points: Number(qPoints) > 0 ? Number(qPoints) : 1.0,
      createdBy: editingQuestion?.createdBy || currentUser.fullName,
    });

    onRefreshData();
    setIsQuestionModalOpen(false);
    showToast(editingQuestion ? 'Đã cập nhật câu hỏi thành công!' : 'Đã lưu câu hỏi thành công vào ngân hàng!');
  };

  const handleDeleteQ = (id: string) => {
    setConfirmModal({
      title: 'Xóa câu hỏi khỏi ngân hàng',
      message: 'Bạn có chắc chắn muốn xóa câu hỏi này? Thao tác này không thể hoàn tác.',
      onConfirm: () => {
        deleteQuestion(id);
        setConfirmModal(null);
        onRefreshData();
        showToast('Đã xóa câu hỏi khỏi ngân hàng.');
      },
    });
  };

  const handleOpenCreateExam = () => {
    const defaultSubId = assignedSubjects[0]?.id || subjects[0]?.id || '';
    const subObj = subjects.find(s => s.id === defaultSubId);
    const isPrac = subObj?.subjectType === 'practical';
    setExSubjectId(defaultSubId);
    setExFormat(isPrac ? 'practical' : 'theory');
    setExDuration(isPrac ? 90 : 45);
    setExQuestionsCount(isPrac ? 2 : 45);
    setExMaxScore(10);
    setExTitle('');
    setExCode('');
    setExamModalError(null);
    setIsExamModalOpen(true);
  };

  const handleExamSubjectChange = (newSubId: string) => {
    setExSubjectId(newSubId);
    const subObj = subjects.find(s => s.id === newSubId);
    const isPrac = subObj?.subjectType === 'practical';
    setExFormat(isPrac ? 'practical' : 'theory');
    setExDuration(isPrac ? 90 : 45);
    setExQuestionsCount(isPrac ? 2 : 45);
  };

  const handleSaveExamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setExamModalError(null);
    if (!exSubjectId) {
      setExamModalError('Vui lòng chọn môn học.');
      return;
    }
    if (!exTitle.trim() || !exCode.trim()) {
      setExamModalError('Vui lòng nhập đầy đủ tên đề thi và mã đề thi.');
      return;
    }

    const subjectQs = questions.filter(q => q.subjectId === exSubjectId);
    if (subjectQs.length === 0) {
      setExamModalError('Môn học này chưa có câu hỏi nào trong ngân hàng. Vui lòng thêm hoặc upload câu hỏi từ Word/Excel trước khi tạo đề thi.');
      return;
    }

    const safeQuestionsCount = Math.max(1, Number(exQuestionsCount) || (exFormat === 'practical' ? 2 : 45));
    const safeDuration = Math.max(5, Number(exDuration) || 45);
    const safeMaxScore = Math.max(1, Number(exMaxScore) || 10);

    // For practical format, prioritize essay/coding questions (2 questions = 10 pts)
    const prioritized =
      exFormat === 'practical'
        ? [
            ...subjectQs.filter(q => q.questionType === 'essay'),
            ...subjectQs.filter(q => q.questionType !== 'essay'),
          ]
        : subjectQs;
    const chosenQIds = prioritized
      .slice(0, Math.min(safeQuestionsCount, prioritized.length))
      .map(q => q.id);

    saveExam({
      subjectId: exSubjectId,
      title: exTitle.trim(),
      code: exCode.trim().toUpperCase(),
      description:
        exFormat === 'practical'
          ? `Đề thi thử thực hành (${safeQuestionsCount} câu lập trình · thang điểm tối đa ${safeMaxScore} điểm)`
          : `Đề thi kiểm tra kiến thức ${exTitle.trim()}`,
      examFormat: exFormat,
      durationMinutes: safeDuration,
      totalQuestions: safeQuestionsCount,
      maxScore: safeMaxScore,
      passScore: 0,
      allowReview: true,
      shuffleQuestions: exFormat !== 'practical',
      maxAttempts: 5,
      startTime: new Date().toISOString(),
      endTime: '2026-12-31T23:59:59Z',
      status: 'published',
      questionIds: chosenQIds,
      createdBy: currentUser.fullName,
      isOfficialSchoolExam: true,
    });

    onRefreshData();
    setIsExamModalOpen(false);
    setExTitle('');
    setExCode('');
    showToast('Đã xuất bản đề thi mới thành công!');
  };

  const handleCreateSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubModalError(null);
    if (!subCode.trim() || !subName.trim()) {
      setSubModalError('Vui lòng nhập đầy đủ mã học phần và tên môn học.');
      return;
    }
    try {
      saveSubject({
        code: subCode.trim().toUpperCase(),
        name: subName.trim(),
        nameEn: subNameEn.trim(),
        subjectType: subType,
        category: subCategory,
        credits: subCredits,
        semester: subSemester,
        description: subDesc.trim() || `Học phần chuyên ngành CNTT do ${currentUser.fullName} phụ trách.`,
        assignedLecturerId: currentUser.id,
        assignedLecturerName: currentUser.fullName,
        status: 'active',
      });
      onRefreshData();
      setIsCreateSubjectOpen(false);
      setSubCode('');
      setSubName('');
      setSubNameEn('');
      setSubDesc('');
      showToast(`Đã tạo môn học [${subCode.trim().toUpperCase()}] - ${subName.trim()}!`);
    } catch (err: any) {
      setSubModalError(err.message || 'Lỗi khi tạo môn học.');
    }
  };

  const handleOpenCreateMaterial = () => {
    setMatSubjectId(assignedSubjects[0]?.id || subjects[0]?.id || '');
    setMatCategory('syllabus');
    setMatTitle('');
    setMatDesc('');
    setMatFileType('docx');
    setMatContent('');
    setMatFileDataUrl('');
    setMatOriginalFileName('');
    setMatMimeType('');
    setMatFileSizeLabel('');
    setMatModalError(null);
    setIsMaterialModalOpen(true);
  };

  const handleLoadMaterialFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatModalError(null);

    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMatModalError('Dung lượng tệp vượt quá giới hạn 8 MB. Vui lòng nén nhỏ hơn rồi tải lên lại.');
      e.target.value = '';
      return;
    }

    try {
      const lower = file.name.toLowerCase();
      if (!matTitle.trim()) {
        setMatTitle(normalizeVietnameseNFC(file.name.replace(/\.[^/.]+$/, '')));
      }

      const dataUrl = await fileToDataUrl(file);
      setMatFileDataUrl(dataUrl);
      setMatOriginalFileName(normalizeVietnameseNFC(file.name));
      setMatMimeType(file.type || 'application/octet-stream');
      setMatFileSizeLabel(formatBytesLabel(file.size));

      if (lower.endsWith('.pdf')) {
        setMatFileType('pdf');
      } else if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
        setMatFileType('pptx');
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        setMatFileType('xlsx');
      } else if (lower.endsWith('.zip') || lower.endsWith('.rar')) {
        setMatFileType('zip');
      } else {
        setMatFileType('docx');
      }

      if (lower.endsWith('.docx')) {
        const buf = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buf });
        if (res.value?.trim()) {
          setMatContent(normalizeVietnameseNFC(res.value.trim()));
        }
      } else if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv')) {
        const cleanText = await readTextFileCleanly(file);
        setMatContent(cleanText);
      }
    } catch (err: any) {
      setMatModalError(err.message || 'Không đọc được tệp tin đã chọn.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMatModalError(null);
    if (!matSubjectId || !matTitle.trim()) {
      setMatModalError('Vui lòng chọn môn học và nhập tiêu đề tài liệu.');
      return;
    }
    if (!matFileDataUrl && !matContent.trim()) {
      setMatModalError('Vui lòng chọn tệp gốc tải lên (.pdf, .docx, .pptx, .xlsx, .txt...) hoặc nhập nội dung văn bản.');
      return;
    }

    setMatSaving(true);
    try {
      const cleanTitle = normalizeVietnameseNFC(matTitle.trim());
      const cleanDesc = normalizeVietnameseNFC(matDesc.trim() || 'Tài liệu học tập chính thức của học phần.');
      const cleanContent = normalizeVietnameseNFC(matContent.trim());

      await uploadMaterialToServer({
        subjectId: matSubjectId,
        title: cleanTitle,
        description: cleanDesc,
        materialCategory: matCategory,
        fileType: matFileType,
        fileSize:
          matFileSizeLabel ||
          `${Math.max(0.1, Math.round((Math.max(1024, cleanContent.length * 2) / (1024 * 1024)) * 10) / 10)} MB`,
        content: cleanContent || cleanDesc,
        uploadedBy: currentUser.fullName,
        fileDataUrl: matFileDataUrl || undefined,
        originalFileName: matOriginalFileName || undefined,
        mimeType: matMimeType || undefined,
      });

      refreshMaterialsAndProjects();
      onRefreshData();
      setIsMaterialModalOpen(false);
      showToast(`Đã đăng tải "${cleanTitle}"! Sinh viên tải về để xem đúng nguyên bản không lỗi phông chữ.`);
    } catch (err: any) {
      setMatModalError(err?.message || 'Lỗi khi lưu tài liệu lên máy chủ.');
    } finally {
      setMatSaving(false);
    }
  };

  const handleOpenNewTopic = () => {
    const projectSub =
      assignedSubjects.find(s => s.subjectType === 'project')?.id ||
      subjects.find(s => s.subjectType === 'project')?.id ||
      assignedSubjects[0]?.id ||
      subjects[0]?.id ||
      '';
    setEditingTopic(null);
    setTopicSubjectId(projectSub);
    setTopicCode(`DA-${String(projectTopics.length + 1).padStart(2, '0')}`);
    setTopicTitle('');
    setTopicDesc('');
    setTopicGuidance('');
    setTopicDeliverablesText('Báo cáo phân tích thiết kế\nMã nguồn ứng dụng trên GitHub\nSlide & Demo bảo vệ');
    setTopicMaxStudents(3);
    setTopicStatus('open');
    setTopicModalError(null);
    setIsTopicModalOpen(true);
  };

  const handleOpenEditTopic = (t: ProjectTopic) => {
    setEditingTopic(t);
    setTopicSubjectId(t.subjectId);
    setTopicCode(t.code);
    setTopicTitle(t.title);
    setTopicDesc(t.description);
    setTopicGuidance(t.guidance);
    setTopicDeliverablesText((t.deliverables || []).join('\n'));
    setTopicMaxStudents(t.maxStudents);
    setTopicStatus(t.status);
    setTopicModalError(null);
    setIsTopicModalOpen(true);
  };

  const handleSaveTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTopicModalError(null);
    if (!topicSubjectId || !topicTitle.trim()) {
      setTopicModalError('Vui lòng chọn học phần và nhập tên đề tài đồ án.');
      return;
    }
    const deliverables = topicDeliverablesText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    saveProjectTopic({
      id: editingTopic?.id,
      subjectId: topicSubjectId,
      code: topicCode.trim() || undefined,
      title: topicTitle.trim(),
      description: topicDesc.trim(),
      guidance: topicGuidance.trim(),
      deliverables,
      maxStudents: Number(topicMaxStudents) || 3,
      status: topicStatus,
      createdBy: editingTopic?.createdBy || currentUser.fullName,
    });
    refreshMaterialsAndProjects();
    onRefreshData();
    setIsTopicModalOpen(false);
    showToast(editingTopic ? 'Đã cập nhật đề tài đồ án!' : 'Đã thêm đề tài đồ án mới!');
  };

  const handleDeleteEx = (id: string) => {
    setConfirmModal({
      title: 'Xóa đề thi thử',
      message: 'Bạn có chắc chắn muốn xóa đề thi này khỏi hệ thống?',
      onConfirm: () => {
        deleteExam(id);
        setConfirmModal(null);
        onRefreshData();
        showToast('Đã xóa đề thi.');
      },
    });
  };

  // Export to Excel / CSV
  const handleExportExcel = () => {
    const csvRows = [
      ['Mã đề', 'Tên đề thi', 'Sinh viên', 'Điểm số', 'Đúng/Tổng', 'Thời gian nộp'].join(','),
      ...scopedAttempts.map(a => [
        `"${a.examId}"`,
        `"${a.examTitle}"`,
        `"${a.studentName}"`,
        (a.score ?? 0).toFixed(1),
        `"${a.correctAnswers}/${a.totalQuestions}"`,
        `"${new Date(a.startTime).toLocaleString('vi-VN')}"`,
      ].join(',')),
    ];

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ket_qua_thi_sinh_vien_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Đã xuất danh sách kết quả học tập ra file Excel (CSV)!');
  };

  const filteredQuestions = scopedQuestions.filter(q =>
    (q.content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (q.explanation || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingAiCount = aiQuestions.filter(
    q => q.status === 'pending_review' && (currentUser.role === 'admin' || assignedSubjectIds.includes(q.subjectId))
  ).length;

  const scopedMaterials = useMemo(
    () => (currentUser.role === 'admin' ? materials : materials.filter(m => assignedSubjectIds.includes(m.subjectId))),
    [currentUser.role, materials, assignedSubjectIds]
  );

  const projectEligibleSubjectIds = useMemo(() => {
    const projectSubs = subjects.filter(s => s.subjectType === 'project').map(s => s.id);
    return Array.from(new Set([...assignedSubjectIds, ...projectSubs]));
  }, [assignedSubjectIds, subjects]);

  const scopedProjectTopics = useMemo(
    () => (currentUser.role === 'admin' ? projectTopics : projectTopics.filter(t => projectEligibleSubjectIds.includes(t.subjectId))),
    [currentUser.role, projectTopics, projectEligibleSubjectIds]
  );

  const scopedProjectRegs = useMemo(
    () => (currentUser.role === 'admin' ? projectRegistrations : projectRegistrations.filter(r => projectEligibleSubjectIds.includes(r.subjectId))),
    [currentUser.role, projectRegistrations, projectEligibleSubjectIds]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
            Bộ môn & Quản lý Học phần
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Bảng Điều Khiển Giảng Viên
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Chào mừng {currentUser.fullName} · {currentUser.department} · Phụ trách {assignedSubjects.length} môn học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setSubModalError(null);
              setIsCreateSubjectOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Môn học mới</span>
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Đề Word / Excel</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Xuất kết quả (Excel)</span>
          </button>
        </div>
      </div>

      {notificationMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-3">
        <div className="flex">
          <button
            onClick={() => setActiveTab('ai_docs')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'ai_docs'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-500" />
            <span>Tài liệu & AI Phân tích ({learningDocs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ai_review')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'ai_review'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
            <span>Duyệt câu hỏi AI</span>
            {pendingAiCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {pendingAiCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('questions')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'questions'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ngân hàng Câu hỏi ({scopedQuestions.length})
          </button>

          <button
            onClick={() => setActiveTab('exams')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'exams'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Quản lý Đề thi ({scopedExams.length})
          </button>

          <button
            onClick={() => setActiveTab('materials')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'materials'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Đề cương & Bài giảng ({scopedMaterials.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('projects')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'projects'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Đồ án & Đề tài ({scopedProjectTopics.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'students'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Kết quả Sinh viên ({scopedAttempts.length})
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'payments'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-600" />
            <span>Xác nhận Thanh toán (10k/môn)</span>
            {paymentOrders.filter(o => o.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {paymentOrders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'questions' && (() => {
          const uploadedCount = getUploadedQuestionsCount();
          return (
            <div className="flex items-center gap-2 shrink-0">
              {uploadedCount > 0 && (
                <button
                  onClick={() =>
                    setConfirmModal({
                      title: 'Reset câu hỏi đã upload',
                      message: `Xóa toàn bộ ${uploadedCount} câu hỏi cũ đã tải lên (và đề thi tự tạo rỗng tương ứng), đồng thời đặt lại số lượng câu hỏi của các học phần phụ trách về mặc định?`,
                      onConfirm: () => {
                        const res = resetUploadedQuestions();
                        setConfirmModal(null);
                        onRefreshData();
                        showToast(`Đã xóa ${res.removedQuestions} câu hỏi đã upload và đặt lại số lượng câu hỏi!`);
                      },
                    })
                  }
                  className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset câu hỏi đã upload ({uploadedCount})</span>
                </button>
              )}
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Nhập Word/Excel</span>
              </button>
              <button
                onClick={handleOpenNewQuestion}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm câu hỏi mới</span>
              </button>
            </div>
          );
        })()}

        {activeTab === 'exams' && (
          <button
            onClick={handleOpenCreateExam}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo đề thi mới</span>
          </button>
        )}

        {activeTab === 'materials' && (
          <button
            onClick={handleOpenCreateMaterial}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Đăng Đề cương / Bài giảng</span>
          </button>
        )}

        {activeTab === 'projects' && (
          <button
            onClick={handleOpenNewTopic}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Đề tài Đồ án</span>
          </button>
        )}
      </div>

      {/* Tab 1: Questions Management */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Tìm câu hỏi theo nội dung..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-3">
            {filteredQuestions.map((q) => (
              <div
                key={q.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col md:flex-row md:items-start justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                      {q.subjectId}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      q.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-700' :
                      q.difficulty === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {q.difficulty}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      q.questionUsage === 'exam'
                        ? 'bg-rose-100 text-rose-800'
                        : q.questionUsage === 'both'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {q.questionUsage === 'exam'
                        ? 'Hệ thống thi thử (Đề cương)'
                        : q.questionUsage === 'both'
                        ? 'Ôn tập & Thi thử'
                        : 'Ôn tập'}
                    </span>
                    <span className="text-[11px] text-slate-400">· {q.points} điểm · Tạo bởi {q.createdBy}</span>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    {q.content}
                  </p>

                  {q.codeSnippet && (
                    <div className="p-3 bg-slate-900 font-mono text-[11px] text-slate-200 rounded-xl max-h-32 overflow-y-auto">
                      <pre>{q.codeSnippet}</pre>
                    </div>
                  )}

                  {q.sampleSolution && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        Code mẫu / Đáp án thực hành chuẩn:
                      </span>
                      <div className="p-3 bg-slate-950 font-mono text-[11px] text-emerald-400 rounded-xl max-h-40 overflow-y-auto">
                        <pre>{q.sampleSolution}</pre>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 italic">
                    Giải thích: {q.explanation}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleOpenEditQuestion(q)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
                    title="Chỉnh sửa câu hỏi"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteQ(q.id)}
                    className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                    title="Xóa câu hỏi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Exams Management */}
      {activeTab === 'exams' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scopedExams.map((ex) => (
            <div
              key={ex.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                    {ex.code}
                  </span>
                  <span className="text-xs text-slate-500">{ex.durationMinutes} phút</span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{ex.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{ex.description}</p>

                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div>Số câu hỏi: <strong>{ex.examFormat === 'practical' ? 2 : ex.totalQuestions} câu</strong></div>
                  <div>Thang điểm tối đa: <strong>{ex.maxScore} điểm</strong></div>
                  <div>Trạng thái: <strong className="text-emerald-600 uppercase">{ex.status}</strong></div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => handleDeleteEx(ex.id)}
                  className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg font-medium"
                >
                  Xóa đề thi
                </button>
              </div>
            </div>
          ))}
          {scopedExams.length === 0 && (
            <div className="md:col-span-2 p-8 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              Chưa có đề thi nào cho các môn học được phân công.
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Students Results & Accuracy */}
      {activeTab === 'students' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Kết quả làm bài thi của sinh viên
            </h3>
            <span className="text-xs text-slate-500">{scopedAttempts.length} lượt nộp bài</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="py-3 px-3">Sinh viên</th>
                  <th className="py-3 px-3">Đề thi</th>
                  <th className="py-3 px-3">Thời gian nộp</th>
                  <th className="py-3 px-3 text-center">Đúng / Tổng</th>
                  <th className="py-3 px-3 text-right">Điểm số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {scopedAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {att.studentName}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {att.examTitle}
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {new Date(att.startTime).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      {att.correctAnswers} / {att.totalQuestions}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                      {(att.score ?? 0).toFixed(1)} / {att.maxScore}
                    </td>
                  </tr>
                ))}
                {scopedAttempts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Chưa có sinh viên nào nộp bài cho các học phần được phân công.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: AI Learning Documents & Analysis */}
      {activeTab === 'ai_docs' && (
        <AILearningDocsManager
          currentUser={currentUser}
          documents={learningDocs}
          subjects={assignedSubjects}
          onRefreshDocs={refreshAiData}
          onOpenAnalyzerModal={handleOpenAnalyzer}
          onOpenGeneratorModal={handleOpenGenerator}
        />
      )}

      {/* Tab 5: AI Question Review & Staging Workspace */}
      {activeTab === 'ai_review' && (
        <AIQuestionReviewWorkspace
          currentUser={currentUser}
          questions={aiQuestions}
          subjects={assignedSubjects}
          onRefreshData={refreshAiData}
          onOpenGenerator={() => {
            if (learningDocs.length > 0) {
              handleOpenGenerator(learningDocs[0]);
            } else {
              setActiveTab('ai_docs');
            }
          }}
        />
      )}

      {/* Tab 6: Study Materials (Kho Đề cương & Bài giảng - Tải về để xem chuẩn Unicode/Bản gốc) */}
      {activeTab === 'materials' && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 text-xs text-blue-900 dark:text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold">Kho Đề cương chi tiết & Bài giảng (Tải về để xem nguyên bản)</div>
              <p className="text-blue-700 dark:text-blue-300 mt-0.5">
                Tài liệu tải lên được lưu giữ nguyên định dạng nhị phân gốc (.pdf, .docx, .pptx, .xlsx) hoặc xuất .docx chuẩn Unicode NFC (Times New Roman) để sinh viên tải về mở không lỗi phông chữ.
              </p>
            </div>
            <button
              onClick={handleOpenCreateMaterial}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shrink-0"
            >
              + Đăng tài liệu mới
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scopedMaterials.map((mat) => {
              const sub = subjects.find(s => s.id === mat.subjectId);
              return (
                <div
                  key={mat.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                          {sub?.code || mat.subjectId}
                        </span>
                        {sub?.isHot && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                            HOT
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            mat.materialCategory === 'syllabus'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : mat.materialCategory === 'lab'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {mat.materialCategory === 'syllabus'
                            ? 'Đề cương học phần'
                            : mat.materialCategory === 'lab'
                            ? 'Hướng dẫn thực hành / Đồ án'
                            : mat.materialCategory === 'reference'
                            ? 'Tài liệu tham khảo'
                            : 'Bài giảng'}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 uppercase">{mat.fileType} · {mat.fileSize}</span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{mat.title}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2">{mat.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400 text-[11px]">{mat.uploadedBy}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadStudyMaterialFile(mat, sub ? `${sub.code} - ${sub.name}` : undefined)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold flex items-center gap-1 hover:bg-blue-700"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải về để xem</span>
                      </button>
                      <button
                        onClick={() =>
                          setConfirmModal({
                            title: 'Xóa tài liệu học tập',
                            message: `Bạn có chắc chắn muốn xóa tài liệu "${mat.title}"?`,
                            onConfirm: () => {
                              deleteStudyMaterial(mat.id);
                              setConfirmModal(null);
                              refreshMaterialsAndProjects();
                              onRefreshData();
                              showToast('Đã xóa tài liệu học tập.');
                            },
                          })
                        }
                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg"
                        title="Xóa tài liệu"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {scopedMaterials.length === 0 && (
              <div className="md:col-span-2 p-8 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                Chưa có đề cương hay bài giảng nào cho các môn phụ trách.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Project Topics & Student Registrations (Đồ án học phần) */}
      {activeTab === 'projects' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scopedProjectTopics.map((topic) => {
              const sub = subjects.find(s => s.id === topic.subjectId);
              const regs = scopedProjectRegs.filter(r => r.topicId === topic.id);
              return (
                <div
                  key={topic.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                          {topic.code}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {sub ? `${sub.code} · ${sub.name}` : topic.subjectId}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          topic.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {topic.status === 'open' ? 'Đang mở đăng ký' : 'Đã đóng'}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{topic.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{topic.description}</p>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">
                      <strong className="block text-[11px] text-slate-500 mb-1">Hướng dẫn thực hiện:</strong>
                      {topic.guidance}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500">
                      Đã đăng ký: <strong className="text-slate-900 dark:text-white">{regs.length}/{topic.maxStudents}</strong> SV
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditTopic(topic)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() =>
                          setConfirmModal({
                            title: 'Xóa đề tài đồ án',
                            message: `Bạn có chắc chắn muốn xóa đề tài "${topic.code} - ${topic.title}"?`,
                            onConfirm: () => {
                              deleteProjectTopic(topic.id);
                              setConfirmModal(null);
                              refreshMaterialsAndProjects();
                              onRefreshData();
                              showToast('Đã xóa đề tài đồ án.');
                            },
                          })
                        }
                        className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950 font-semibold"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {scopedProjectTopics.length === 0 && (
              <div className="md:col-span-2 p-8 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                Chưa có đề tài đồ án nào. Nhấn &quot;Thêm Đề tài Đồ án&quot; để khởi tạo danh sách đề tài cho sinh viên đăng ký.
              </div>
            )}
          </div>

          {/* Student Project Registrations Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Danh sách Sinh viên Đăng ký Đề tài Đồ án ({scopedProjectRegs.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="py-2.5 px-3">Sinh viên</th>
                    <th className="py-2.5 px-3">Đề tài đăng ký</th>
                    <th className="py-2.5 px-3">Ghi chú & GitHub</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {scopedProjectRegs.map((reg) => {
                    const topic = projectTopics.find(t => t.id === reg.topicId);
                    return (
                      <tr key={reg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">{reg.studentName}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {reg.studentCode || 'SV'} · {reg.className || 'CNTT'}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {topic ? `${topic.code}: ${topic.title}` : reg.topicId}
                          </div>
                        </td>
                        <td className="py-3 px-3 space-y-1 max-w-xs">
                          {reg.note && <div className="text-slate-600 dark:text-slate-400 line-clamp-2">{reg.note}</div>}
                          {reg.repoUrl && (
                            <a
                              href={reg.repoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline font-mono text-[11px]"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>GitHub Repo</span>
                            </a>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              reg.status === 'approved'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : reg.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {reg.status === 'approved'
                              ? 'Đã duyệt'
                              : reg.status === 'completed'
                              ? 'Hoàn thành'
                              : 'Chờ duyệt'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {reg.status !== 'approved' && (
                              <button
                                onClick={() => {
                                  updateProjectRegistration(reg.id, { status: 'approved' });
                                  refreshMaterialsAndProjects();
                                  onRefreshData();
                                  showToast(`Đã duyệt đề tài cho sinh viên ${reg.studentName}`);
                                }}
                                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] inline-flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Duyệt</span>
                              </button>
                            )}
                            {reg.status !== 'completed' && (
                              <button
                                onClick={() => {
                                  updateProjectRegistration(reg.id, { status: 'completed' });
                                  refreshMaterialsAndProjects();
                                  onRefreshData();
                                  showToast(`Đã xác nhận hoàn thành đồ án cho ${reg.studentName}`);
                                }}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px]"
                              >
                                Đạt
                              </button>
                            )}
                            <button
                              onClick={() => {
                                cancelProjectRegistration(reg.id);
                                refreshMaterialsAndProjects();
                                onRefreshData();
                                showToast('Đã hủy đăng ký đề tài của sinh viên.');
                              }}
                              className="px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 text-[11px] font-semibold"
                            >
                              Hủy
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {scopedProjectRegs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-500">
                        Chưa có sinh viên nào đăng ký đề tài đồ án.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Lecturer Payment Confirmation (10k per Subject) */}
      {activeTab === 'payments' && (() => {
        const studentUsers = allUsersList.filter(u => u.role === 'student');
        const examSubjectsList = subjects.filter(s => s.subjectType !== 'project');
        const filteredOrders = paymentOrders.filter((ord) => {
          if (paymentFilter === 'pending') return ord.status === 'pending';
          if (paymentFilter === 'mine') {
            return currentUser.role === 'admin' || (ord.subjectId ? assignedSubjectIds.includes(ord.subjectId) : false);
          }
          return true;
        });

        return (
          <div className="space-y-6">
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Quyền Giảng viên: Xác nhận Chuyển khoản & Mở khóa Thi thử (10.000đ / Môn)</span>
                </h3>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  Sinh viên chuyển khoản 10.000đ cho môn nào sẽ được mở khóa hệ thống thi thử (đề cương học phần) của môn đó. Giảng viên có thể bấm xác nhận đơn chuyển khoản hoặc mở khóa nhanh cho sinh viên ngay dưới đây.
                </p>
              </div>
              <button
                type="button"
                disabled={loadingPayments}
                onClick={() => void loadLecturerPayments()}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPayments ? 'animate-spin' : ''}`} />
                <span>{loadingPayments ? 'Đang tải...' : 'Làm mới dữ liệu'}</span>
              </button>
            </div>

            {/* Quick Unlock Form */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Mở khóa Nhanh cho Sinh viên theo Môn học (10.000đ/môn)
              </h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!quickStudentId || !quickSubjectId) {
                    showToast('Vui lòng chọn sinh viên và môn học cần mở khóa.');
                    return;
                  }
                  const subName = subjects.find(s => s.id === quickSubjectId)?.name || quickSubjectId;
                  void handleLecturerConfirmPayment(quickStudentId, quickSubjectId, subName);
                }}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs"
              >
                <div className="md:col-span-5">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sinh viên
                  </label>
                  <select
                    value={quickStudentId}
                    onChange={(e) => setQuickStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    required
                  >
                    <option value="">-- Chọn sinh viên --</option>
                    {studentUsers.map(sv => (
                      <option key={sv.id} value={sv.id}>
                        {sv.fullName} ({sv.studentCode || sv.username}) · Đã mở {sv.paidSubjectIds?.length || 0} môn
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Môn học mở khóa
                  </label>
                  <select
                    value={quickSubjectId}
                    onChange={(e) => setQuickSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    required
                  >
                    <option value="">-- Chọn môn học --</option>
                    {examSubjectsList.map(sub => {
                      const selStu = studentUsers.find(s => s.id === quickStudentId);
                      const already = selStu?.paidSubjectIds?.includes(sub.id);
                      const isMine = assignedSubjectIds.includes(sub.id);
                      return (
                        <option key={sub.id} value={sub.id}>
                          [{sub.code}] {sub.name} {isMine ? '(Phụ trách)' : ''} {already ? '✓ Đã mở' : '(10k)'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <button
                    type="submit"
                    disabled={confirmingPaymentKey !== null}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-60 transition"
                  >
                    {confirmingPaymentKey ? 'Đang xác nhận...' : 'Xác nhận 10k & Mở khóa'}
                  </button>
                </div>
              </form>
            </div>

            {/* Orders Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Danh sách Yêu cầu Chuyển khoản của Sinh viên ({filteredOrders.length})
                </h4>
                <div className="flex items-center gap-1.5 text-xs">
                  {[
                    { id: 'all', label: 'Tất cả đơn' },
                    { id: 'pending', label: 'Chờ xác nhận' },
                    { id: 'mine', label: 'Môn tôi phụ trách' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPaymentFilter(f.id as any)}
                      className={`px-3 py-1.5 rounded-lg font-semibold ${
                        paymentFilter === f.id
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-bold text-[11px]">
                      <th className="py-2.5 px-3">Mã đơn</th>
                      <th className="py-2.5 px-3">Sinh viên</th>
                      <th className="py-2.5 px-3">Môn học</th>
                      <th className="py-2.5 px-3">Số tiền</th>
                      <th className="py-2.5 px-3 text-center">Trạng thái</th>
                      <th className="py-2.5 px-3">Xác nhận bởi</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredOrders.map(ord => {
                      const subId = ord.subjectId || examSubjectsList[0]?.id || 'sub_dsa';
                      const subName = ord.subjectName || subjects.find(s => s.id === subId)?.name || subId;
                      return (
                        <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                            {ord.orderCode}
                            <div className="text-[10px] font-normal text-slate-400">
                              {new Date(ord.createdAt).toLocaleString('vi-VN')}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{ord.fullName}</div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {ord.studentCode || ord.username}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                            {subName}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-rose-600">
                            {(ord.amount || 10000).toLocaleString('vi-VN')}đ
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ord.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.studentSubmittedAt
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {ord.status === 'paid'
                                ? 'Đã mở khóa'
                                : ord.studentSubmittedAt
                                ? 'SV đã báo CK · Chờ duyệt'
                                : 'Chờ xác nhận'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[11px] text-slate-600 dark:text-slate-300">
                            {ord.confirmedBy || ord.gateway || (ord.status === 'paid' ? 'Admin / Giảng viên' : '—')}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {ord.status !== 'paid' ? (
                              <button
                                type="button"
                                disabled={confirmingPaymentKey === ord.orderCode}
                                onClick={() =>
                                  void handleLecturerConfirmPayment(ord.userId, subId, subName, ord.orderCode)
                                }
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-[11px]"
                              >
                                {confirmingPaymentKey === ord.orderCode ? 'Đang xử lý...' : 'Xác nhận 10k & Mở khóa'}
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-700">Đã xác nhận</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                          Chưa có giao dịch chuyển khoản nào trong bộ lọc này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add/Edit Question Modal */}
      {isQuestionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingQuestion ? 'Chỉnh sửa câu hỏi trong Ngân hàng' : 'Thêm câu hỏi mới vào Ngân hàng'}
              </h3>
              <button
                onClick={() => setIsQuestionModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestionSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {questionModalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{questionModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Môn học</label>
                  <select
                    value={qSubjectId}
                    onChange={(e) => setQSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {assignedSubjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Chương học phần</label>
                  <select
                    value={qChapterId}
                    onChange={(e) => setQChapterId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {availableChaptersForModal.map(ch => (
                      <option key={ch.id} value={ch.id}>Chương {ch.chapterNumber}: {ch.title}</option>
                    ))}
                    {availableChaptersForModal.length === 0 && (
                      <option value="ch_general">Nội dung tổng hợp học phần</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Loại câu hỏi</label>
                  <select
                    value={qType}
                    onChange={(e) => {
                      const nextType = e.target.value as QuestionType;
                      setQType(nextType);
                      if (nextType === 'single_choice') {
                        if (!['opt_1', 'opt_2', 'opt_3', 'opt_4'].includes(qCorrect)) {
                          setQCorrect('opt_1');
                        }
                      } else if (nextType === 'true_false') {
                        setQCorrect(qCorrect === 'opt_false' ? 'opt_false' : 'opt_true');
                      } else if (nextType === 'fill_blank' || nextType === 'essay') {
                        if (['opt_1', 'opt_2', 'opt_3', 'opt_4', 'opt_true', 'opt_false'].includes(qCorrect)) {
                          setQCorrect('');
                        }
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="single_choice">Trắc nghiệm một đáp án</option>
                    <option value="multiple_choice">Nhiều lựa chọn</option>
                    <option value="true_false">Đúng / Sai</option>
                    <option value="fill_blank">Điền khuyết</option>
                    <option value="essay">Tự luận / Thực hành (Code)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Mức độ khó</label>
                  <select
                    value={qDifficulty}
                    onChange={(e) => setQDifficulty(e.target.value as DifficultyLevel)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="easy">Dễ (Nhận biết)</option>
                    <option value="medium">Trung bình (Thông hiểu)</option>
                    <option value="hard">Khó (Vận dụng cao)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Điểm số câu hỏi</label>
                  <input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={qPoints}
                    onChange={(e) => setQPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Mục đích sử dụng câu hỏi (Tách biệt Ôn tập và Hệ thống thi thử - đề cương học phần)
                </label>
                <select
                  value={qUsage}
                  onChange={(e) => setQUsage(e.target.value as QuestionUsage)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                >
                  <option value="practice">Chỉ dùng để Ôn tập (Hiển thị miễn phí cho sinh viên)</option>
                  <option value="exam">Chỉ dùng trong Hệ thống thi thử - Đề cương học phần (Không lộ ở phần Ôn tập)</option>
                  <option value="both">Dùng cho cả Ôn tập và Đề thi thử</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Nội dung câu hỏi</label>
                <textarea
                  required
                  rows={3}
                  value={qContent}
                  onChange={(e) => setQContent(e.target.value)}
                  placeholder="Nhập nội dung câu hỏi..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Đoạn mã code minh họa (tùy chọn)</label>
                <textarea
                  rows={3}
                  value={qCode}
                  onChange={(e) => setQCode(e.target.value)}
                  placeholder="#include <iostream>..."
                  className="w-full p-3 font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-emerald-400"
                />
              </div>

              {(qType === 'single_choice' || qType === 'multiple_choice') && (
                <div className="space-y-2">
                  <label className="block font-medium text-slate-700 dark:text-slate-300">Các phương án lựa chọn</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Phương án A"
                      value={qOptA}
                      onChange={(e) => setQOptA(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="text"
                      placeholder="Phương án B"
                      value={qOptB}
                      onChange={(e) => setQOptB(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="text"
                      placeholder="Phương án C"
                      value={qOptC}
                      onChange={(e) => setQOptC(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="text"
                      placeholder="Phương án D"
                      value={qOptD}
                      onChange={(e) => setQOptD(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Đáp án đúng / Gợi ý chấm điểm</label>
                {qType === 'single_choice' && (
                  <select
                    value={qCorrect}
                    onChange={(e) => setQCorrect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="opt_1">Phương án A</option>
                    <option value="opt_2">Phương án B</option>
                    <option value="opt_3">Phương án C</option>
                    <option value="opt_4">Phương án D</option>
                  </select>
                )}
                {qType === 'multiple_choice' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    {[
                      { id: 'opt_1', label: 'Phương án A' },
                      { id: 'opt_2', label: 'Phương án B' },
                      { id: 'opt_3', label: 'Phương án C' },
                      { id: 'opt_4', label: 'Phương án D' },
                    ].map(opt => (
                      <label key={opt.id} className="flex items-center gap-2 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={qCorrectMulti.includes(opt.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setQCorrectMulti([...qCorrectMulti, opt.id]);
                            } else {
                              setQCorrectMulti(qCorrectMulti.filter(id => id !== opt.id));
                            }
                          }}
                          className="rounded border-slate-300"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                {qType === 'true_false' && (
                  <select
                    value={qCorrect}
                    onChange={(e) => setQCorrect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="opt_true">Đúng</option>
                    <option value="opt_false">Sai</option>
                  </select>
                )}
                {qType === 'fill_blank' && (
                  <input
                    type="text"
                    placeholder="Nhập từ hoặc cụm từ đáp án chính xác..."
                    value={qCorrect}
                    onChange={(e) => setQCorrect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                )}
                {qType === 'essay' && (
                  <div className="space-y-3">
                    <textarea
                      rows={2}
                      placeholder="Nhập ý chính hoặc rubric từ khóa chấm điểm (ví dụ: đệ quy|base case|O(n))..."
                      value={qCorrect}
                      onChange={(e) => setQCorrect(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <div>
                      <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                        Code mẫu / Bài giải chuẩn (tùy chọn)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Nhập đoạn code mẫu chuẩn dùng để đối chiếu sau khi sinh viên nộp bài..."
                        value={qSampleSolution}
                        onChange={(e) => setQSampleSolution(e.target.value)}
                        className="w-full p-3 font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-emerald-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Lời giải & Giải thích chi tiết</label>
                <textarea
                  required
                  rows={3}
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  placeholder="Giải thích vì sao chọn đáp án này, phân tích thuật toán..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {editingQuestion ? 'Cập nhật câu hỏi' : 'Lưu vào Ngân hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Exam Modal */}
      {isExamModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Tạo Đề thi thử mới</h3>
              <button onClick={() => setIsExamModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSaveExamSubmit} className="space-y-3 text-xs">
              {examModalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{examModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Môn học</label>
                  <select
                    value={exSubjectId}
                    onChange={(e) => handleExamSubjectChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  >
                    {assignedSubjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Hình thức đề thi</label>
                  <select
                    value={exFormat}
                    onChange={(e) => {
                      const val = e.target.value as 'theory' | 'practical';
                      setExFormat(val);
                      if (val === 'practical') {
                        setExDuration(90);
                        setExQuestionsCount(2);
                        setExMaxScore(10);
                      } else {
                        setExDuration(45);
                        setExQuestionsCount(10);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-semibold"
                  >
                    <option value="theory">Thi Trắc nghiệm / Lý thuyết</option>
                    <option value="practical">Thi Thực hành</option>
                  </select>
                </div>
              </div>

              {exFormat === 'practical' && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px]">
                  Chế độ Thi Thực hành: Hệ thống ưu tiên chọn các <strong>câu hỏi lập trình / tự luận thực hành</strong> theo cấu trúc thi thực hành.
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">Tên đề thi</label>
                <input
                  type="text"
                  required
                  placeholder="Kiểm tra Cuối kỳ - Cấu trúc dữ liệu..."
                  value={exTitle}
                  onChange={(e) => setExTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Mã đề thi</label>
                  <input
                    type="text"
                    required
                    placeholder="EX-DSA-02"
                    value={exCode}
                    onChange={(e) => setExCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Thời gian (phút)</label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={exDuration}
                    onChange={(e) => setExDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Số câu hỏi (Lý thuyết: 45 · Thực hành: 2)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={exQuestionsCount}
                    onChange={(e) => setExQuestionsCount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Thang điểm tối đa</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={exMaxScore}
                    onChange={(e) => setExMaxScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(false)}
                  className="px-4 py-2 rounded-xl border"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  Xuất bản đề thi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {confirmModal.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Document Analyzer Modal */}
      <AIDocumentAnalyzerModal
        document={analyzerDoc}
        isOpen={isAnalyzerOpen}
        onClose={() => setIsAnalyzerOpen(false)}
        onStartGenerateQuestions={(doc) => {
          setIsAnalyzerOpen(false);
          handleOpenGenerator(doc);
        }}
      />

      {/* AI Question Generator Modal */}
      <AIQuestionGeneratorModal
        document={generatorDoc}
        subjects={assignedSubjects}
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        onSuccess={() => {
          setIsGeneratorOpen(false);
          refreshAiData();
          setActiveTab('ai_review');
          showToast('Đã tạo câu hỏi thành công! Vui lòng duyệt trước khi đưa vào ngân hàng chính thức.');
        }}
      />

      {/* Upload Word (.docx) / Excel (.xlsx) Question Bank Modal */}
      <QuestionBankUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        subjects={assignedSubjects}
        chapters={allChapters}
        currentUser={currentUser}
        defaultSubjectId={assignedSubjects[0]?.id}
        onSuccess={(msg) => {
          onRefreshData();
          showToast(msg);
        }}
      />

      {/* Create Subject Modal (Lecturer) */}
      {isCreateSubjectOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Thêm Môn Học Mới Phụ Trách
                </h3>
                <p className="text-xs text-slate-500">Môn học sẽ được gắn cho {currentUser.fullName} quản lý</p>
              </div>
              <button
                onClick={() => setIsCreateSubjectOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {subModalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold">
                {subModalError}
              </div>
            )}

            <form onSubmit={handleCreateSubjectSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Mã học phần *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: INF3050"
                    value={subCode}
                    onChange={(e) => setSubCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Hình thức học phần *</label>
                  <select
                    value={subType}
                    onChange={(e) => setSubType(e.target.value as SubjectType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="theory">Lý thuyết / Trắc nghiệm</option>
                    <option value="practical">Thực hành</option>
                    <option value="project">Đồ án học phần</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Tên môn học (Tiếng Việt) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lập trình Java Web"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Tên tiếng Anh</label>
                <input
                  type="text"
                  placeholder="Java Web Programming"
                  value={subNameEn}
                  onChange={(e) => setSubNameEn(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">Nhóm ngành</label>
                  <select
                    value={subCategory}
                    onChange={(e: any) => setSubCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="programming">Lập trình</option>
                    <option value="systems">Hệ thống & Mạng</option>
                    <option value="software">Phần mềm</option>
                    <option value="data">Dữ liệu</option>
                    <option value="ai">AI & KHMT</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Số tín chỉ</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={subCredits}
                    onChange={(e) => setSubCredits(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Học kỳ</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={subSemester}
                    onChange={(e) => setSubSemester(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Mô tả học phần</label>
                <textarea
                  rows={3}
                  placeholder="Mục tiêu và nội dung chính của học phần..."
                  value={subDesc}
                  onChange={(e) => setSubDesc(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateSubjectOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  Tạo môn học
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Study Material Modal (Lưu file gốc nhị phân + chuẩn Unicode để tải về không lỗi font) */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Đăng Đề cương / Bài giảng Lên Kho Tài Liệu
                </h3>
                <p className="text-xs text-slate-500">
                  Giữ nguyên file gốc (.pdf, .docx, .pptx, .xlsx) và chuẩn hóa Unicode NFC để sinh viên tải về mở không lỗi font
                </p>
              </div>
              <button onClick={() => setIsMaterialModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {matModalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold">
                {matModalError}
              </div>
            )}

            <form onSubmit={handleSaveMaterialSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Môn học *</label>
                  <select
                    value={matSubjectId}
                    onChange={(e) => setMatSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {assignedSubjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.isHot ? '[HOT] ' : ''}{s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Phân loại tài liệu</label>
                  <select
                    value={matCategory}
                    onChange={(e: any) => setMatCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="syllabus">Đề cương chi tiết học phần</option>
                    <option value="lecture">Bài giảng chương / Slide</option>
                    <option value="lab">Hướng dẫn thực hành / Đồ án</option>
                    <option value="reference">Tài liệu tham khảo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Tiêu đề tài liệu *</label>
                  <input
                    type="text"
                    required
                    placeholder="Đề cương chi tiết học phần / Bài giảng Chương 1..."
                    value={matTitle}
                    onChange={(e) => setMatTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Chọn file tải lên (PDF, Word, Slide, Excel)</label>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.txt,.md,.zip"
                    onChange={handleLoadMaterialFile}
                    className="w-full text-[11px] text-slate-500 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold"
                  />
                </div>
              </div>

              {matOriginalFileName && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-2">
                  <span>
                    Đã đính kèm tệp gốc: <strong>{matOriginalFileName}</strong> ({matFileSizeLabel}) — Tải về giữ nguyên 100% phông chữ gốc.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMatFileDataUrl('');
                      setMatOriginalFileName('');
                      setMatMimeType('');
                      setMatFileSizeLabel('');
                    }}
                    className="text-rose-600 font-semibold hover:underline shrink-0"
                  >
                    Gỡ tệp
                  </button>
                </div>
              )}

              <div>
                <label className="block font-medium mb-1">Mô tả ngắn</label>
                <input
                  type="text"
                  placeholder="Tóm tắt nội dung chính của tài liệu..."
                  value={matDesc}
                  onChange={(e) => setMatDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">
                  Nội dung văn bản / Ghi chú đi kèm {matFileDataUrl ? '(Không bắt buộc khi đã đính kèm file gốc)' : '*'}
                </label>
                <textarea
                  required={!matFileDataUrl}
                  rows={7}
                  placeholder="Nhập nội dung Đề cương / Bài giảng (nếu không đính kèm file gốc). Hệ thống sẽ tự động đóng gói thành file Word (.docx) chuẩn Unicode NFC Times New Roman..."
                  value={matContent}
                  onChange={(e) => setMatContent(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMaterialModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={matSaving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold"
                >
                  {matSaving ? 'Đang tải lên máy chủ...' : 'Đăng tải tài liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Project Topic Modal (Đồ án học phần) */}
      {isTopicModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingTopic ? 'Cập nhật Đề tài Đồ án' : 'Thêm Đề tài Đồ án Mới'}
              </h3>
              <button onClick={() => setIsTopicModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {topicModalError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold">
                {topicModalError}
              </div>
            )}

            <form onSubmit={handleSaveTopicSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Học phần Đồ án *</label>
                  <select
                    value={topicSubjectId}
                    onChange={(e) => setTopicSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {subjects
                      .filter(s => s.subjectType === 'project' || assignedSubjectIds.includes(s.id) || currentUser.role === 'admin')
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Mã đề tài</label>
                  <input
                    type="text"
                    value={topicCode}
                    onChange={(e) => setTopicCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Tên đề tài đồ án *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Xây dựng hệ thống quản lý thư viện thông minh..."
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Mô tả yêu cầu bài toán</label>
                <textarea
                  rows={2}
                  value={topicDesc}
                  onChange={(e) => setTopicDesc(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Hướng dẫn chi tiết cho sinh viên *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Các bước thực hiện, công nghệ gợi ý, lưu ý kiến trúc..."
                  value={topicGuidance}
                  onChange={(e) => setTopicGuidance(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Sản phẩm cần nộp (mỗi dòng 1 mục)</label>
                  <textarea
                    rows={3}
                    value={topicDeliverablesText}
                    onChange={(e) => setTopicDeliverablesText(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block font-medium mb-1">Số SV tối đa</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={topicMaxStudents}
                      onChange={(e) => setTopicMaxStudents(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Trạng thái</label>
                    <select
                      value={topicStatus}
                      onChange={(e) => setTopicStatus(e.target.value as 'open' | 'closed')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="open">Đang mở đăng ký</option>
                      <option value="closed">Đóng đăng ký</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTopicModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold"
                >
                  {editingTopic ? 'Lưu đề tài' : 'Tạo đề tài'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
