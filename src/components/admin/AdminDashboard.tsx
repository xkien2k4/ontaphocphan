import React, { useEffect, useState, useCallback } from 'react';
import {
  User, Subject, SubjectType, Question, Exam, ActivityLog,
  ExamPaymentOrder
} from '../../types';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  toggleUserStatus, resetUserPassword, deleteUser,
  createLecturerUser, registerStudent, syncUsersWithServer, syncLogsWithServer, getServerStorageMode, probeServerStorageMode, getLastUserSyncInfo, getLastLogSyncInfo, updateUserProfile, assignLecturerToSubject,
  unassignLecturerFromSubject, saveSubject, deleteSubject,
  getUploadedQuestionsCount, resetUploadedQuestions,
  getPaymentConfig, savePaymentConfig, getPaymentOrders, adminGrantExamAccess,
  extractErrorMessage
} from '../../services/storageService';
import {
  isFirebaseAdminUser,
  signInFirebaseWithGoogle,
  signOutFirebase,
  subscribeFirebaseAuthState,
} from '../../services/firestoreUserService';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../../firebase';

const BANK_LIST: Array<{ code: string; name: string }> = [
  { code: 'MB', name: 'MB Bank (Ngân hàng Quân đội)' },
  { code: 'ICB', name: 'VietinBank' },
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'ACB', name: 'ACB (Ngân hàng Á Châu)' },
  { code: 'VPB', name: 'VPBank' },
  { code: 'TPB', name: 'TPBank' },
  { code: 'VIB', name: 'VIB' },
  { code: 'STB', name: 'Sacombank' },
  { code: 'HDB', name: 'HDBank' },
  { code: 'OCB', name: 'OCB (Ngân hàng Phương Đông)' },
  { code: 'MSB', name: 'MSB (Hàng Hải)' },
  { code: 'SHB', name: 'SHB' },
  { code: 'LPB', name: 'LPBank (Lộc Phát)' },
  { code: 'EIB', name: 'Eximbank' },
  { code: 'VBA', name: 'Agribank' },
  { code: 'CAKE', name: 'CAKE by VPBank' },
];

interface AdminDashboardProps {
  currentUser: User;
  users: User[];
  subjects: Subject[];
  questions: Question[];
  exams: Exam[];
  logs: ActivityLog[];
  onRefreshData: () => void;
  isSyncingUsers?: boolean;
  onSyncUsers?: () => Promise<void> | void;
  isSyncingLogs?: boolean;
  onSyncLogs?: () => Promise<void> | void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  users,
  subjects,
  questions,
  exams,
  logs,
  onRefreshData,
  isSyncingUsers = false,
  onSyncUsers,
  isSyncingLogs = false,
  onSyncLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'lecturers' | 'subjects' | 'payment' | 'logs'>('users');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [searchUser, setSearchUser] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fbAuthUser, setFbAuthUser] = useState<FirebaseUser | null>(null);
  const [isConnectingFirebase, setIsConnectingFirebase] = useState(false);
  const [storageMode, setStorageMode] = useState(() => getServerStorageMode());

  useEffect(() => {
    return subscribeFirebaseAuthState((u) => setFbAuthUser(u));
  }, []);

  useEffect(() => {
    void probeServerStorageMode().then((mode) => {
      setStorageMode(mode);
    });
  }, [users.length]);

  useEffect(() => {
    if (activeTab === 'logs') {
      void (onSyncLogs ? onSyncLogs() : syncLogsWithServer());
    }
  }, [activeTab]);

  // Manual Bank Transfer (10k/subject) Config & Orders state
  const [paymentOrders, setPaymentOrders] = useState<ExamPaymentOrder[]>([]);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [payBankCode, setPayBankCode] = useState('ICB');
  const [payBankName, setPayBankName] = useState('VietinBank');
  const [payAccountNumber, setPayAccountNumber] = useState('');
  const [payAccountName, setPayAccountName] = useState('');
  const [payFeeVnd, setPayFeeVnd] = useState<number>(10000);
  const [payEnabled, setPayEnabled] = useState<boolean>(true);
  const [quickUnlockStudentId, setQuickUnlockStudentId] = useState<string>('');
  const [quickUnlockSubjectId, setQuickUnlockSubjectId] = useState<string>(subjects[0]?.id || '');
  const [isUnlockingSubject, setIsUnlockingSubject] = useState<boolean>(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');

  // Confirm modal (Delete User / Delete Subject)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Modal: Create / Edit Subject
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubNameEn, setNewSubNameEn] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');
  const [newSubCredits, setNewSubCredits] = useState<number>(3);
  const [newSubSemester, setNewSubSemester] = useState<number>(1);
  const [newSubCategory, setNewSubCategory] = useState<'programming' | 'systems' | 'data' | 'software' | 'ai'>('programming');
  const [newSubType, setNewSubType] = useState<SubjectType>('theory');
  const [newSubLecturerId, setNewSubLecturerId] = useState<string>('');
  const [newSubIsHot, setNewSubIsHot] = useState<boolean>(false);
  const [subjectModalError, setSubjectModalError] = useState<string | null>(null);

  // Modal: Create Student
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false);
  const [newSvFullName, setNewSvFullName] = useState('');
  const [newSvCode, setNewSvCode] = useState('');
  const [newSvEmail, setNewSvEmail] = useState('');
  const [newSvClass, setNewSvClass] = useState('CNTT1.K23');
  const [newSvPassword, setNewSvPassword] = useState('123456');
  const [studentModalError, setStudentModalError] = useState<string | null>(null);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  // Modal: Create Lecturer
  const [isCreateLecturerOpen, setIsCreateLecturerOpen] = useState(false);
  const [newGvUsername, setNewGvUsername] = useState('');
  const [newGvFullName, setNewGvFullName] = useState('');
  const [newGvCode, setNewGvCode] = useState('');
  const [newGvEmail, setNewGvEmail] = useState('');
  const [newGvPhone, setNewGvPhone] = useState('');
  const [newGvDept, setNewGvDept] = useState('Khoa Công nghệ Thông tin');
  const [newGvPassword, setNewGvPassword] = useState('gv123456');
  const [newGvSubjects, setNewGvSubjects] = useState<string[]>([]);
  const [lecturerModalError, setLecturerModalError] = useState<string | null>(null);

  // Modal: Edit User
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editClassOrDept, setEditClassOrDept] = useState('');
  const [resetPassInput, setResetPassInput] = useState('');
  const [editUserError, setEditUserError] = useState<string | null>(null);

  // Modal: Assign Subject
  const [assigningSubject, setAssigningSubject] = useState<Subject | null>(null);
  const [selectedLecturerId, setSelectedLecturerId] = useState<string>('');
  const [assignError, setAssignError] = useState<string | null>(null);

  // Tab 2: Search lecturer / assigned subject & inline quick-assign selector per lecturer
  const [searchLecturer, setSearchLecturer] = useState<string>('');
  const [quickAssignByLecturer, setQuickAssignByLecturer] = useState<Record<string, string>>({});

  const showToast = (msg: unknown, type: 'success' | 'error' = 'success') => {
    setToast({ type, text: extractErrorMessage(msg, 'Thông báo hệ thống.') });
    setTimeout(() => setToast(null), 3500);
  };

  const loadPaymentData = useCallback(async () => {
    setLoadingPayment(true);
    try {
      const [cfg, orders] = await Promise.all([getPaymentConfig(), getPaymentOrders()]);
      setPayBankCode(cfg.bankCode || 'ICB');
      setPayBankName(cfg.bankName || 'VietinBank');
      setPayAccountNumber(cfg.accountNumber || '');
      setPayAccountName(cfg.accountName || '');
      setPayFeeVnd(cfg.examFeeVnd || 10000);
      setPayEnabled(cfg.enabled !== false);
      setPaymentOrders(orders || []);
    } catch (err: any) {
      showToast(extractErrorMessage(err, 'Không thể tải dữ liệu chuyển khoản từ máy chủ.'), 'error');
    } finally {
      setLoadingPayment(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'payment') {
      void loadPaymentData();
    } else if (activeTab === 'users' && onSyncUsers) {
      void onSyncUsers();
    }
  }, [activeTab, loadPaymentData]);

  const handleSavePaymentConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAcc = payAccountNumber.replace(/\s+/g, '').trim();
    const cleanAccName = payAccountName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .trim()
      .toUpperCase();

    if (!cleanAcc) {
      showToast('Vui lòng nhập số tài khoản ngân hàng nhận tiền.', 'error');
      return;
    }
    if (!cleanAccName) {
      showToast('Vui lòng nhập tên chủ tài khoản ngân hàng (viết hoa không dấu).', 'error');
      return;
    }

    setSavingPayment(true);
    try {
      const updated = await savePaymentConfig({
        bankCode: payBankCode.trim().toUpperCase(),
        bankName: payBankName,
        accountNumber: cleanAcc,
        accountName: cleanAccName,
        examFeeVnd: Math.max(1000, Number(payFeeVnd) || 10000),
        enabled: payEnabled,
      });
      setPayBankCode(updated.bankCode);
      setPayBankName(updated.bankName);
      setPayAccountNumber(updated.accountNumber);
      setPayAccountName(updated.accountName);
      setPayFeeVnd(updated.examFeeVnd);
      setPayEnabled(updated.enabled);
      showToast('Đã lưu thông tin tài khoản ngân hàng nhận chuyển khoản thành công!');
    } catch (err: any) {
      showToast(extractErrorMessage(err, 'Lỗi khi lưu cấu hình tài khoản ngân hàng.'), 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleManualGrantAccess = (
    targetUser: User,
    subjectId: string,
    subjectName?: string,
    orderCode?: string
  ) => {
    const resolvedSubName = subjectName || subjects.find(s => s.id === subjectId)?.name || subjectId;
    setConfirmModal({
      title: 'Xác nhận mở khóa Môn Thi thử (10.000đ)',
      message: `Xác nhận sinh viên "${targetUser.fullName}" (${targetUser.studentCode || targetUser.username}) đã chuyển khoản 10.000đ cho môn "${resolvedSubName}" và mở khóa hệ thống thi thử (đề cương học phần) cho môn này?`,
      confirmLabel: 'Xác nhận mở khóa môn',
      onConfirm: async () => {
        try {
          const res = await adminGrantExamAccess(
            targetUser.id,
            subjectId,
            resolvedSubName,
            orderCode,
            `Admin: ${currentUser.fullName}`
          );
          if (Array.isArray(res.orders)) {
            setPaymentOrders(res.orders);
          }
          setConfirmModal(null);
          onRefreshData();
          showToast(`Đã mở khóa thi thử môn [${resolvedSubName}] cho [${targetUser.fullName}]!`);
        } catch (err: any) {
          setConfirmModal(null);
          showToast(extractErrorMessage(err, 'Lỗi khi mở khóa môn thi thử.'), 'error');
        }
      },
    });
  };

  const handleQuickUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUnlockStudentId || !quickUnlockSubjectId) {
      showToast('Vui lòng chọn sinh viên và môn học cần mở khóa.', 'error');
      return;
    }
    const student = users.find(u => u.id === quickUnlockStudentId);
    const subject = subjects.find(s => s.id === quickUnlockSubjectId);
    if (!student || !subject) {
      showToast('Không tìm thấy thông tin sinh viên hoặc môn học.', 'error');
      return;
    }
    setIsUnlockingSubject(true);
    try {
      const res = await adminGrantExamAccess(
        student.id,
        subject.id,
        subject.name,
        undefined,
        `Admin: ${currentUser.fullName}`
      );
      if (Array.isArray(res.orders)) {
        setPaymentOrders(res.orders);
      }
      onRefreshData();
      showToast(`Đã xác nhận 10.000đ và mở khóa môn "${subject.name}" cho ${student.fullName}!`);
    } catch (err: any) {
      showToast(extractErrorMessage(err, 'Không thể xác nhận mở khóa môn học.'), 'error');
    } finally {
      setIsUnlockingSubject(false);
    }
  };

  const handleToggleLock = async (targetUser: User) => {
    try {
      const newStatus = await toggleUserStatus(targetUser.id);
      onRefreshData();
      showToast(`Đã ${newStatus === 'locked' ? 'khóa' : 'mở khóa'} tài khoản [${targetUser.fullName}]`);
    } catch (err: any) {
      showToast(extractErrorMessage(err, 'Lỗi khi cập nhật trạng thái'), 'error');
    }
  };

  const handleDeleteUser = (targetUser: User) => {
    setConfirmModal({
      title: 'Xác nhận xóa tài khoản',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${targetUser.fullName}" (${targetUser.username}) khỏi hệ thống?`,
      confirmLabel: 'Xóa tài khoản',
      onConfirm: async () => {
        try {
          await deleteUser(targetUser.id);
          setConfirmModal(null);
          onRefreshData();
          showToast(`Đã xóa vĩnh viễn tài khoản [${targetUser.fullName}]`);
        } catch (err: any) {
          setConfirmModal(null);
          showToast(extractErrorMessage(err, 'Lỗi khi xóa tài khoản'), 'error');
        }
      },
    });
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email);
    setEditPhone(user.phone || '');
    setEditClassOrDept(user.className || user.department || '');
    setResetPassInput('');
    setEditUserError(null);
  };

  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserError(null);
    if (resetPassInput.trim() && resetPassInput.trim().length < 6) {
      setEditUserError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    try {
      await updateUserProfile(editingUser.id, {
        fullName: editFullName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        className: editingUser.role === 'student' ? editClassOrDept.trim() : undefined,
        department: editingUser.role === 'lecturer' || editingUser.role === 'admin' ? editClassOrDept.trim() : undefined,
      });

      if (resetPassInput.trim()) {
        await resetUserPassword(editingUser.id, resetPassInput.trim());
      }

      onRefreshData();
      setEditingUser(null);
      showToast(`Đã cập nhật thông tin tài khoản [${editFullName.trim()}]`);
    } catch (err: any) {
      setEditUserError(extractErrorMessage(err, 'Lỗi khi lưu thông tin'));
    }
  };

  const handleCreateLecturerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLecturerModalError(null);
    if (!newGvFullName.trim() || !newGvUsername.trim() || !newGvEmail.trim() || !newGvCode.trim() || !newGvPassword) {
      setLecturerModalError('Vui lòng điền đầy đủ các thông tin bắt buộc.');
      return;
    }

    if (!/^\d{4}$/.test(newGvCode.trim())) {
      setLecturerModalError('Mã giảng viên (ID giảng viên) bắt buộc phải gồm đúng 4 chữ số (ví dụ: 0006).');
      return;
    }

    try {
      await createLecturerUser({
        username: newGvUsername.trim(),
        fullName: newGvFullName.trim(),
        lecturerCode: newGvCode.trim(),
        email: newGvEmail.trim(),
        phone: newGvPhone.trim(),
        department: newGvDept.trim(),
        password: newGvPassword,
        assignedSubjectIds: newGvSubjects,
      });

      onRefreshData();
      setIsCreateLecturerOpen(false);
      setNewGvUsername('');
      setNewGvFullName('');
      setNewGvCode('');
      setNewGvEmail('');
      setNewGvPhone('');
      setNewGvSubjects([]);
      showToast(`Đã cấp thành công tài khoản giảng viên [${newGvFullName.trim()}]`);
    } catch (err: any) {
      setLecturerModalError(extractErrorMessage(err, 'Lỗi khi cấp tài khoản giảng viên'));
    }
  };

  const handleOpenCreateStudent = () => {
    setNewSvFullName('');
    setNewSvCode('');
    setNewSvEmail('');
    setNewSvClass('CNTT1.K23');
    setNewSvPassword('123456');
    setStudentModalError(null);
    setIsCreateStudentOpen(true);
  };

  const handleCreateStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingStudent) return;
    setStudentModalError(null);

    if (!newSvFullName.trim() || !newSvCode.trim() || !newSvEmail.trim() || !newSvClass.trim()) {
      setStudentModalError('Vui lòng điền đầy đủ họ tên, MSSV, email và lớp sinh hoạt.');
      return;
    }

    setIsCreatingStudent(true);
    try {
      const student = await registerStudent(
        {
          fullName: newSvFullName.trim(),
          studentCode: newSvCode.trim(),
          email: newSvEmail.trim(),
          className: newSvClass.trim(),
          major: 'Công nghệ Thông tin',
          password: newSvPassword || '123456',
        },
        { autoLogin: false }
      );
      setIsCreateStudentOpen(false);
      onRefreshData();
      showToast(`Đã tạo thành công tài khoản sinh viên [${student.studentCode}] - ${student.fullName}`);
    } catch (err: any) {
      setStudentModalError(extractErrorMessage(err, 'Lỗi khi tạo tài khoản sinh viên'));
    } finally {
      setIsCreatingStudent(false);
    }
  };

  const handleExportUsersJson = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(users, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `danh_sach_tai_khoan_dhhp_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Đã xuất file sao lưu danh sách tài khoản thành công!');
    } catch {
      showToast('Không thể xuất file sao lưu.', 'error');
    }
  };

  const handleImportUsersJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) {
          showToast('File JSON không hợp lệ (cần là danh sách tài khoản).', 'error');
          return;
        }

        await fetch('/api/users/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users: imported }),
        }).catch(() => {});

        await syncUsersWithServer();
        onRefreshData();
        showToast(`Đã khôi phục thành công danh sách tài khoản (${imported.length} tài khoản)!`);
      } catch {
        showToast('Lỗi khi đọc file sao lưu tài khoản.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleAssignSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAssignError(null);
    if (!assigningSubject || !selectedLecturerId) {
      setAssignError('Vui lòng chọn giảng viên để phân công.');
      return;
    }

    try {
      assignLecturerToSubject(assigningSubject.id, selectedLecturerId);
      onRefreshData();
      setAssigningSubject(null);
      showToast(`Đã phân công giảng viên cho môn [${assigningSubject.name}]`);
    } catch (err: any) {
      setAssignError(extractErrorMessage(err, 'Lỗi khi phân công'));
    }
  };

  const handleQuickAssignToLecturer = (gv: User) => {
    const subjectId = quickAssignByLecturer[gv.id];
    if (!subjectId) {
      showToast('Vui lòng chọn môn học cần phân công.', 'error');
      return;
    }
    const targetSub = subjects.find(s => s.id === subjectId);
    try {
      assignLecturerToSubject(subjectId, gv.id);
      setQuickAssignByLecturer(prev => ({ ...prev, [gv.id]: '' }));
      onRefreshData();
      showToast(`Đã phân công môn [${targetSub?.code || subjectId}] cho ${gv.fullName}`);
    } catch (err: any) {
      showToast(extractErrorMessage(err, 'Lỗi khi phân công môn học'), 'error');
    }
  };

  const handleUnassignSubjectFromLecturer = (subject: Subject, gv: User) => {
    setConfirmModal({
      title: 'Gỡ phân công môn học',
      message: `Gỡ môn học "${subject.name}" (${subject.code}) khỏi danh sách phụ trách của ${gv.fullName}? Dữ liệu câu hỏi và đề thi của môn học vẫn được giữ nguyên.`,
      confirmLabel: 'Gỡ phân công',
      onConfirm: () => {
        try {
          unassignLecturerFromSubject(subject.id);
          setConfirmModal(null);
          onRefreshData();
          showToast(`Đã gỡ phân công môn [${subject.code}] khỏi ${gv.fullName}`);
        } catch (err: any) {
          setConfirmModal(null);
          showToast(extractErrorMessage(err, 'Lỗi khi gỡ phân công môn học'), 'error');
        }
      },
    });
  };

  const handleOpenCreateSubject = (defaultLecturerId = '') => {
    setEditingSubject(null);
    setNewSubCode('');
    setNewSubName('');
    setNewSubNameEn('');
    setNewSubDesc('');
    setNewSubCredits(3);
    setNewSubSemester(1);
    setNewSubCategory('programming');
    setNewSubType('theory');
    setNewSubLecturerId(defaultLecturerId);
    setNewSubIsHot(false);
    setSubjectModalError(null);
    setIsSubjectModalOpen(true);
  };

  const handleOpenEditSubject = (s: Subject) => {
    setEditingSubject(s);
    setNewSubCode(s.code);
    setNewSubName(s.name);
    setNewSubNameEn(s.nameEn);
    setNewSubDesc(s.description);
    setNewSubCredits(s.credits);
    setNewSubSemester(s.semester);
    setNewSubCategory(s.category);
    setNewSubType(s.subjectType || 'theory');
    setNewSubLecturerId(s.assignedLecturerId || '');
    setNewSubIsHot(Boolean(s.isHot));
    setSubjectModalError(null);
    setIsSubjectModalOpen(true);
  };

  const handleSaveSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubjectModalError(null);
    if (!newSubCode.trim() || !newSubName.trim()) {
      setSubjectModalError('Vui lòng điền mã học phần và tên môn học.');
      return;
    }

    try {
      const assignedLecturer = users.find(u => u.id === newSubLecturerId);
      const safeCredits = Math.max(1, Math.min(12, Number(newSubCredits) || 3));
      const safeSemester = Math.max(1, Math.min(12, Number(newSubSemester) || 1));
      const saved = saveSubject({
        id: editingSubject?.id,
        code: newSubCode.trim().toUpperCase(),
        name: newSubName.trim(),
        nameEn: newSubNameEn.trim(),
        description: newSubDesc.trim(),
        credits: safeCredits,
        semester: safeSemester,
        category: newSubCategory,
        subjectType: newSubType,
        isHot: newSubIsHot,
        assignedLecturerId: assignedLecturer?.id,
        assignedLecturerName: assignedLecturer?.fullName,
        chaptersCount: editingSubject?.chaptersCount,
        questionsCount: editingSubject?.questionsCount,
        studentsCount: editingSubject?.studentsCount,
        status: editingSubject?.status || 'active',
      });

      if (editingSubject) {
        if (assignedLecturer) {
          assignLecturerToSubject(saved.id, assignedLecturer.id);
        } else {
          unassignLecturerFromSubject(saved.id);
        }
      }

      onRefreshData();
      setIsSubjectModalOpen(false);
      showToast(editingSubject ? `Đã cập nhật môn học [${newSubName.trim()}]!` : `Thêm mới môn học [${newSubName.trim()}] thành công!`);
    } catch (err: any) {
      setSubjectModalError(extractErrorMessage(err, 'Lỗi khi lưu thông tin môn học'));
    }
  };

  const handleDeleteSubject = (s: Subject) => {
    setConfirmModal({
      title: 'Xác nhận xóa môn học',
      message: `Bạn có chắc chắn muốn xóa môn học "${s.name}" (${s.code}) khỏi hệ thống?`,
      confirmLabel: 'Xóa môn học',
      onConfirm: () => {
        deleteSubject(s.id);
        setConfirmModal(null);
        onRefreshData();
        showToast(`Đã xóa môn học [${s.code}] - ${s.name}`);
      },
    });
  };

  const filteredUsers = users
    .filter((u) => {
      const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter;
      const q = searchUser.toLowerCase().trim();
      const matchSearch =
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.studentCode && u.studentCode.toLowerCase().includes(q)) ||
        (u.lecturerCode && u.lecturerCode.toLowerCase().includes(q));
      return matchRole && matchSearch;
    })
    .sort((a, b) => {
      const roleRank = (role: User['role']) => (role === 'admin' ? 0 : role === 'student' ? 1 : 2);
      const rankDiff = roleRank(a.role) - roleRank(b.role);
      if (rankDiff !== 0) return rankDiff;
      if (a.role === 'student' && b.role === 'student') {
        const tsA = Date.parse(a.createdAt || a.lastLogin || '') || 0;
        const tsB = Date.parse(b.createdAt || b.lastLogin || '') || 0;
        return tsB - tsA;
      }
      if (a.role === 'lecturer' && b.role === 'lecturer') {
        return (a.lecturerCode || '').localeCompare(b.lecturerCode || '');
      }
      return 0;
    });

  const lecturers = users.filter(u => u.role === 'lecturer');
  const students = users.filter(u => u.role === 'student');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Admin Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Trung Tâm Quản Trị Hệ Thống
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Quản lý tài khoản toàn trường, quản lý môn học, phân công giảng dạy, giám sát đề thi và nhật ký hệ thống
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLecturerModalError(null);
              setIsCreateLecturerOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-blue-800 hover:bg-blue-900 text-white shadow-xs transition"
          >
            + Cấp tài khoản Giảng viên mới
          </button>
          <button
            onClick={() => handleOpenCreateSubject()}
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition"
          >
            + Thêm Môn học mới
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`p-3 border rounded-lg text-xs font-semibold animate-in fade-in ${
            toast.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Tổng tài khoản</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
            {users.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {students.length} SV · {lecturers.length} GV
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Môn học chuyên ngành</div>
          <div className="text-2xl font-extrabold text-blue-700 dark:text-blue-400 font-mono mt-1">
            {subjects.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Khung chương trình đào tạo</div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Ngân hàng câu hỏi</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
            {questions.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Đã được giảng viên duyệt</div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Đề thi khảo thí</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
            {exams.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Đang công bố trực tuyến</div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Nhật ký hệ thống</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
            {logs.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Ghi nhận bảo mật audit</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('users')}
          className={`py-3 px-4 border-b-2 transition whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Quản lý Tài khoản ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('lecturers')}
          className={`py-3 px-4 border-b-2 transition whitespace-nowrap ${
            activeTab === 'lecturers'
              ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Phân công Giảng viên ({lecturers.length})
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`py-3 px-4 border-b-2 transition whitespace-nowrap ${
            activeTab === 'subjects'
              ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Quản lý Môn học ({subjects.length})
        </button>

        <button
          onClick={() => setActiveTab('payment')}
          className={`py-3 px-4 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'payment'
              ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>Thu phí & Mở khóa Môn (10k)</span>
          {paymentOrders.filter(o => o.status === 'pending').length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {paymentOrders.filter(o => o.status === 'pending').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`py-3 px-4 border-b-2 transition whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Nhật ký Hoạt động ({logs.length})
        </button>
      </div>

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          {/* Firebase Cloud Firestore + Centralized Sync Panel */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900">Đồng bộ Tập trung Đa thiết bị:</span>
                {isFirebaseAdminUser(fbAuthUser) ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">
                    Firebase Firestore: Đang bật thời gian thực ({fbAuthUser?.email})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-bold">
                    Firebase Firestore: Chưa đăng nhập Google Admin
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-300 font-semibold">
                  Server API: {
                    storageMode === 'persistent_cloud'
                      ? 'Cloud KV / Upstash'
                      : storageMode === 'persistent_disk'
                        ? 'data/users.json'
                        : storageMode === 'ephemeral_tmp'
                          ? 'Vercel /tmp (tạm)'
                          : 'Đang kiểm tra...'
                  }
                </span>
                {getLastUserSyncInfo().syncedAt && (
                  <span className="text-[11px] text-slate-500">
                    Cập nhật lúc {new Date(getLastUserSyncInfo().syncedAt!).toLocaleTimeString('vi-VN')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isFirebaseAdminUser(fbAuthUser) ? (
                <>
                  <button
                    type="button"
                    disabled={isSyncingUsers}
                    onClick={async () => {
                      await (onSyncUsers ? onSyncUsers() : syncUsersWithServer());
                      setStorageMode(getServerStorageMode());
                      onRefreshData();
                      const syncErr = getLastUserSyncInfo().error;
                      if (syncErr) {
                        showToast(`Đã đồng bộ Firebase Firestore (Lưu ý API: ${syncErr})`, 'error');
                      } else {
                        showToast('Đã đồng bộ 2 chiều Server <-> Firebase Firestore thành công!');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition"
                  >
                    Đồng bộ 2 chiều ngay
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOutFirebase()}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition"
                  >
                    Ngắt kết nối Google
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isConnectingFirebase}
                  onClick={async () => {
                    setIsConnectingFirebase(true);
                    try {
                      const fbU = await signInFirebaseWithGoogle();
                      if (!isFirebaseAdminUser(fbU)) {
                        showToast(
                          `Tài khoản ${fbU.email || ''} không phải Admin Firebase (${BOOTSTRAPPED_ADMIN_EMAIL}). Vui lòng chọn đúng Gmail Quản trị.`,
                          'error'
                        );
                        await signOutFirebase();
                      } else {
                        await (onSyncUsers ? onSyncUsers() : syncUsersWithServer());
                        setStorageMode(getServerStorageMode());
                        onRefreshData();
                        showToast('Đã kết nối Google Firebase Admin & đồng bộ toàn bộ tài khoản lên Cloud Firestore!');
                      }
                    } catch (err: any) {
                      showToast(extractErrorMessage(err, 'Không thể kết nối Google Firebase.'), 'error');
                    } finally {
                      setIsConnectingFirebase(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-800 hover:bg-blue-900 disabled:bg-blue-400 text-white shadow-xs transition"
                >
                  {isConnectingFirebase ? 'Đang kết nối Firebase...' : 'Kết nối Google Firebase Admin'}
                </button>
              )}
            </div>
          </div>

          {storageMode === 'ephemeral_tmp' && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Máy chủ Vercel đang chạy chế độ lưu tạm Serverless (/tmp)</span>
              </div>
              <p className="leading-relaxed">
                Trên Vercel Serverless, file <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 rounded">data/users.json</code> không lưu vĩnh viễn giữa các instance. Để sinh viên đăng ký từ điện thoại hoặc tab ẩn danh đồng bộ ngay về bảng Tài khoản trên máy Admin, hãy gắn <strong>Upstash for Redis</strong> trong Vercel Storage (hoặc thêm biến <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 rounded">FIREBASE_DATABASE_URL</code>) rồi <strong>Redeploy</strong>.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Lọc theo vai trò:</span>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'student', label: 'Sinh viên' },
                  { id: 'lecturer', label: 'Giảng viên' },
                  { id: 'admin', label: 'Admin' },
                ].map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setUserRoleFilter(r.id)}
                    className={`px-2.5 py-1 rounded transition ${
                      userRoleFilter === r.id
                        ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Tìm tên, email, username hoặc MSSV..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={handleOpenCreateStudent}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-800 text-white hover:bg-blue-900 shadow-xs whitespace-nowrap transition cursor-pointer"
              >
                + Thêm Sinh viên
              </button>

              <button
                type="button"
                onClick={handleExportUsersJson}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap transition"
                title="Tải file JSON sao lưu danh sách tài khoản"
              >
                Xuất JSON
              </button>

              <label
                htmlFor="admin-import-users-file"
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap transition cursor-pointer"
                title="Khôi phục danh sách tài khoản từ file JSON"
              >
                Nhập JSON
                <input
                  id="admin-import-users-file"
                  type="file"
                  accept=".json"
                  onChange={handleImportUsersJson}
                  className="hidden"
                />
              </label>

              {onSyncUsers && (
                <button
                  type="button"
                  disabled={isSyncingUsers}
                  onClick={async () => {
                    await onSyncUsers();
                    setStorageMode(getServerStorageMode());
                    const syncErr = getLastUserSyncInfo().error;
                    if (syncErr) {
                      showToast(syncErr, 'error');
                    } else {
                      showToast('Đã đồng bộ danh sách tài khoản mới nhất từ máy chủ!');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60 whitespace-nowrap transition"
                >
                  {isSyncingUsers ? 'Đang đồng bộ...' : 'Làm mới máy chủ'}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-bold text-[11px]">
                  <th className="py-2.5 px-3">Họ và tên</th>
                  <th className="py-2.5 px-3">Tài khoản & Email</th>
                  <th className="py-2.5 px-3">Mã định danh</th>
                  <th className="py-2.5 px-3">Vai trò</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                  <th className="py-2.5 px-3">Lần đăng nhập</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">{u.fullName}</div>
                      <div className="text-[11px] text-slate-400">
                        {u.className || u.department || 'Ban Quản trị'}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="text-slate-800 dark:text-slate-200">{u.email}</div>
                      <div className="text-[11px] font-mono text-slate-400">{u.username}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-blue-700 dark:text-blue-400">
                      {u.studentCode ? `MSSV: ${u.studentCode}` : u.lecturerCode ? `MSGV: ${u.lecturerCode}` : 'ADMIN'}
                    </td>

                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.role === 'admin'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : u.role === 'lecturer'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {u.role === 'admin' ? 'Quản trị viên' : u.role === 'lecturer' ? 'Giảng viên' : 'Sinh viên'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {u.status === 'active' ? '[Hoạt động]' : '[Đã khóa]'}
                        </span>
                        {u.role === 'student' && (
                          <>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              Lớp: {u.className || 'Chưa cập nhật'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              (u.paidSubjectIds?.length || 0) > 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {(u.paidSubjectIds?.length || 0) > 0
                                ? `Đã mở ${u.paidSubjectIds!.length} môn thi`
                                : 'Chưa mở môn thi'}
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleString('vi-VN') : 'Chưa đăng nhập'}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px]"
                        >
                          Sửa
                        </button>

                        {u.id !== currentUser.id && (
                          <button
                            onClick={() => handleToggleLock(u)}
                            className={`px-2 py-1 rounded font-semibold text-[11px] ${
                              u.status === 'active'
                                ? 'border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300'
                                : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300'
                            }`}
                          >
                            {u.status === 'active' ? 'Khóa' : 'Mở'}
                          </button>
                        )}

                        {u.id !== currentUser.id && u.role !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 font-semibold text-[11px]"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: LECTURER MANAGEMENT & ASSIGNMENT */}
      {activeTab === 'lecturers' && (() => {
        const lq = searchLecturer.toLowerCase().trim();
        const filteredLecturers = lecturers.filter((gv) => {
          if (!lq) return true;
          const gvSubs = subjects.filter(s =>
            s.assignedLecturerId === gv.id || (gv.assignedSubjectIds && gv.assignedSubjectIds.includes(s.id))
          );
          return (
            gv.fullName.toLowerCase().includes(lq) ||
            gv.username.toLowerCase().includes(lq) ||
            gv.email.toLowerCase().includes(lq) ||
            (gv.lecturerCode && gv.lecturerCode.toLowerCase().includes(lq)) ||
            gvSubs.some(s => s.code.toLowerCase().includes(lq) || s.name.toLowerCase().includes(lq))
          );
        });

        const unassignedSubs = subjects.filter(s => !s.assignedLecturerId);

        return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Danh Sách Giảng Viên & Phân Công Môn Học Phụ Trách
              </h3>
              <p className="text-xs text-slate-500">
                Admin có thể thêm mới, chỉnh sửa thông tin, đổi giảng viên, gỡ phân công hoặc xóa môn học trực tiếp cho từng giảng viên
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Tìm giảng viên, mã GV hoặc môn phụ trách..."
                value={searchLecturer}
                onChange={(e) => setSearchLecturer(e.target.value)}
                className="w-full sm:w-64 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <button
                onClick={() => handleOpenCreateSubject()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition"
              >
                + Thêm môn học mới
              </button>
              <button
                onClick={() => {
                  setLecturerModalError(null);
                  setIsCreateLecturerOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-800 hover:bg-blue-900 text-white transition"
              >
                + Cấp tài khoản Giảng viên mới
              </button>
            </div>
          </div>

          {unassignedSubs.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-amber-900 dark:text-amber-300">
                <strong>{unassignedSubs.length} học phần chưa có giảng viên phụ trách:</strong>{' '}
                {unassignedSubs.map(s => `${s.code} - ${s.name}`).join(', ')}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('subjects')}
                className="px-2.5 py-1 rounded border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                Xem danh sách môn học
              </button>
            </div>
          )}

          {filteredLecturers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Không tìm thấy giảng viên hoặc môn học phù hợp với từ khóa "{searchLecturer}".
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredLecturers.map((gv) => {
                const assignedSubs = subjects.filter(s =>
                  s.assignedLecturerId === gv.id || (gv.assignedSubjectIds && gv.assignedSubjectIds.includes(s.id))
                );
                const assignableSubs = subjects.filter(s => !assignedSubs.some(a => a.id === s.id));
                const selectedQuickSubId = quickAssignByLecturer[gv.id] || '';

                return (
                  <div
                    key={gv.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{gv.fullName}</h4>
                          <div className="text-xs text-slate-500">
                            Mã GV: <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{gv.lecturerCode}</span> · {gv.department}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            gv.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {gv.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Giảng viên
                          </span>
                        </div>
                      </div>

                      <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
                        <div>
                          Email: <strong className="text-slate-800 dark:text-slate-200">{gv.email}</strong>
                        </div>
                        <div>
                          Username: <span className="font-mono">{gv.username}</span>
                        </div>
                        <div className="sm:col-span-2">
                          Số điện thoại: <span>{gv.phone || 'Chưa cập nhật'}</span>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            Môn học được phân công ({assignedSubs.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenCreateSubject(gv.id)}
                            className="px-2 py-1 rounded text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition"
                          >
                            + Tạo & giao môn mới
                          </button>
                        </div>

                        {assignedSubs.length === 0 ? (
                          <div className="p-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-400 italic">
                            Chưa được phân công môn học nào
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {assignedSubs.map(s => (
                              <div
                                key={s.id}
                                className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-slate-900 dark:text-white">
                                    <span className="font-mono font-bold text-blue-700 dark:text-blue-400">[{s.code}]</span>
                                    <span className="truncate">{s.name}</span>
                                    {s.isHot && (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                                        HOT
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                                    <span>{s.credits} TC · HK {s.semester}</span>
                                    <span>•</span>
                                    <span>
                                      {s.subjectType === 'practical'
                                        ? 'Thực hành'
                                        : s.subjectType === 'project'
                                        ? 'Đồ án'
                                        : 'Lý thuyết'}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditSubject(s)}
                                    className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px] text-slate-700 dark:text-slate-200"
                                  >
                                    Sửa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssigningSubject(s);
                                      setSelectedLecturerId(s.assignedLecturerId || gv.id);
                                      setAssignError(null);
                                    }}
                                    className="px-2 py-1 rounded border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 font-semibold text-[11px]"
                                  >
                                    Đổi GV
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUnassignSubjectFromLecturer(s, gv)}
                                    className="px-2 py-1 rounded border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-semibold text-[11px]"
                                  >
                                    Gỡ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSubject(s)}
                                    className="px-2 py-1 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 font-semibold text-[11px]"
                                  >
                                    Xóa
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick assign existing subject to this lecturer */}
                    <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
                      <select
                        value={selectedQuickSubId}
                        onChange={(e) => setQuickAssignByLecturer(prev => ({ ...prev, [gv.id]: e.target.value }))}
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      >
                        <option value="">-- Chọn môn học có sẵn để phân công thêm --</option>
                        {assignableSubs.map(s => (
                          <option key={s.id} value={s.id}>
                            [{s.code}] {s.name} {s.assignedLecturerName ? `(Hiện tại: ${s.assignedLecturerName})` : '(Chưa phân công)'}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedQuickSubId}
                        onClick={() => handleQuickAssignToLecturer(gv)}
                        className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-900 disabled:opacity-50 text-white font-bold text-xs whitespace-nowrap transition"
                      >
                        + Phân công
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {/* TAB 3: SUBJECTS MANAGEMENT */}
      {activeTab === 'subjects' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Quản lý Danh Sách Môn Học Chuyên Ngành
              </h3>
              <p className="text-xs text-slate-500">
                Thêm môn học mới, cập nhật thông tin học phần, chỉ định giảng viên phụ trách và theo dõi trạng thái
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getUploadedQuestionsCount() > 0 && (
                <button
                  onClick={() => {
                    const count = getUploadedQuestionsCount();
                    setConfirmModal({
                      title: 'Reset câu hỏi đã upload',
                      message: `Xóa toàn bộ ${count} câu hỏi cũ đã tải lên (và đề thi tự tạo tương ứng), đặt lại số lượng câu hỏi của các học phần về mặc định?`,
                      confirmLabel: 'Xóa & Reset',
                      onConfirm: () => {
                        const res = resetUploadedQuestions();
                        setConfirmModal(null);
                        onRefreshData();
                        showToast(`Đã xóa ${res.removedQuestions} câu hỏi cũ đã tải lên và cập nhật lại số lượng!`);
                      },
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition"
                >
                  Reset câu hỏi đã upload ({getUploadedQuestionsCount()})
                </button>
              )}
              <button
                onClick={() => handleOpenCreateSubject()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition"
              >
                + Thêm môn học mới
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-bold text-[11px]">
                  <th className="py-2.5 px-3">Mã & Tên môn học</th>
                  <th className="py-2.5 px-3">Tín chỉ / Học kỳ</th>
                  <th className="py-2.5 px-3">Giảng viên phụ trách</th>
                  <th className="py-2.5 px-3 text-center">Số câu hỏi</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {subjects.map((s) => {
                  const realQuestionCount = questions.filter(q => q.subjectId === s.id).length;
                  return (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-blue-700 dark:text-blue-400">[{s.code}]</span>
                        <span>{s.name}</span>
                        {s.isHot && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                            HOT
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            s.subjectType === 'practical'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : s.subjectType === 'project'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {s.subjectType === 'practical'
                            ? 'Thực hành'
                            : s.subjectType === 'project'
                            ? 'Đồ án học phần'
                            : 'Lý thuyết'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 italic line-clamp-1">{s.description}</div>
                    </td>

                    <td className="py-3 px-3 font-mono">
                      {s.credits} TC · HK {s.semester}
                    </td>

                    <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                      {s.assignedLecturerName || (
                        <span className="text-amber-600 italic">Chưa phân công</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center font-mono font-bold text-blue-600">
                      {realQuestionCount} câu
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        [Đang hoạt động]
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditSubject(s)}
                          className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[11px]"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => {
                            setAssigningSubject(s);
                            setSelectedLecturerId(s.assignedLecturerId || lecturers[0]?.id || '');
                            setAssignError(null);
                          }}
                          className="px-2.5 py-1 rounded bg-blue-800 text-white font-semibold text-[11px] hover:bg-blue-900"
                        >
                          Đổi GV
                        </button>
                        <button
                          onClick={() => handleDeleteSubject(s)}
                          className="px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 font-semibold text-[11px]"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3B: THU PHÍ THI THỬ 10K/MÔN & XÁC NHẬN THỦ CÔNG */}
      {activeTab === 'payment' && (() => {
        const studentUsers = users.filter(u => u.role === 'student');
        const filteredOrders = paymentOrders.filter(o =>
          orderStatusFilter === 'all' ? true : o.status === orderStatusFilter
        );

        return (
          <div className="space-y-6">
            {/* Top Grid: Quick Subject Unlock & Manual Bank Account Config */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 cols: Quick Unlock per Subject for Student */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Xác nhận & Mở khóa Nhanh theo Môn (10.000đ/môn)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn sinh viên đã chuyển khoản và đúng môn học để cấp quyền truy cập hệ thống thi thử (đề cương học phần) ngay lập tức (Admin & Giảng viên đều có quyền xác nhận).
                  </p>
                </div>

                <form onSubmit={handleQuickUnlockSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Chọn Sinh viên <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={quickUnlockStudentId}
                      onChange={(e) => setQuickUnlockStudentId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      required
                    >
                      <option value="">-- Chọn tài khoản sinh viên --</option>
                      {studentUsers.map((sv) => (
                        <option key={sv.id} value={sv.id}>
                          {sv.fullName} ({sv.studentCode || sv.username}) · Đã mở {sv.paidSubjectIds?.length || 0} môn
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Chọn Môn học cần mở khóa <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={quickUnlockSubjectId}
                      onChange={(e) => setQuickUnlockSubjectId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      required
                    >
                      <option value="">-- Chọn môn học --</option>
                      {subjects.filter(s => s.subjectType !== 'project').map((sub) => {
                        const selectedStudent = studentUsers.find(s => s.id === quickUnlockStudentId);
                        const already = selectedStudent?.paidSubjectIds?.includes(sub.id);
                        return (
                          <option key={sub.id} value={sub.id}>
                            [{sub.code}] {sub.name} {already ? '✓ (Đã mở)' : '(10.000đ)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isUnlockingSubject}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold transition shadow-xs"
                  >
                    {isUnlockingSubject ? 'Đang xử lý...' : 'Xác nhận đã thu 10.000đ & Mở khóa môn'}
                  </button>
                </form>

                {quickUnlockStudentId && (() => {
                  const sv = studentUsers.find(u => u.id === quickUnlockStudentId);
                  const unlockedIds = sv?.paidSubjectIds || [];
                  return (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        Các môn {sv?.fullName} đã mở khóa ({unlockedIds.length}):
                      </div>
                      {unlockedIds.length === 0 ? (
                        <div className="text-slate-400">Chưa mở khóa môn nào.</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {unlockedIds.map(sid => {
                            const sObj = subjects.find(s => s.id === sid);
                            return (
                              <span
                                key={sid}
                                className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]"
                              >
                                {sObj ? `${sObj.code} - ${sObj.name}` : sid}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Right 7 cols: Bank Account Config (Manual Confirmation Mode) */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                      Thông tin Tài khoản Ngân hàng nhận chuyển khoản
                    </h3>
                    <p className="text-xs text-slate-500">
                      Hệ thống không dùng xác nhận tự động — sinh viên chuyển 10.000đ/môn theo thông tin dưới đây, sau đó Admin hoặc Giảng viên xác nhận mở khóa.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSavePaymentConfigSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Ngân hàng nhận tiền
                    </label>
                    <select
                      value={payBankCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setPayBankCode(code);
                        const found = BANK_LIST.find(b => b.code === code);
                        if (found) setPayBankName(found.name);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      {BANK_LIST.map(b => (
                        <option key={b.code} value={b.code}>
                          {b.code} - {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Số tài khoản nhận tiền
                    </label>
                    <input
                      type="text"
                      value={payAccountNumber}
                      onChange={(e) => setPayAccountNumber(e.target.value)}
                      placeholder="10387719154"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Tên chủ tài khoản (Không dấu)
                    </label>
                    <input
                      type="text"
                      value={payAccountName}
                      onChange={(e) => setPayAccountName(e.target.value)}
                      placeholder="NGUYEN VU XUAN KIEN"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 uppercase text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Lệ phí mỗi môn (VNĐ)
                    </label>
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={payFeeVnd}
                      onChange={(e) => setPayFeeVnd(Number(e.target.value) || 10000)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingPayment}
                      className="px-5 py-2 rounded-xl bg-blue-800 hover:bg-blue-900 text-white font-bold disabled:opacity-60"
                    >
                      {savingPayment ? 'Đang lưu...' : 'Lưu thông tin tài khoản ngân hàng'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Bottom: Payment Orders History & Confirmation Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Danh sách Yêu cầu Chuyển khoản theo Môn ({paymentOrders.length} đơn)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Xác nhận đơn chờ duyệt khi sinh viên chuyển khoản thành công để mở khóa môn học tương ứng
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {[
                    { id: 'all', label: 'Tất cả' },
                    { id: 'pending', label: 'Chờ xác nhận' },
                    { id: 'paid', label: 'Đã mở khóa' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setOrderStatusFilter(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg font-semibold ${
                        orderStatusFilter === tab.id
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={loadingPayment}
                    onClick={() => void loadPaymentData()}
                    className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold"
                  >
                    {loadingPayment ? 'Đang tải...' : 'Làm mới'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-bold text-[11px]">
                      <th className="py-2.5 px-3">Mã đơn</th>
                      <th className="py-2.5 px-3">Sinh viên</th>
                      <th className="py-2.5 px-3">Môn học (10k/môn)</th>
                      <th className="py-2.5 px-3">Số tiền</th>
                      <th className="py-2.5 px-3 text-center">Trạng thái</th>
                      <th className="py-2.5 px-3">Người xác nhận</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredOrders.map((ord) => {
                      const targetStu = users.find(u => u.id === ord.userId) || {
                        id: ord.userId,
                        username: ord.username,
                        email: ord.email,
                        fullName: ord.fullName,
                        studentCode: ord.studentCode,
                        role: 'student' as const,
                        status: 'active' as const,
                        createdAt: ord.createdAt,
                      };
                      const subId = ord.subjectId || subjects[0]?.id || 'sub_dsa';
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
                                onClick={() => handleManualGrantAccess(targetStu, subId, subName, ord.orderCode)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                              >
                                Xác nhận 10k & Mở khóa
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-700">Hoàn tất</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                          Chưa có giao dịch chuyển khoản nào trong mục này.
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

      {/* TAB 4: AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Nhật Ký Hoạt Động & Bảo Mật Hệ Thống (Audit Logs)
              </h3>
              <p className="text-xs text-slate-500">
                Đồng bộ tự động các thao tác đăng ký, đăng nhập từ mọi thiết bị/tab ẩn danh qua Server & Cloud Firestore
                {getLastLogSyncInfo().syncedAt && (
                  <span className="ml-2 text-slate-400">
                    (Cập nhật lúc {new Date(getLastLogSyncInfo().syncedAt!).toLocaleTimeString('vi-VN')})
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="font-mono text-xs text-slate-500 font-bold">{logs.length} sự kiện</span>
              <button
                type="button"
                disabled={isSyncingLogs}
                onClick={async () => {
                  await (onSyncLogs ? onSyncLogs() : syncLogsWithServer());
                  onRefreshData();
                  showToast('Đã đồng bộ Nhật ký Hoạt động mới nhất từ Server & Firestore!');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-800 hover:bg-blue-900 disabled:bg-blue-400 text-white transition"
              >
                {isSyncingLogs ? 'Đang đồng bộ...' : 'Làm mới nhật ký'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-bold text-[11px]">
                  <th className="py-2 px-3">Thời gian</th>
                  <th className="py-2 px-3">Người thực hiện</th>
                  <th className="py-2 px-3">Hành động</th>
                  <th className="py-2 px-3">Chi tiết đối tượng</th>
                  <th className="py-2 px-3 text-right">Địa chỉ IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {logs.map((log, idx) => (
                  <tr key={`${log.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-bold text-slate-800 dark:text-slate-200">
                      {log.userName}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-400">
                      {log.target}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400 text-[11px]">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 0: CREATE STUDENT ACCOUNT */}
      {isCreateStudentOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Thêm Tài Khoản Sinh Viên Mới
                </h3>
                <p className="text-xs text-slate-500">Khoa Công nghệ Thông tin · Tạo trực tiếp tài khoản sinh viên</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateStudentOpen(false)}
                className="text-xs font-bold px-2 py-1 rounded border text-slate-400 hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            {studentModalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                {studentModalError}
              </div>
            )}

            <form onSubmit={handleCreateStudentSubmit} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Họ và tên sinh viên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn An"
                  value={newSvFullName}
                  onChange={(e) => setNewSvFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Mã số sinh viên (MSSV) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: 223148201057"
                    value={newSvCode}
                    onChange={(e) => setNewSvCode(e.target.value.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 25))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Lớp sinh hoạt <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: CNTT1.K23"
                    value={newSvClass}
                    onChange={(e) => setNewSvClass(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Địa chỉ Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="Ví dụ: an@dhhp.edu.vn hoặc an@gmail.com"
                  value={newSvEmail}
                  onChange={(e) => setNewSvEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Mật khẩu khởi tạo
                </label>
                <input
                  type="text"
                  placeholder="Mặc định: 123456"
                  value={newSvPassword}
                  onChange={(e) => setNewSvPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateStudentOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isCreatingStudent}
                  className="px-4 py-2 rounded-lg bg-blue-800 text-white font-bold hover:bg-blue-900 disabled:opacity-50"
                >
                  {isCreatingStudent ? 'Đang tạo...' : 'Tạo Tài Khoản Sinh Viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE LECTURER ACCOUNT */}
      {isCreateLecturerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Cấp Tài Khoản Giảng Viên Mới
                </h3>
                <p className="text-xs text-slate-500">Khoa Công nghệ Thông tin · Quyền Quản trị viên</p>
              </div>
              <button
                onClick={() => setIsCreateLecturerOpen(false)}
                className="text-xs font-bold px-2 py-1 rounded border text-slate-400 hover:text-slate-800"
              >
                Đóng
              </button>
            </div>

            {lecturerModalError && (
              <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold">
                {lecturerModalError}
              </div>
            )}

            <form onSubmit={handleCreateLecturerSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Họ và tên giảng viên *
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: ThS. Hoàng Văn Tuấn"
                    value={newGvFullName}
                    onChange={(e) => setNewGvFullName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Mã giảng viên (4 số) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="\d{4}"
                    placeholder="Ví dụ: 0006"
                    value={newGvCode}
                    onChange={(e) => setNewGvCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    required
                  />
                  <div className={`mt-1 text-[10px] font-mono ${newGvCode.length === 4 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    {newGvCode.length}/4 chữ số
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Tên đăng nhập (Username) *
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: gv_hoangvantuan"
                    value={newGvUsername}
                    onChange={(e) => setNewGvUsername(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Mật khẩu ban đầu *
                  </label>
                  <input
                    type="text"
                    value={newGvPassword}
                    onChange={(e) => setNewGvPassword(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Email liên hệ *
                  </label>
                  <input
                    type="email"
                    placeholder="tuan.hv@dhhp.edu.vn"
                    value={newGvEmail}
                    onChange={(e) => setNewGvEmail(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    placeholder="09xx xxx xxx"
                    value={newGvPhone}
                    onChange={(e) => setNewGvPhone(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Bộ môn công tác *
                </label>
                <input
                  type="text"
                  value={newGvDept}
                  onChange={(e) => setNewGvDept(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Phân công môn học phụ trách ban đầu:
                </label>
                <div className="space-y-1.5 p-2 rounded border border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto">
                  {subjects.map(s => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={newGvSubjects.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewGvSubjects([...newGvSubjects, s.id]);
                          } else {
                            setNewGvSubjects(newGvSubjects.filter(id => id !== s.id));
                          }
                        }}
                        className="rounded border-slate-300"
                      />
                      <span><strong>{s.code}</strong> - {s.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateLecturerOpen(false)}
                  className="px-4 py-1.5 rounded border font-semibold text-slate-600 dark:text-slate-400"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 rounded bg-blue-800 text-white font-bold hover:bg-blue-900"
                >
                  Tạo & Cấp tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT USER INFORMATION & RESET PASSWORD */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Chỉnh Sửa Thông Tin Tài Khoản
                </h3>
                <p className="text-xs text-slate-500 font-mono">ID: {editingUser.id} · {editingUser.role.toUpperCase()}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-xs font-bold px-2 py-1 rounded border text-slate-400 hover:text-slate-800"
              >
                Đóng
              </button>
            </div>

            {editUserError && (
              <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold">
                {editUserError}
              </div>
            )}

            <form onSubmit={handleSaveEditSubmit} className="space-y-3">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Họ và tên *</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Email *</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Số điện thoại</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  {editingUser.role === 'student' ? 'Lớp sinh hoạt' : 'Bộ môn / Đơn vị'}
                </label>
                <input
                  type="text"
                  value={editClassOrDept}
                  onChange={(e) => setEditClassOrDept(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Đặt lại mật khẩu mới (Bỏ trống nếu giữ nguyên):
                </label>
                <input
                  type="password"
                  placeholder="Nhập mật khẩu mới nếu muốn reset"
                  value={resetPassInput}
                  onChange={(e) => setResetPassInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-1.5 rounded border font-semibold text-slate-600 dark:text-slate-400"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 rounded bg-blue-800 text-white font-bold hover:bg-blue-900"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ASSIGN LECTURER TO SUBJECT */}
      {assigningSubject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Phân Công Giảng Viên Phụ Trách
                </h3>
                <p className="text-xs text-blue-700 font-semibold">{assigningSubject.code} - {assigningSubject.name}</p>
              </div>
              <button
                onClick={() => setAssigningSubject(null)}
                className="text-xs font-bold px-2 py-1 rounded border text-slate-400 hover:text-slate-800"
              >
                Đóng
              </button>
            </div>

            {assignError && (
              <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold">
                {assignError}
              </div>
            )}

            <form onSubmit={handleAssignSubjectSubmit} className="space-y-4">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Chọn giảng viên phụ trách học phần:
                </label>
                {lecturers.length === 0 ? (
                  <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                    Chưa có giảng viên nào trong hệ thống. Vui lòng tạo tài khoản giảng viên trước.
                  </div>
                ) : (
                  <select
                    value={selectedLecturerId}
                    onChange={(e) => setSelectedLecturerId(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                  >
                    {lecturers.map(gv => (
                      <option key={gv.id} value={gv.id}>
                        {gv.fullName} ({gv.lecturerCode}) - {gv.department}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="p-3 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-[11px] text-blue-900 dark:text-blue-300">
                Giảng viên được chỉ định sẽ có toàn quyền: Upload đề cương, upload bài giảng, dùng Gemini AI sinh câu hỏi trắc nghiệm và duyệt câu hỏi cho môn học này.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssigningSubject(null)}
                  className="px-4 py-1.5 rounded border font-semibold text-slate-600 dark:text-slate-400"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={lecturers.length === 0}
                  className="px-5 py-1.5 rounded bg-blue-800 disabled:opacity-50 text-white font-bold hover:bg-blue-900"
                >
                  Xác nhận phân công
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE OR EDIT SUBJECT */}
      {isSubjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {editingSubject ? 'Chỉnh Sửa Thông Tin Môn Học' : 'Thêm Môn Học Mới Vào Hệ Thống'}
                </h3>
                <p className="text-xs text-slate-500">Khung chương trình đào tạo Khoa Công nghệ Thông tin</p>
              </div>
              <button
                onClick={() => setIsSubjectModalOpen(false)}
                className="text-xs font-bold px-2 py-1 rounded border text-slate-400 hover:text-slate-800"
              >
                Đóng
              </button>
            </div>

            {subjectModalError && (
              <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold">
                {subjectModalError}
              </div>
            )}

            <form onSubmit={handleSaveSubjectSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Mã học phần *
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: INF4010"
                    value={newSubCode}
                    onChange={(e) => setNewSubCode(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Lĩnh vực chuyên môn
                  </label>
                  <select
                    value={newSubCategory}
                    onChange={(e: any) => setNewSubCategory(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="programming">Lập trình & Giải thuật</option>
                    <option value="systems">Hệ thống & Mạng</option>
                    <option value="software">Kỹ thuật phần mềm</option>
                    <option value="data">Trí tuệ nhân tạo & Dữ liệu</option>
                    <option value="ai">Khoa học máy tính & AI</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Tên môn học (Tiếng Việt) *
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Lập trình Web nâng cao"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Hình thức học phần *
                </label>
                <select
                  value={newSubType}
                  onChange={(e) => setNewSubType(e.target.value as SubjectType)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                >
                  <option value="theory">Học phần Lý thuyết / Trắc nghiệm</option>
                  <option value="practical">Học phần Thực hành</option>
                  <option value="project">Đồ án học phần (Đăng ký & hướng dẫn đề tài)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Tên môn học (Tiếng Anh)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Advanced Web Development"
                  value={newSubNameEn}
                  onChange={(e) => setNewSubNameEn(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 italic"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Số tín chỉ
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={newSubCredits}
                    onChange={(e) => setNewSubCredits(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Học kỳ dự kiến
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={newSubSemester}
                    onChange={(e) => setNewSubSemester(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Giảng viên phụ trách ban đầu
                </label>
                <select
                  value={newSubLecturerId}
                  onChange={(e) => setNewSubLecturerId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="">-- Chưa chỉ định (Có thể chọn sau) --</option>
                  {lecturers.map(gv => (
                    <option key={gv.id} value={gv.id}>
                      {gv.fullName} ({gv.lecturerCode}) - {gv.department}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Mô tả vắn tắt học phần
                </label>
                <textarea
                  rows={3}
                  placeholder="Mục tiêu học phần, chuẩn kiến thức và kỹ năng sinh viên đạt được..."
                  value={newSubDesc}
                  onChange={(e) => setNewSubDesc(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-rose-200 bg-rose-50/70 text-rose-900 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSubIsHot}
                  onChange={(e) => setNewSubIsHot(e.target.checked)}
                  className="rounded border-rose-400"
                />
                <span>Gắn nhãn HOT nổi bật cho môn học này trên toàn hệ thống</span>
              </label>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="px-4 py-1.5 rounded border font-semibold text-slate-600 dark:text-slate-400"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold"
                >
                  {editingSubject ? 'Lưu thay đổi' : 'Thêm môn học'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: CUSTOM CONFIRMATION MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {confirmModal.title}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400"
              >
                Hủy
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
