import React, { useState, useEffect } from 'react';
import {
  Subject, Chapter, Question, Exam, StudyMaterial,
  User, LearningDocument, ProjectTopic, ProjectRegistration
} from '../../types';
import {
  incrementDownloadCount,
  registerProjectTopic,
  cancelProjectRegistration,
  updateProjectRegistration,
  hasUnlockedSubjectExam,
} from '../../services/storageService';
import {
  downloadLearningDocFile,
  downloadStudyMaterialFile,
} from '../../utils/fileDownload';
import {
  BookOpen, FileText, Download, FolderGit2,
  CheckCircle2, AlertCircle, Code2, ExternalLink, Trash2, Lock
} from 'lucide-react';

interface SubjectDetailProps {
  subject: Subject;
  chapters: Chapter[];
  questions: Question[];
  exams: Exam[];
  materials: StudyMaterial[];
  learningDocs?: LearningDocument[];
  projectTopics?: ProjectTopic[];
  projectRegistrations?: ProjectRegistration[];
  currentUser?: User;
  onBack: () => void;
  onStartPractice: (subjectId: string, chapterId?: string) => void;
  onStartExam: (examId: string) => void;
  onRefreshMaterials?: () => void;
}

export const SubjectDetail: React.FC<SubjectDetailProps> = ({
  subject,
  chapters,
  questions,
  exams,
  materials,
  learningDocs = [],
  projectTopics = [],
  projectRegistrations = [],
  currentUser,
  onBack,
  onStartPractice,
  onStartExam,
  onRefreshMaterials,
}) => {
  const isProject = subject?.subjectType === 'project';
  const isPractical = subject?.subjectType === 'practical';

  const [activeTab, setActiveTab] = useState<'project' | 'chapters' | 'questions' | 'exams' | 'materials'>(
    isProject ? 'project' : isPractical ? 'exams' : 'chapters'
  );
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const visibleQuestions =
    currentUser?.role === 'student'
      ? questions.filter(q => (q.questionUsage || 'practice') !== 'exam')
      : questions;

  // Project registration form state
  const [registeringTopic, setRegisteringTopic] = useState<ProjectTopic | null>(null);
  const [regNote, setRegNote] = useState('');
  const [regRepoUrl, setRegRepoUrl] = useState('');
  const [editingRepoUrl, setEditingRepoUrl] = useState('');

  useEffect(() => {
    setActiveTab(subject?.subjectType === 'project' ? 'project' : subject?.subjectType === 'practical' ? 'exams' : 'chapters');
    setNotice(null);
    setRegisteringTopic(null);
    setRegNote('');
    setRegRepoUrl('');
    setEditingRepoUrl('');
  }, [subject?.id, subject?.subjectType]);

  if (!subject) {
    return (
      <div className="max-w-xl mx-auto my-16 px-4 py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center shadow-xs">
        <p className="text-slate-600 dark:text-slate-300 font-semibold mb-4">Không tìm thấy thông tin môn học.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-blue-800 text-white rounded-lg text-xs font-semibold"
        >
          Quay lại danh sách môn học
        </button>
      </div>
    );
  }

  const showTempNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const handleDownloadMaterial = async (m: StudyMaterial) => {
    await downloadStudyMaterialFile(m, `${subject.code} - ${subject.name}`);
    incrementDownloadCount(m.id);
    onRefreshMaterials?.();
    showTempNotice('success', `Đã tải xuống hoàn tất (chuẩn Unicode): ${m.title}`);
  };

  const handleDownloadLearningDoc = async (doc: LearningDocument) => {
    await downloadLearningDocFile(doc, `${subject.code} - ${subject.name}`);
    showTempNotice('success', `Đã tải xuống tài liệu: ${doc.title}`);
  };

  const myRegistration = currentUser
    ? projectRegistrations.find(r => r.subjectId === subject.id && r.studentId === currentUser.id)
    : undefined;
  const myTopic = myRegistration
    ? projectTopics.find(t => t.id === myRegistration.topicId)
    : undefined;

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registeringTopic || !currentUser) return;
    try {
      registerProjectTopic({
        subjectId: subject.id,
        topicId: registeringTopic.id,
        student: currentUser,
        note: regNote,
        repoUrl: regRepoUrl,
      });
      setRegisteringTopic(null);
      setRegNote('');
      setRegRepoUrl('');
      onRefreshMaterials?.();
      showTempNotice('success', `Đăng ký thành công đề tài ${registeringTopic.code}: ${registeringTopic.title}`);
    } catch (err: any) {
      showTempNotice('error', err.message || 'Không thể đăng ký đề tài.');
    }
  };

  const handleCancelRegistration = (regId: string) => {
    cancelProjectRegistration(regId);
    onRefreshMaterials?.();
    showTempNotice('success', 'Đã hủy đăng ký đề tài đồ án. Bạn có thể chọn đề tài khác.');
  };

  const handleSaveRepoUrl = (regId: string) => {
    updateProjectRegistration(regId, { repoUrl: editingRepoUrl.trim() });
    setEditingRepoUrl('');
    onRefreshMaterials?.();
    showTempNotice('success', 'Đã cập nhật đường dẫn mã nguồn / báo cáo đồ án.');
  };

  const subjectTypeLabel = isProject
    ? 'Đồ án học phần'
    : isPractical
    ? 'Môn Thực hành'
    : 'Học phần Lý thuyết & Trắc nghiệm';

  const practicalExam = exams.find(e => e.examFormat === 'practical') || exams[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="text-xs font-semibold text-blue-800 dark:text-blue-400 hover:underline flex items-center gap-1"
      >
        &larr; Quay lại danh sách môn học
      </button>

      {/* Subject Header Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 sm:p-8 border border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="font-mono font-bold bg-blue-800 text-white px-2.5 py-0.5 rounded">
                {subject.code}
              </span>
              {subject.isHot && (
                <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  HOT
                </span>
              )}
              <span className="text-emerald-300 font-semibold">{subjectTypeLabel}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-slate-300 font-medium">
                {subject.credits} Tín chỉ
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {subject.name}
            </h1>
            {subject.nameEn && <p className="text-xs text-slate-400 italic">{subject.nameEn}</p>}

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {subject.description}
            </p>

            <div className="pt-2 text-xs text-slate-300">
              <span>Giảng viên phụ trách: </span>
              <strong className="text-white">{subject.assignedLecturerName || 'Bộ môn phân công'}</strong>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0">
            {isProject ? (
              <>
                <button
                  onClick={() => setActiveTab('project')}
                  className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition shadow-sm"
                >
                  Đăng ký đề tài & Xem hướng dẫn
                </button>
                <button
                  onClick={() => setActiveTab('materials')}
                  className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition border border-slate-700"
                >
                  Tải đề cương đồ án ({materials.length + learningDocs.length})
                </button>
              </>
            ) : (
              <>
                {isPractical && practicalExam && (
                  <button
                    onClick={() => onStartExam(practicalExam.id)}
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Code2 className="w-4 h-4" />
                    Thi thử Thực hành
                  </button>
                )}
                {!isPractical && exams.length > 0 && (
                  <button
                    onClick={() => onStartExam(exams[0].id)}
                    className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition shadow-sm"
                  >
                    Làm đề thi thử ({exams.length} đề)
                  </button>
                )}
                <button
                  onClick={() => onStartPractice(subject.id)}
                  className={`px-5 py-2.5 rounded-lg text-white text-xs font-bold transition ${
                    isPractical
                      ? 'bg-blue-700 hover:bg-blue-800'
                      : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  Vào phòng ôn tập ({visibleQuestions.length} câu)
                </button>
                <button
                  onClick={() => setActiveTab('materials')}
                  className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
                >
                  Tải đề cương & bài giảng
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 mt-6 border-t border-slate-800 text-xs">
          <div>
            <span className="text-slate-400">Số chương học:</span>
            <div className="text-sm font-bold text-white mt-0.5">{chapters.length} chương</div>
          </div>
          {isProject ? (
            <>
              <div>
                <span className="text-slate-400">Danh mục đề tài:</span>
                <div className="text-sm font-bold text-white mt-0.5">{projectTopics.length} đề tài</div>
              </div>
              <div>
                <span className="text-slate-400">Sinh viên đã đăng ký:</span>
                <div className="text-sm font-bold text-white mt-0.5">{projectRegistrations.length} lượt</div>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-slate-400">Ngân hàng ôn tập:</span>
                <div className="text-sm font-bold text-white mt-0.5">{visibleQuestions.length} câu hỏi</div>
              </div>
              <div>
                <span className="text-slate-400">Đề thi thử:</span>
                <div className="text-sm font-bold text-white mt-0.5">{exams.length} bộ đề</div>
              </div>
            </>
          )}
          <div>
            <span className="text-slate-400">Đề cương & bài giảng:</span>
            <div className="text-sm font-bold text-white mt-0.5">{materials.length + learningDocs.length} tài liệu</div>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {isProject && (
          <button
            onClick={() => setActiveTab('project')}
            className={`py-3 px-5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'project'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Đăng ký Đề tài & Hướng dẫn ({projectTopics.length})
          </button>
        )}

        <button
          onClick={() => setActiveTab('materials')}
          className={`py-3 px-5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'materials'
              ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Đề cương & Bài giảng ({materials.length + learningDocs.length})
        </button>

        {!isProject && (
          <button
            onClick={() => setActiveTab('exams')}
            className={`py-3 px-5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'exams'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isPractical ? `Thi thử Thực hành (${exams.length})` : `Đề thi thử (${exams.length})`}
          </button>
        )}

        <button
          onClick={() => setActiveTab('chapters')}
          className={`py-3 px-5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'chapters'
              ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {isProject ? `Lộ trình Đồ án (${chapters.length})` : `Cấu trúc chương (${chapters.length})`}
        </button>

        {!isProject && (
          <button
            onClick={() => setActiveTab('questions')}
            className={`py-3 px-5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'questions'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ngân hàng ôn tập ({visibleQuestions.length})
          </button>
        )}
      </div>

      {/* Tab Project: Topic Registration & Guidance */}
      {activeTab === 'project' && isProject && (
        <div className="space-y-6">
          {/* Student's Current Registration Card */}
          {myRegistration && myTopic && (
            <div className="p-5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Đề tài bạn đã đăng ký ({myRegistration.status === 'approved' ? 'Giảng viên đã duyệt' : myRegistration.status === 'completed' ? 'Đã hoàn thành' : 'Chờ giảng viên duyệt'})
                  </span>
                </div>
                <button
                  onClick={() => handleCancelRegistration(myRegistration.id)}
                  className="px-3 py-1 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hủy để đổi đề tài
                </button>
              </div>

              <div className="text-sm font-bold text-slate-900 dark:text-white">
                [{myTopic.code}] {myTopic.title}
              </div>

              <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-900/60 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                <strong className="block text-slate-900 dark:text-white mb-1">Hướng dẫn thực hiện chi tiết:</strong>
                {myTopic.guidance}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="url"
                  placeholder={myRegistration.repoUrl || 'Nhập link GitHub / Google Drive báo cáo đồ án...'}
                  value={editingRepoUrl}
                  onChange={e => setEditingRepoUrl(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
                <button
                  onClick={() => handleSaveRepoUrl(myRegistration.id)}
                  disabled={!editingRepoUrl.trim()}
                  className="px-4 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  Cập nhật link nộp bài
                </button>
                {myRegistration.repoUrl && (
                  <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 px-2">
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    <span className="truncate max-w-[200px]">{myRegistration.repoUrl}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Available Project Topics List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                Danh sách Đề tài & Tài liệu Hướng dẫn Đồ án
              </h3>
              <span className="text-xs text-slate-500">
                Chọn đề tài phù hợp để xem hướng dẫn chi tiết và đăng ký thực hiện
              </span>
            </div>

            {projectTopics.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500">
                Giảng viên chưa công bố danh sách đề tài cho học phần này. Vui lòng xem Đề cương hướng dẫn hoặc liên hệ giảng viên phụ trách.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {projectTopics.map(topic => {
                  const regsForTopic = projectRegistrations.filter(r => r.topicId === topic.id);
                  const isFull = regsForTopic.length >= topic.maxStudents;
                  const isMine = myRegistration?.topicId === topic.id;

                  return (
                    <div
                      key={topic.id}
                      className={`p-5 rounded-xl border bg-white dark:bg-slate-900 flex flex-col justify-between space-y-4 ${
                        isMine
                          ? 'border-emerald-500 dark:border-emerald-700 ring-1 ring-emerald-500/30'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                            {topic.code}
                          </span>
                          <span
                            className={`font-semibold ${
                              isMine
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : isFull || topic.status === 'closed'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {isMine
                              ? 'Đề tài của bạn'
                              : topic.status === 'closed'
                              ? 'Đã đóng'
                              : isFull
                              ? `Đã đủ (${regsForTopic.length}/${topic.maxStudents})`
                              : `Còn nhận (${regsForTopic.length}/${topic.maxStudents} SV)`}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {topic.title}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {topic.description}
                        </p>

                        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <FolderGit2 className="w-3.5 h-3.5 text-blue-600" />
                            <span>Hướng dẫn thực hiện đề tài:</span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {topic.guidance}
                          </div>
                          {topic.deliverables.length > 0 && (
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">Sản phẩm yêu cầu:</span>
                              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                                {topic.deliverables.map((d, di) => (
                                  <li key={di}>{d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">
                          GV hướng dẫn: {topic.createdBy}
                        </span>
                        {!isMine && (
                          <button
                            disabled={Boolean(myRegistration) || isFull || topic.status !== 'open'}
                            onClick={() => setRegisteringTopic(topic)}
                            className="px-4 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 disabled:opacity-40 text-white text-xs font-bold transition"
                          >
                            {myRegistration ? 'Đã đăng ký đề tài khác' : isFull ? 'Đã đủ sinh viên' : 'Đăng ký đề tài này'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 1: Chapters */}
      {activeTab === 'chapters' && (
        <div className="space-y-3">
          {chapters.map((ch) => (
            <div
              key={ch.id}
              className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {isProject ? `Giai đoạn ${ch.chapterNumber}` : `Chương ${ch.chapterNumber}`}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{ch.title}</h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{ch.description}</p>
              </div>

              {!isProject && (
                <button
                  onClick={() => onStartPractice(subject.id, ch.id)}
                  className="px-3.5 py-1.5 rounded-lg border border-blue-700 text-blue-700 dark:border-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-semibold shrink-0"
                >
                  Luyện tập chương này
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Questions Preview */}
      {activeTab === 'questions' && !isProject && (
        <div className="space-y-3">
          {visibleQuestions.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500">
              Chưa có câu hỏi ôn tập trong ngân hàng của học phần này.
            </div>
          ) : (
            visibleQuestions.map((q, idx) => (
              <div
                key={q.id}
                className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-700 dark:text-slate-200">Câu hỏi #{idx + 1}</span>
                    <span>·</span>
                    <span>
                      {q.questionType === 'essay' ? 'Thực hành / Tự luận' : q.questionType === 'true_false' ? 'Đúng/Sai' : 'Trắc nghiệm'}
                    </span>
                    <span>·</span>
                    <span>{q.points} điểm</span>
                    <span>·</span>
                    <span>
                      {q.difficulty === 'easy' ? 'Dễ' : q.difficulty === 'medium' ? 'Trung bình' : 'Khó'}
                    </span>
                    {q.bloomLevel && (
                      <>
                        <span>·</span>
                        <span className="text-blue-700 dark:text-blue-400 font-semibold">Bloom Bậc {q.bloomLevel}</span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-slate-400">ID: {q.id}</span>
                </div>
                <p className="font-medium text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap">{q.content}</p>
                {q.codeSnippet && (
                  <pre className="p-2.5 rounded bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto">
                    {q.codeSnippet}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Exams */}
      {activeTab === 'exams' && !isProject && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.length === 0 ? (
            <div className="md:col-span-2 p-8 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500">
              Chưa có đề thi thử nào được mở cho môn học này.
            </div>
          ) : (
            exams.map((ex) => (
              <div
                key={ex.id}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-500">{ex.code}</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {ex.examFormat === 'practical' ? 'Thi Thực hành' : 'Thi Trắc nghiệm'}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">{ex.title}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{ex.description}</p>
                  <div className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                    Thời gian: <strong>{ex.durationMinutes} phút</strong> · Số câu: <strong>{ex.examFormat === 'practical' ? 2 : ex.totalQuestions} câu</strong> · Thang điểm tối đa: <strong>{ex.maxScore} điểm</strong>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  {currentUser?.role === 'student' && (
                    hasUnlockedSubjectExam(currentUser, subject.id) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã mở khóa môn
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                        <Lock className="w-3.5 h-3.5" /> Cần chuyển khoản 10.000đ/môn
                      </span>
                    )
                  )}
                  <button
                    onClick={() => onStartExam(ex.id)}
                    className={`px-4 py-1.5 rounded-lg text-white font-bold text-xs ml-auto ${
                      currentUser?.role === 'student' && !hasUnlockedSubjectExam(currentUser, subject.id)
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-blue-800 hover:bg-blue-900'
                    }`}
                  >
                    {currentUser?.role === 'student' && !hasUnlockedSubjectExam(currentUser, subject.id)
                      ? 'Mở khóa thi thử (10k)'
                      : 'Bắt đầu làm bài thi'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Materials & Download */}
      {activeTab === 'materials' && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200">
            Kho đề cương & bài giảng hỗ trợ tải xuống trực tiếp về máy tính/điện thoại (tệp Word/PDF/Slide gốc hoặc chuẩn Unicode NFC chống lỗi phông chữ tiếng Việt).
          </div>
          {materials.length === 0 && learningDocs.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500">
              Chưa có đề cương hoặc bài giảng nào cho học phần này.
            </div>
          ) : (
            <>
              {materials.map((m) => (
                <div
                  key={m.id}
                  className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        {m.materialCategory === 'syllabus'
                          ? 'Đề cương học phần'
                          : m.materialCategory === 'lecture'
                          ? 'Bài giảng'
                          : 'Tài liệu học tập'}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono font-bold uppercase text-slate-500">
                        {m.fileDataUrl || m.serverFileUrl ? m.fileType : 'DOCX'}
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{m.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{m.description}</p>
                    <div className="text-[11px] text-slate-400">
                      Dung lượng: {m.fileSize} · Người đăng: {m.uploadedBy} · {new Date(m.uploadedAt).toLocaleDateString('vi-VN')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDownloadMaterial(m)}
                      className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Tải về để xem
                    </button>
                  </div>
                </div>
              ))}

              {learningDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        Đề cương & Bài giảng số hóa
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono font-bold uppercase text-slate-500">
                        {doc.fileType === 'txt' ? 'TXT' : 'DOCX'}
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{doc.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{doc.description}</p>
                    <div className="text-[11px] text-slate-400">
                      Dung lượng: {doc.fileSize} · Biên soạn: {doc.uploadedBy}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDownloadLearningDoc(doc)}
                    className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải về để xem
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Modal: Register Project Topic */}
      {registeringTopic && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRegisterSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Xác nhận Đăng ký Đề tài Đồ án
            </h3>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="font-mono font-bold text-blue-700 dark:text-blue-400">{registeringTopic.code}</div>
              <div className="font-semibold text-slate-900 dark:text-white">{registeringTopic.title}</div>
              <div className="text-slate-500">GV hướng dẫn: {registeringTopic.createdBy}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kế hoạch / Ghi chú gửi giảng viên hướng dẫn
              </label>
              <textarea
                rows={3}
                value={regNote}
                onChange={e => setRegNote(e.target.value)}
                placeholder="Ví dụ: Công nghệ dự kiến sử dụng, phân công nhóm thực hiện..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Link GitHub / Tài liệu đề cương cá nhân (nếu có)
              </label>
              <input
                type="url"
                value={regRepoUrl}
                onChange={e => setRegRepoUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRegisteringTopic(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold"
              >
                Xác nhận đăng ký
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
