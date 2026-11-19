import React, { useState, useEffect } from 'react';
import {
  User, Subject, Chapter, Question, Exam, ExamAttempt,
  PracticeSession, StudyMaterial, NotificationItem, ActivityLog,
  DifficultyLevel, LearningDocument, ProjectTopic, ProjectRegistration
} from './types';
import {
  getCurrentUser, getUsers, syncUsersWithServer, mergeFirestoreSnapshotIntoSystem,
  subscribeUsersBroadcast, applySyncedUsersToLocalStorage,
  syncLogsWithServer, mergeFirestoreLogsIntoSystem, subscribeLogsBroadcast,
  getSubjects, getChapters, getQuestions,
  getExams, getExamAttempts, getPracticeSessions, getStudyMaterials, syncMaterialsWithServer,
  getNotifications, getActivityLogs, saveExamAttempt,
  logoutUser, getLearningDocuments, getProjectTopics, getProjectRegistrations,
  hasUnlockedSubjectExam
} from './services/storageService';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  isFirebaseAdminUser,
  signOutFirebase,
  subscribeActivityLogsFirestoreAsAdmin,
  subscribeFirebaseAuthState,
  subscribeOwnUserDocFirestore,
  subscribeUsersFirestoreAsAdmin,
} from './services/firestoreUserService';

import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { AuthModal } from './components/auth/AuthModal';
import { UserProfileModal } from './components/auth/UserProfileModal';
import { PaymentGateModal } from './components/payment/PaymentGateModal';

import { HomePage } from './components/home/HomePage';
import { SubjectList } from './components/subjects/SubjectList';
import { SubjectDetail } from './components/subjects/SubjectDetail';
import { PracticeSetup } from './components/practice/PracticeSetup';
import { PracticeRoom } from './components/practice/PracticeRoom';
import { ExamList } from './components/exams/ExamList';
import { ExamRoom } from './components/exams/ExamRoom';
import { ExamResult } from './components/exams/ExamResult';
import { StudentAnalytics } from './components/analytics/StudentAnalytics';
import { MaterialsPage } from './components/materials/MaterialsPage';
import { LecturerDashboard } from './components/lecturer/LecturerDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentUser());
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('sub_dsa');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string>('');
  
  // Practice session configuration
  const [practiceConfig, setPracticeConfig] = useState<{
    subjectId: string;
    chapterId?: string;
    difficulty: DifficultyLevel | 'all';
    questionCount: number;
    instantFeedback: boolean;
  }>({
    subjectId: 'sub_dsa',
    difficulty: 'all',
    questionCount: 10,
    instantFeedback: true,
  });

  // Modals & Notices
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [paymentModalInfo, setPaymentModalInfo] = useState<{
    isOpen: boolean;
    subjectId: string;
    subjectName: string;
    pendingExamId?: string;
    reason?: string;
  } | null>(null);
  const [rbacNotice, setRbacNotice] = useState<string | null>(null);
  const [sessionNonce, setSessionNonce] = useState<number>(0);

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  // App dataset
  const [users, setUsers] = useState<User[]>(() => getUsers());
  const [isSyncingUsers, setIsSyncingUsers] = useState(false);
  const [isSyncingLogs, setIsSyncingLogs] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>(getSubjects());
  const [chapters, setChapters] = useState<Chapter[]>(getChapters());
  const [questions, setQuestions] = useState<Question[]>(getQuestions());
  const [exams, setExams] = useState<Exam[]>(getExams());
  const [attempts, setAttempts] = useState<ExamAttempt[]>(getExamAttempts());
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>(getPracticeSessions());
  const [materials, setMaterials] = useState<StudyMaterial[]>(getStudyMaterials());
  const [notifications, setNotifications] = useState<NotificationItem[]>(getNotifications());
  const [logs, setLogs] = useState<ActivityLog[]>(getActivityLogs());
  const [learningDocs, setLearningDocs] = useState<LearningDocument[]>(getLearningDocuments());
  const [projectTopics, setProjectTopics] = useState<ProjectTopic[]>(getProjectTopics());
  const [projectRegistrations, setProjectRegistrations] = useState<ProjectRegistration[]>(getProjectRegistrations());

  // Always keep clean light theme
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('it_study_theme');
  }, []);

  const refreshAllData = () => {
    setUsers(getUsers());
    setSubjects(getSubjects());
    setChapters(getChapters());
    setQuestions(getQuestions());
    setExams(getExams());
    setAttempts(getExamAttempts());
    setPracticeSessions(getPracticeSessions());
    setMaterials(getStudyMaterials());
    setNotifications(getNotifications());
    setLogs(getActivityLogs());
    setLearningDocs(getLearningDocuments());
    setProjectTopics(getProjectTopics());
    setProjectRegistrations(getProjectRegistrations());
    setCurrentUser(getCurrentUser());
  };

  const handleSyncUsers = async () => {
    setIsSyncingUsers(true);
    try {
      const synced = await syncUsersWithServer();
      setUsers(synced);
      setCurrentUser(getCurrentUser());
    } catch {
      setUsers(getUsers());
    } finally {
      setIsSyncingUsers(false);
    }
  };

  const handleSyncLogs = async () => {
    setIsSyncingLogs(true);
    try {
      const syncedLogs = await syncLogsWithServer();
      setLogs(syncedLogs);
    } catch {
      setLogs(getActivityLogs());
    } finally {
      setIsSyncingLogs(false);
    }
  };

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  // Track Firebase Auth readiness & current signed-in Firebase account
  useEffect(() => {
    return subscribeFirebaseAuthState((fbUser) => {
      setFirebaseUser(fbUser);
    });
  }, []);

  // Auto-sync user accounts, activity logs & study materials from server on app startup & across browser tabs
  useEffect(() => {
    void handleSyncUsers();
    void handleSyncLogs();
    void syncMaterialsWithServer()
      .then(() => setMaterials(getStudyMaterials()))
      .catch(() => {});

    const unsubBroadcast = subscribeUsersBroadcast(() => {
      setUsers(getUsers());
      setCurrentUser(getCurrentUser());
    });
    const unsubLogsBroadcast = subscribeLogsBroadcast(() => {
      setLogs(getActivityLogs());
    });
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'it_study_users_v2' || e.key === 'it_study_current_user_v2') {
        setUsers(getUsers());
        setCurrentUser(getCurrentUser());
      } else if (e.key === 'it_study_logs_v2') {
        setLogs(getActivityLogs());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      unsubBroadcast();
      unsubLogsBroadcast();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Real-time Firestore listener when Firebase Admin (nguyenvxkien@gmail.com) is authenticated
  useEffect(() => {
    if (currentUser?.role !== 'admin' || !isFirebaseAdminUser(firebaseUser)) {
      return;
    }

    const unsubUsers = subscribeUsersFirestoreAsAdmin(
      (fsUsers, removedIds) => {
        void mergeFirestoreSnapshotIntoSystem(fsUsers, removedIds).then((merged) => {
          setUsers(merged);
          setCurrentUser(getCurrentUser());
        });
      },
      (err) => {
        console.warn('Firestore Admin users listener notice:', err.message);
      }
    );

    const unsubLogs = subscribeActivityLogsFirestoreAsAdmin(
      (fsLogs) => {
        void mergeFirestoreLogsIntoSystem(fsLogs).then((mergedLogs) => {
          setLogs(mergedLogs);
        });
      },
      (err) => {
        console.warn('Firestore Admin logs listener notice:', err.message);
      }
    );

    return () => {
      unsubUsers();
      unsubLogs();
    };
  }, [currentUser?.role, firebaseUser]);

  // Real-time Firestore listener for signed-in Google Student own doc (unlocks / status updates)
  useEffect(() => {
    if (!currentUser || currentUser.role === 'admin' || !firebaseUser || isFirebaseAdminUser(firebaseUser)) {
      return;
    }

    const unsubSelf = subscribeOwnUserDocFirestore(
      firebaseUser,
      (fsUser) => {
        if (!fsUser) return;
        const merged = applySyncedUsersToLocalStorage([fsUser]);
        setUsers(merged);
        setCurrentUser(getCurrentUser());
      },
      (err) => {
        console.warn('Firestore student listener notice:', err.message);
      }
    );

    return () => unsubSelf();
  }, [currentUser?.id, currentUser?.role, firebaseUser]);

  // Continuous auto-sync from centralized Server + Firestore whenever Admin (or Lecturer Portal) is active
  useEffect(() => {
    if (!currentUser) return;
    const isAdmin = currentUser.role === 'admin';
    const isLecturerPortal = currentUser.role === 'lecturer' && activeTab === 'lecturer_portal';
    if (!isAdmin && !isLecturerPortal) return;

    void handleSyncUsers();
    if (isAdmin) {
      void handleSyncLogs();
    }

    const handleFocus = () => {
      void handleSyncUsers();
      if (isAdmin) void handleSyncLogs();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void handleSyncUsers();
        if (isAdmin) void handleSyncLogs();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const pollMs = isAdmin && activeTab === 'admin_portal' ? 3000 : 10000;
    const intervalId = window.setInterval(() => {
      void handleSyncUsers();
      if (isAdmin) void handleSyncLogs();
    }, pollMs);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [activeTab, currentUser?.id, currentUser?.role, firebaseUser?.uid]);

  const showRbacNotice = (msg: string) => {
    setRbacNotice(msg);
    window.setTimeout(() => setRbacNotice(null), 4000);
  };

  const openPaymentForSubject = (subjectId: string, pendingExamId?: string, customReason?: string) => {
    const subName = subjects.find(s => s.id === subjectId)?.name || 'Môn học chuyên ngành CNTT';
    setPaymentModalInfo({
      isOpen: true,
      subjectId,
      subjectName: subName,
      pendingExamId,
      reason:
        customReason ||
        `Hệ thống thi thử (đề cương học phần) áp dụng mức phí 10.000đ cho từng môn học. Sinh viên chuyển khoản mở khóa môn "${subName}" sẽ được thi thử vĩnh viễn môn này.`,
    });
  };

  const tryEnterExam = (examId: string): boolean => {
    if (!currentUser) {
      showRbacNotice('Vui lòng đăng nhập hoặc đăng ký tài khoản Sinh viên để làm bài thi thử.');
      openAuthModal('login');
      return false;
    }
    const targetExam = exams.find(e => e.id === examId);
    if (!targetExam) return false;

    if (currentUser.role === 'student') {
      if (!hasUnlockedSubjectExam(currentUser, targetExam.subjectId)) {
        openPaymentForSubject(
          targetExam.subjectId,
          targetExam.id,
          `Bạn chưa mở khóa quyền truy cập Hệ thống thi thử (đề cương học phần) cho môn "${
            subjects.find(s => s.id === targetExam.subjectId)?.name || targetExam.subjectId
          }". Vui lòng chuyển khoản 10.000đ (hoặc liên hệ Admin / Giảng viên xác nhận) để mở khóa riêng môn này.`
        );
        return false;
      }
      if (targetExam.maxAttempts > 0) {
        const userCount = attempts.filter(a => a.examId === examId && a.studentId === currentUser.id).length;
        if (userCount >= targetExam.maxAttempts) {
          showRbacNotice(`Bạn đã hết lượt làm đề thi "${targetExam.title}" (tối đa ${targetExam.maxAttempts} lần).`);
          return false;
        }
      }
    }

    setSelectedExamId(examId);
    setSessionNonce(n => n + 1);
    return true;
  };

  const handleNavigate = (tab: string, param?: any) => {
    // Guest Guard: chưa đăng nhập/đăng ký chỉ được xem Trang chủ
    if (!currentUser && tab !== 'home') {
      setActiveTab('home');
      showRbacNotice('Vui lòng đăng nhập hoặc đăng ký tài khoản Sinh viên để sử dụng chức năng này.');
      openAuthModal('login');
      return;
    }

    // RBAC Route Guard
    if (tab === 'admin_portal' && currentUser?.role !== 'admin') {
      showRbacNotice('Truy cập bị từ chối: Chỉ Quản trị viên mới có quyền vào trang quản trị hệ thống.');
      return;
    }
    if (tab === 'lecturer_portal' && currentUser?.role !== 'lecturer' && currentUser?.role !== 'admin') {
      showRbacNotice('Truy cập bị từ chối: Chỉ Giảng viên được phân công mới có quyền vào Cổng giảng viên.');
      return;
    }

    if (tab === 'subject_detail' && param) {
      setSelectedSubjectId(param);
    }
    if (tab === 'practice' && param) {
      setSelectedSubjectId(param);
    }
    if (tab === 'exam_room' && param) {
      if (!tryEnterExam(param)) {
        return;
      }
    }
    if (tab === 'exam_result' && param) {
      setSelectedAttemptId(param);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    logoutUser();
    void signOutFirebase().catch(() => {});
    setCurrentUser(null);
    setIsProfileModalOpen(false);
    setActiveTab('home');
    openAuthModal('login');
  };

  const handleStartPracticeWithConfig = (config: {
    subjectId: string;
    chapterId?: string;
    difficulty: DifficultyLevel | 'all';
    questionCount: number;
    instantFeedback: boolean;
  }) => {
    if (!currentUser) {
      showRbacNotice('Vui lòng đăng nhập hoặc đăng ký tài khoản Sinh viên để vào ôn tập.');
      openAuthModal('login');
      return;
    }
    setPracticeConfig(config);
    setSelectedSubjectId(config.subjectId);
    setSessionNonce(n => n + 1);
    setActiveTab('practice_room');
  };

  const handleStartExam = (examId: string) => {
    if (!tryEnterExam(examId)) return;
    setActiveTab('exam_room');
  };

  const handleSubmitExam = (attempt: ExamAttempt) => {
    saveExamAttempt(attempt);
    refreshAllData();
    setSelectedAttemptId(attempt.id);
    setSelectedExamId(attempt.examId);
    setActiveTab('exam_result');
  };

  // Find active subject & exam
  const currentSubject = subjects.find(s => s.id === selectedSubjectId) || subjects[0];
  const currentExam = exams.find(e => e.id === selectedExamId) || exams[0];
  const visibleAttempts = currentUser?.role === 'student'
    ? attempts.filter(a => a.studentId === currentUser.id)
    : attempts;
  const currentAttempt = attempts.find(a => a.id === selectedAttemptId) || visibleAttempts[0];
  const resultExam = (currentAttempt ? exams.find(e => e.id === currentAttempt.examId) : undefined) || currentExam;

  // Questions for active exam (preserve questionIds order when defined)
  const getQuestionsForExam = (examObj?: Exam) => {
    if (!examObj) return [];
    if (examObj.questionIds.length > 0) {
      const qMap = new Map(questions.map(q => [q.id, q]));
      return examObj.questionIds
        .map(id => qMap.get(id))
        .filter((q): q is Question => Boolean(q));
    }
    return questions.filter(q => q.subjectId === examObj.subjectId).slice(0, examObj.totalQuestions || 10);
  };

  const examQuestions = getQuestionsForExam(currentExam);
  const resultExamQuestions = getQuestionsForExam(resultExam);

  // Tách biệt hoàn toàn ngân hàng Ôn tập và ngân hàng Đề thi thật Trường
  const practiceOnlyQuestions = questions.filter(q => (q.questionUsage || 'practice') !== 'exam');

  // Questions for active practice session
  const practiceQuestions = practiceOnlyQuestions.filter(q => {
    const matchSubject = q.subjectId === practiceConfig.subjectId;
    const matchChapter = !practiceConfig.chapterId || q.chapterId === practiceConfig.chapterId;
    const matchDiff = practiceConfig.difficulty === 'all' || q.difficulty === practiceConfig.difficulty;
    return matchSubject && matchChapter && matchDiff;
  }).slice(0, practiceConfig.questionCount);

  const canRetakeCurrentExam = resultExam && currentUser
    ? currentUser.role !== 'student' ||
      resultExam.maxAttempts <= 0 ||
      attempts.filter(a => a.examId === resultExam.id && a.studentId === currentUser.id).length < resultExam.maxAttempts
    : false;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Primary Navigation Header */}
      <Header
        currentUser={currentUser}
        activeTab={activeTab}
        onNavigate={handleNavigate}
        onOpenAuthModal={openAuthModal}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
        onLogout={handleLogout}
        notifications={notifications}
        onRefreshNotifications={refreshAllData}
      />

      {/* RBAC / System Notice Banner */}
      {rbacNotice && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between gap-2">
            <span>{rbacNotice}</span>
            <button
              onClick={() => setRbacNotice(null)}
              className="px-2 py-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900 font-bold"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {(activeTab === 'home' || !currentUser) && (
          <HomePage
            currentUser={currentUser}
            subjects={subjects}
            exams={exams}
            chapters={chapters}
            questions={questions}
            onNavigate={handleNavigate}
            onOpenAuthModal={openAuthModal}
          />
        )}

        {currentUser && activeTab === 'subjects' && (
          <SubjectList
            subjects={subjects}
            onSelectSubject={(id) => {
              setSelectedSubjectId(id);
              setActiveTab('subject_detail');
            }}
            onStartPractice={(id) => {
              setSelectedSubjectId(id);
              setPracticeConfig({
                subjectId: id,
                difficulty: 'all',
                questionCount: 10,
                instantFeedback: true,
              });
              setActiveTab('practice');
            }}
          />
        )}

        {currentUser && activeTab === 'subject_detail' && currentSubject && (
          <SubjectDetail
            subject={currentSubject}
            chapters={chapters.filter(c => c.subjectId === currentSubject.id)}
            questions={(currentUser.role === 'student' ? practiceOnlyQuestions : questions).filter(
              q => q.subjectId === currentSubject.id
            )}
            exams={exams.filter(e => e.subjectId === currentSubject.id && (currentUser.role !== 'student' || e.status === 'published'))}
            materials={materials.filter(m => m.subjectId === currentSubject.id)}
            learningDocs={learningDocs.filter(d => d.subjectId === currentSubject.id)}
            projectTopics={projectTopics.filter(t => t.subjectId === currentSubject.id)}
            projectRegistrations={projectRegistrations.filter(r => r.subjectId === currentSubject.id)}
            currentUser={currentUser}
            onBack={() => setActiveTab('subjects')}
            onStartPractice={(subId, chId) => {
              handleStartPracticeWithConfig({
                subjectId: subId,
                chapterId: chId,
                difficulty: 'all',
                questionCount: 10,
                instantFeedback: true,
              });
            }}
            onStartExam={handleStartExam}
            onRefreshMaterials={refreshAllData}
          />
        )}

        {currentUser && activeTab === 'practice' && (
          <PracticeSetup
            subjects={subjects}
            chapters={chapters}
            initialSubjectId={selectedSubjectId}
            onStartSession={handleStartPracticeWithConfig}
          />
        )}

        {currentUser && activeTab === 'practice_room' && currentSubject && (
          <PracticeRoom
            key={`${practiceConfig.subjectId}-${practiceConfig.chapterId || 'all'}-${practiceConfig.difficulty}-${sessionNonce}`}
            currentUser={currentUser}
            subject={currentSubject}
            questions={practiceQuestions}
            instantFeedback={practiceConfig.instantFeedback}
            onExit={() => setActiveTab('practice')}
          />
        )}

        {currentUser && activeTab === 'exams' && (
          <ExamList
            exams={exams}
            subjects={subjects}
            attempts={attempts}
            currentUser={currentUser}
            onStartExam={handleStartExam}
            onOpenPaymentModal={(subjectId, subjectName, examId) => {
              setPaymentModalInfo({
                isOpen: true,
                subjectId,
                subjectName,
                pendingExamId: examId,
              });
            }}
            onViewResult={(attemptId) => {
              const att = attempts.find(a => a.id === attemptId);
              if (att) setSelectedExamId(att.examId);
              setSelectedAttemptId(attemptId);
              setActiveTab('exam_result');
            }}
          />
        )}

        {currentUser && activeTab === 'exam_room' && currentExam && (
          <ExamRoom
            key={`${currentExam.id}-${sessionNonce}`}
            exam={currentExam}
            questions={examQuestions}
            currentUser={currentUser}
            onSubmitExam={handleSubmitExam}
            onExit={() => setActiveTab('exams')}
          />
        )}

        {currentUser && activeTab === 'exam_result' && currentAttempt && resultExam && (
          <ExamResult
            attempt={currentAttempt}
            exam={resultExam}
            questions={resultExamQuestions}
            canRetake={canRetakeCurrentExam}
            onRetake={handleStartExam}
            onBackToExams={() => setActiveTab('exams')}
            onViewAnalytics={() => setActiveTab('analytics')}
          />
        )}

        {currentUser && activeTab === 'analytics' && (
          <StudentAnalytics
            currentUser={currentUser}
            attempts={attempts}
            practiceSessions={practiceSessions}
            subjects={subjects}
            onViewAttempt={(attemptId) => {
              setSelectedAttemptId(attemptId);
              const att = attempts.find(a => a.id === attemptId);
              if (att) setSelectedExamId(att.examId);
              setActiveTab('exam_result');
            }}
            onPracticeSubject={(subId) => {
              handleStartPracticeWithConfig({
                subjectId: subId,
                difficulty: 'all',
                questionCount: 10,
                instantFeedback: true,
              });
            }}
          />
        )}

        {currentUser && activeTab === 'materials' && (
          <MaterialsPage
            materials={materials}
            subjects={subjects}
            onRefreshMaterials={refreshAllData}
          />
        )}

        {currentUser && activeTab === 'lecturer_portal' && (
          currentUser.role === 'lecturer' || currentUser.role === 'admin' ? (
            <LecturerDashboard
              currentUser={currentUser}
              subjects={subjects}
              questions={questions}
              exams={exams}
              attempts={attempts}
              onRefreshData={refreshAllData}
            />
          ) : (
            <div className="max-w-xl mx-auto my-16 p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center shadow-xs">
              <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase mb-2">
                Quyền truy cập bị giới hạn
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Chức năng này chỉ dành cho Giảng viên Khoa Công nghệ Thông tin. Bạn đang đăng nhập với vai trò Sinh viên.
              </p>
              <button
                onClick={() => setActiveTab('home')}
                className="px-4 py-2 bg-blue-800 text-white rounded-lg text-xs font-semibold"
              >
                Về Trang chủ
              </button>
            </div>
          )
        )}

        {currentUser && activeTab === 'admin_portal' && (
          currentUser.role === 'admin' ? (
            <AdminDashboard
              currentUser={currentUser}
              users={users}
              subjects={subjects}
              questions={questions}
              exams={exams}
              logs={logs}
              onRefreshData={refreshAllData}
              isSyncingUsers={isSyncingUsers}
              onSyncUsers={handleSyncUsers}
              isSyncingLogs={isSyncingLogs}
              onSyncLogs={handleSyncLogs}
            />
          ) : (
            <div className="max-w-xl mx-auto my-16 p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center shadow-xs">
              <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase mb-2">
                Khu vực Quản trị Hệ thống
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Chỉ Quản trị viên (Admin) mới có quyền truy cập khu vực này.
              </p>
              <button
                onClick={() => setActiveTab('home')}
                className="px-4 py-2 bg-blue-800 text-white rounded-lg text-xs font-semibold"
              >
                Về Trang chủ
              </button>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <Footer
        subjects={subjects}
        onNavigate={handleNavigate}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          refreshAllData();
          if (user.role === 'admin') {
            void handleSyncUsers();
            void handleSyncLogs();
          }
        }}
      />

      {/* Per-Subject SePay 10,000 VND Exam Unlock Modal */}
      {currentUser && paymentModalInfo && (
        <PaymentGateModal
          isOpen={paymentModalInfo.isOpen}
          user={currentUser}
          subjectId={paymentModalInfo.subjectId}
          subjectName={paymentModalInfo.subjectName}
          reason={paymentModalInfo.reason}
          onClose={() => setPaymentModalInfo(null)}
          onUnlocked={(updatedUser) => {
            const pendingId = paymentModalInfo.pendingExamId;
            setCurrentUser(updatedUser);
            refreshAllData();
            setPaymentModalInfo(null);
            if (pendingId) {
              setSelectedExamId(pendingId);
              setSessionNonce(n => n + 1);
              setActiveTab('exam_room');
            }
          }}
        />
      )}

      {/* User Profile Modal */}
      {currentUser && (
        <UserProfileModal
          currentUser={currentUser}
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          onUserUpdated={(user) => {
            setCurrentUser(user);
            refreshAllData();
          }}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
