import {
  User, Subject, Chapter, Question, Exam, ExamAttempt,
  PracticeSession, StudyMaterial, NotificationItem, ActivityLog,
  LearningDocument, AIGeneratedQuestion,
  QuestionReview, AIExplanation, BloomLevel, LecturerSubjectAssignment,
  ProjectTopic, ProjectRegistration, AICodeGradingResult, QuestionUsage,
  PaymentConfig, ExamPaymentOrder
} from '../types';
import {
  INITIAL_USERS, INITIAL_SUBJECTS, INITIAL_CHAPTERS,
  INITIAL_QUESTIONS, INITIAL_EXAMS, INITIAL_EXAM_ATTEMPTS,
  INITIAL_MATERIALS, INITIAL_NOTIFICATIONS, INITIAL_ACTIVITY_LOGS,
  INITIAL_LEARNING_DOCUMENTS, INITIAL_AI_GENERATED_QUESTIONS,
  INITIAL_LECTURER_SUBJECTS, INITIAL_PROJECT_TOPICS, INITIAL_PROJECT_REGISTRATIONS
} from '../data/mockData';
import { extractErrorMessage } from '../utils/errorUtils';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  createActivityLogInFirestore,
  deleteUserFromFirestoreAsAdmin,
  fetchActivityLogsFromFirestoreAsAdmin,
  fetchAllUsersAndDeletedFromFirestoreAsAdmin,
  fetchDeletedUserIdsFromFirestoreAsAdmin,
  fetchOwnUserFromFirestore,
  getCurrentFirebaseUser,
  isFirebaseAdminUser,
  pushActivityLogsToFirestoreAsAdmin,
  pushUsersToFirestoreAsAdmin,
  registerOrUpdateStudentInFirestore,
  syncSingleUserUpdateToFirestoreAsAdmin,
} from './firestoreUserService';
export { extractErrorMessage };

const STORAGE_KEYS = {
  CURRENT_USER: 'it_study_current_user_v2',
  USERS: 'it_study_users_v2',
  SUBJECTS: 'it_study_subjects_v2',
  CHAPTERS: 'it_study_chapters_v2',
  QUESTIONS: 'it_study_questions_v2',
  EXAMS: 'it_study_exams_v2',
  ATTEMPTS: 'it_study_attempts_v2',
  PRACTICE: 'it_study_practice_v2',
  MATERIALS: 'it_study_materials_v2',
  NOTIFICATIONS: 'it_study_notifications_v2',
  LOGS: 'it_study_logs_v2',
  FAVORITES: 'it_study_favorites_v2',
  LEARNING_DOCUMENTS: 'it_study_learning_docs_v2',
  AI_GENERATED_QUESTIONS: 'it_study_ai_questions_v2',
  QUESTION_REVIEWS: 'it_study_question_reviews_v2',
  AI_EXPLANATIONS: 'it_study_ai_explanations_v2',
  LECTURER_SUBJECTS: 'it_study_lecturer_subjects_v2',
  PROJECT_TOPICS: 'it_study_project_topics_v2',
  PROJECT_REGISTRATIONS: 'it_study_project_registrations_v2',
};

const MIGRATION_KEY = 'it_study_migrated_v16';
const LECTURER_SEED_KEY = 'it_study_lecturers_seeded_v4';
const LEGACY_NAMES = ['Nguyễn Văn Kiên', 'ThS. Trần Minh Trí', 'TS. Nguyễn Hoàng Nam', 'ThS. Lê Thị Mai'];
const LEGACY_USERNAMES = ['gv_tranminhtri', 'gv_nguyenhoangnam', 'gv_lethimai'];
const REMOVED_SUBJECT_IDS = new Set(['sub_project_base']);
const REASSIGNED_SUBJECT_IDS = new Set([
  'sub_dsa', 'sub_coa', 'sub_net', 'sub_hardware',
  'sub_algo_intro', 'sub_prog_base', 'sub_prog_adv', 'sub_oop',
  'sub_db_intro', 'sub_ai_intro', 'sub_dbms', 'sub_seo_web',
  'sub_digital_tech', 'sub_tourism_ecom',
]);
const DEFAULT_STUDENT_IDS = new Set(['usr_stu_1', 'usr_stu_2', 'usr_stu_3', 'usr_stu_4', 'usr_stu_5', 'usr_stu_6']);
const DEFAULT_STUDENT_USERNAMES = new Set(['sv2024001', 'sv2024002', 'sv2024003', 'sv2024004', 'sv2024005', 'sv2024006']);

let uniqueIdCounter = 0;
export function makeUniqueId(prefix: string): string {
  uniqueIdCounter += 1;
  return `${prefix}_${Date.now()}_${uniqueIdCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) {
      return fallback;
    }
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function dedupeById<T extends { id: string }>(items: T[]): { list: T[]; changed: boolean } {
  const seen = new Set<string>();
  let changed = false;
  const list: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      changed = true;
      continue;
    }
    if (!item.id || seen.has(item.id)) {
      changed = true;
      continue;
    }
    seen.add(item.id);
    list.push(item);
  }
  return { list, changed };
}

function ensureUniqueItemIds<T extends { id: string }>(items: T[], prefix: string): { list: T[]; changed: boolean } {
  const seen = new Set<string>();
  let changed = false;
  const list: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      changed = true;
      continue;
    }
    if (!item.id || seen.has(item.id)) {
      changed = true;
      const nextId = makeUniqueId(prefix);
      seen.add(nextId);
      list.push({ ...item, id: nextId });
    } else {
      seen.add(item.id);
      list.push(item);
    }
  }
  return { list, changed };
}

function sanitizeStorageKeyIds(storageKey: string, mode: 'dedupe' | 'reassign', prefix = 'item') {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const res = mode === 'reassign'
      ? ensureUniqueItemIds(parsed, prefix)
      : dedupeById(parsed);
    if (res.changed) {
      localStorage.setItem(storageKey, JSON.stringify(res.list));
    }
  } catch {
    // ignore
  }
}
const DEFAULT_STUDENT_CLASS_INDICES: Record<string, number> = {
  usr_stu_1: 0,
  usr_stu_2: 1,
  usr_stu_3: 0,
  usr_stu_4: 2,
  usr_stu_5: 1,
  usr_stu_6: 0,
};

function deriveSiblingClassNames(templateClass: string): [string, string, string] {
  const raw = templateClass.trim();
  if (!raw) return ['CNTT-K18A', 'CNTT-K18B', 'CNTT-K18C'];

  // 1. Số thứ tự lớp đứng trước hậu tố khóa (vd: "CNTT1-K25", "CNTT01-K25", "CNTT2.K25")
  const beforeCohort = raw.match(/^(.*?)(\d+)([-.\s_]+K\d+.*)$/i);
  if (beforeCohort) {
    const [, prefix, numStr, suffix] = beforeCohort;
    const pad = numStr.length > 1 && numStr.startsWith('0') ? numStr.length : 0;
    const fmt = (n: number) => (pad ? String(n).padStart(pad, '0') : String(n));
    return [`${prefix}${fmt(1)}${suffix}`, `${prefix}${fmt(2)}${suffix}`, `${prefix}${fmt(3)}${suffix}`];
  }

  // 2. Kết thúc bằng mã ngành viết tắt chưa có ký tự lớp (vd: "K25CNTT", "K25-CNTT")
  if (/(?:CNTT|KHMT|KTPM|HTTT|MMT|ATTT|ĐTVT|QTKD|IT)$/i.test(raw)) {
    const isLower = raw === raw.toLowerCase();
    const letters = isLower ? ['a', 'b', 'c'] : ['A', 'B', 'C'];
    return [`${raw}${letters[0]}`, `${raw}${letters[1]}`, `${raw}${letters[2]}`];
  }

  // 3. Kết thúc bằng 1 chữ cái phân lớp sau số, dấu phân cách hoặc mã ngành (vd: "K25CNTTE", "CNTT-K25A", "K25CNTT.E")
  const trailingLetter = raw.match(/^(.*?(?:\d|[-.\s_]|CNTT|KHMT|KTPM|HTTT|MMT|ATTT|ĐTVT|QTKD|IT))([A-Za-z])$/i);
  if (trailingLetter) {
    const [, prefix, letter] = trailingLetter;
    const isLower = letter >= 'a' && letter <= 'z';
    const letters = isLower ? ['a', 'b', 'c'] : ['A', 'B', 'C'];
    return [`${prefix}${letters[0]}`, `${prefix}${letters[1]}`, `${prefix}${letters[2]}`];
  }

  // 4. Kết thúc bằng số (phân biệt số lớp như "K25CNTT1", "24IT01" với số khóa như "CNTT-K25")
  const trailingDigits = raw.match(/^(.*?)(\d+)$/);
  if (trailingDigits) {
    const [, prefix, numStr] = trailingDigits;
    const numVal = parseInt(numStr, 10);
    const hasEarlierNumber = /\d/.test(prefix);
    const endsWithSep = /[-.\s_]$/.test(prefix);
    const isCohortOnly = /(?:^|[-.\s_])K$/i.test(prefix);
    if (!isCohortOnly && (hasEarlierNumber || endsWithSep || (numStr.startsWith('0') && numStr.length >= 2) || (numVal >= 1 && numVal <= 12))) {
      const pad = numStr.length > 1 && numStr.startsWith('0') ? numStr.length : 0;
      const fmt = (n: number) => (pad ? String(n).padStart(pad, '0') : String(n));
      return [`${prefix}${fmt(1)}`, `${prefix}${fmt(2)}`, `${prefix}${fmt(3)}`];
    }
    return [`${raw}A`, `${raw}B`, `${raw}C`];
  }

  return [`${raw}A`, `${raw}B`, `${raw}C`];
}

function findReferenceRegisteredStudent(usersList: User[], preferredStudent?: User): User | undefined {
  if (
    preferredStudent &&
    preferredStudent.role === 'student' &&
    !DEFAULT_STUDENT_IDS.has(preferredStudent.id) &&
    preferredStudent.className?.trim()
  ) {
    return preferredStudent;
  }
  const customStudents = usersList.filter(
    u => u.role === 'student' && !DEFAULT_STUDENT_IDS.has(u.id) && u.className && u.className.trim().length > 0
  );
  if (customStudents.length === 0) return undefined;
  const kienMatch = customStudents.find(u => {
    const norm = (u.fullName || '').toLowerCase();
    const emailNorm = (u.email || '').toLowerCase();
    return norm.includes('kiên') || norm.includes('kien') || emailNorm.includes('kien');
  });
  return kienMatch || customStudents[customStudents.length - 1];
}

function syncDefaultStudentClasses(usersList: User[], preferredStudent?: User): { list: User[]; changed: boolean } {
  const refStudent = findReferenceRegisteredStudent(usersList, preferredStudent);
  if (!refStudent || !refStudent.className?.trim()) {
    return { list: usersList, changed: false };
  }
  const siblingClasses = deriveSiblingClassNames(refStudent.className.trim());
  let changed = false;
  const nextList = usersList.map(u => {
    if (u.role === 'student' && DEFAULT_STUDENT_IDS.has(u.id)) {
      const idx = DEFAULT_STUDENT_CLASS_INDICES[u.id] ?? 0;
      const targetClass = siblingClasses[idx] || siblingClasses[0];
      if (u.className !== targetClass) {
        changed = true;
        return { ...u, className: targetClass };
      }
    }
    return u;
  });
  return { list: nextList, changed };
}

// Seed initial data with non-destructive migration to @dhhp.edu.vn, practical/project subjects, and direct material content
export function initializeStorage() {
  const hasMigrated = localStorage.getItem(MIGRATION_KEY) === '1';
  const hasSeededLecturers = localStorage.getItem(LECTURER_SEED_KEY) === '1';

  // 1. Users & @dhhp.edu.vn email migration
  const existingUsersRaw = localStorage.getItem(STORAGE_KEYS.USERS);
  if (!existingUsersRaw) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
  } else {
    try {
      let usersList: User[] = JSON.parse(existingUsersRaw);
      let updated = false;

      usersList = usersList.map(u => {
        let next = u;
        if (u.id === 'usr_admin' || u.username === 'admin') {
          const nextName =
            u.fullName === 'TS. Nguyễn Tùng Sơn' || u.fullName === 'Nguyễn Văn Kiên' || !u.fullName
              ? 'Nguyễn Vũ Xuân Kiên'
              : u.fullName;
          const nextDept =
            u.department === 'Ban Chủ nhiệm Khoa CNTT' || !u.department
              ? 'Khoa Công nghệ Thông tin'
              : u.department;
          const nextPhone = u.phone === '0987654321' ? '0334613184' : u.phone;
          if (nextName !== u.fullName || nextDept !== u.department || nextPhone !== u.phone) {
            next = { ...next, fullName: nextName, department: nextDept, phone: nextPhone };
            updated = true;
          }
        }
        if (next.email && next.email.endsWith('@itstudy.edu.vn')) {
          next = { ...next, email: next.email.replace('@itstudy.edu.vn', '@dhhp.edu.vn') };
          updated = true;
        }
        return next;
      });

      const defaultLecturers = INITIAL_USERS.filter(u => u.role === 'lecturer');
      defaultLecturers.forEach(defLec => {
        const idx = usersList.findIndex(u => u.id === defLec.id);
        if (idx >= 0) {
          if (LEGACY_NAMES.includes(usersList[idx].fullName) || LEGACY_USERNAMES.includes(usersList[idx].username)) {
            usersList[idx] = { ...usersList[idx], ...defLec };
            updated = true;
          } else {
            let lecUpdated = false;
            const nextLec = { ...usersList[idx] };
            if (!hasSeededLecturers && nextLec.fullName !== defLec.fullName && nextLec.fullName.startsWith('ThS. ')) {
              nextLec.fullName = defLec.fullName;
              lecUpdated = true;
            }
            if (!nextLec.lecturerCode || !/^\d{4}$/.test(nextLec.lecturerCode)) {
              nextLec.lecturerCode = defLec.lecturerCode;
              lecUpdated = true;
            }
            if (!hasMigrated && defLec.assignedSubjectIds) {
              const filtered = (nextLec.assignedSubjectIds || []).filter(sid => !REASSIGNED_SUBJECT_IDS.has(sid));
              const merged = Array.from(new Set([...filtered, ...defLec.assignedSubjectIds]));
              const prev = nextLec.assignedSubjectIds || [];
              if (merged.length !== prev.length || merged.some((sid, i) => prev[i] !== sid)) {
                nextLec.assignedSubjectIds = merged;
                lecUpdated = true;
              }
            }
            if (lecUpdated) {
              usersList[idx] = nextLec;
              updated = true;
            }
          }
        } else if (!hasMigrated || !hasSeededLecturers) {
          const hasCollision = usersList.some(
            u =>
              u.username.toLowerCase() === defLec.username.toLowerCase() ||
              (defLec.lecturerCode && u.lecturerCode === defLec.lecturerCode)
          );
          if (!hasCollision) {
            usersList.push(defLec);
            updated = true;
          }
        }
      });

      const beforePurgeCount = usersList.length;
      usersList = usersList.filter(
        u => !DEFAULT_STUDENT_IDS.has(u.id) && !DEFAULT_STUDENT_USERNAMES.has((u.username || '').toLowerCase())
      );
      if (usersList.length !== beforePurgeCount) {
        updated = true;
      }

      if (!hasMigrated) {
        usersList = usersList.map(u => {
          if (u.assignedSubjectIds && u.assignedSubjectIds.some(id => REMOVED_SUBJECT_IDS.has(id))) {
            updated = true;
            return { ...u, assignedSubjectIds: u.assignedSubjectIds.filter(id => !REMOVED_SUBJECT_IDS.has(id)) };
          }
          return u;
        });
      }

      if (updated) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(usersList));
      }
      if (!hasSeededLecturers) {
        localStorage.setItem(LECTURER_SEED_KEY, '1');
      }
    } catch {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
      localStorage.setItem(LECTURER_SEED_KEY, '1');
    }
  }

  // Migrate CURRENT_USER
  const currentRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (currentRaw) {
    try {
      let cur: User = JSON.parse(currentRaw);
      if (DEFAULT_STUDENT_IDS.has(cur.id) || DEFAULT_STUDENT_USERNAMES.has((cur.username || '').toLowerCase())) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      } else {
      let curChanged = false;
      if (cur.id === 'usr_admin' || cur.username === 'admin') {
        if (cur.fullName === 'TS. Nguyễn Tùng Sơn' || cur.fullName === 'Nguyễn Văn Kiên' || !cur.fullName) {
          cur = { ...cur, fullName: 'Nguyễn Vũ Xuân Kiên' };
          curChanged = true;
        }
        if (cur.department === 'Ban Chủ nhiệm Khoa CNTT' || !cur.department) {
          cur = { ...cur, department: 'Khoa Công nghệ Thông tin' };
          curChanged = true;
        }
      }
      if (LEGACY_NAMES.includes(cur.fullName) || LEGACY_USERNAMES.includes(cur.username)) {
        const freshUser = INITIAL_USERS.find(u => u.id === cur.id);
        if (freshUser) {
          cur = { ...cur, ...freshUser };
          curChanged = true;
        }
      }
      if (cur.email && cur.email.endsWith('@itstudy.edu.vn')) {
        cur = { ...cur, email: cur.email.replace('@itstudy.edu.vn', '@dhhp.edu.vn') };
        curChanged = true;
      }
      const freshDefault = INITIAL_USERS.find(u => u.id === cur.id);
      if (freshDefault && cur.role === 'lecturer') {
        if (!cur.lecturerCode || !/^\d{4}$/.test(cur.lecturerCode)) {
          cur = { ...cur, lecturerCode: freshDefault.lecturerCode };
          curChanged = true;
        }
        if (!hasMigrated && freshDefault.assignedSubjectIds) {
          const filtered = (cur.assignedSubjectIds || []).filter(sid => !REASSIGNED_SUBJECT_IDS.has(sid));
          const merged = Array.from(new Set([...filtered, ...freshDefault.assignedSubjectIds]));
          const prev = cur.assignedSubjectIds || [];
          if (merged.length !== prev.length || merged.some((sid, i) => prev[i] !== sid)) {
            cur = { ...cur, assignedSubjectIds: merged };
            curChanged = true;
          }
        }
      }
      if (freshDefault && cur.role === 'student') {
        if (!cur.studentCode || cur.studentCode.length < 12) {
          cur = { ...cur, studentCode: freshDefault.studentCode };
          curChanged = true;
        }
        if (!cur.email || !cur.email.toLowerCase().endsWith('@gmail.com')) {
          cur = { ...cur, email: freshDefault.email };
          curChanged = true;
        }
        try {
          const storedUsers: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
          const syncedUser = storedUsers.find(u => u.id === cur.id);
          if (syncedUser && syncedUser.className && syncedUser.className !== cur.className) {
            cur = { ...cur, className: syncedUser.className };
            curChanged = true;
          }
        } catch {
          // ignore
        }
      }
      if (cur.assignedSubjectIds && cur.assignedSubjectIds.some(id => REMOVED_SUBJECT_IDS.has(id))) {
        cur = { ...cur, assignedSubjectIds: cur.assignedSubjectIds.filter(id => !REMOVED_SUBJECT_IDS.has(id)) };
        curChanged = true;
      }
      if (curChanged) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(cur));
      }
      }
    } catch {
      // ignore
    }
  }

  // 2. Lecturer-Subject assignments
  const existingLsRaw = localStorage.getItem(STORAGE_KEYS.LECTURER_SUBJECTS);
  if (!existingLsRaw) {
    localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(INITIAL_LECTURER_SUBJECTS));
  } else if (!hasMigrated) {
    try {
      let lsList: LecturerSubjectAssignment[] = JSON.parse(existingLsRaw);
      if (lsList.some(item => item.lecturerName && LEGACY_NAMES.includes(item.lecturerName))) {
        lsList = [...INITIAL_LECTURER_SUBJECTS];
      } else {
        lsList = lsList.filter(x => !REMOVED_SUBJECT_IDS.has(x.subjectId) && !REASSIGNED_SUBJECT_IDS.has(x.subjectId));
        INITIAL_LECTURER_SUBJECTS.forEach(initLs => {
          if (!lsList.some(x => x.subjectId === initLs.subjectId)) {
            lsList.push(initLs);
          }
        });
      }
      localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(lsList));
    } catch {
      localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(INITIAL_LECTURER_SUBJECTS));
    }
  }

  // 3. Subjects non-destructive merge + subjectType backfill
  const existingSubsRaw = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
  if (!existingSubsRaw) {
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(INITIAL_SUBJECTS));
  } else {
    try {
      const subsList: Subject[] = JSON.parse(existingSubsRaw);
      let subUpdated = false;
      INITIAL_SUBJECTS.forEach(initSub => {
        const targetIdx = subsList.findIndex(s => s.id === initSub.id);
        if (targetIdx >= 0) {
          if (subsList[targetIdx].assignedLecturerName && LEGACY_NAMES.includes(subsList[targetIdx].assignedLecturerName!)) {
            subsList[targetIdx].assignedLecturerId = initSub.assignedLecturerId;
            subsList[targetIdx].assignedLecturerName = initSub.assignedLecturerName;
            subUpdated = true;
          }
          if (!subsList[targetIdx].subjectType) {
            subsList[targetIdx].subjectType = initSub.subjectType || 'theory';
            subUpdated = true;
          }
          if (initSub.isHot !== undefined && subsList[targetIdx].isHot === undefined) {
            subsList[targetIdx].isHot = initSub.isHot;
            subUpdated = true;
          }
          if (!hasMigrated) {
            if (REASSIGNED_SUBJECT_IDS.has(initSub.id)) {
              if (
                subsList[targetIdx].assignedLecturerId !== initSub.assignedLecturerId ||
                subsList[targetIdx].assignedLecturerName !== initSub.assignedLecturerName
              ) {
                subsList[targetIdx].assignedLecturerId = initSub.assignedLecturerId;
                subsList[targetIdx].assignedLecturerName = initSub.assignedLecturerName;
                subUpdated = true;
              }
            }
            if (subsList[targetIdx].code !== initSub.code) {
              subsList[targetIdx].code = initSub.code;
              subUpdated = true;
            }
            if (['sub_prog_base', 'sub_prog_adv', 'sub_oop'].includes(initSub.id)) {
              subsList[targetIdx].name = initSub.name;
              subsList[targetIdx].description = initSub.description;
              subsList[targetIdx].subjectType = initSub.subjectType;
              subUpdated = true;
            }
            if (initSub.isHot) {
              subsList[targetIdx].isHot = true;
              subUpdated = true;
            }
          }
        } else if (!hasMigrated) {
          subsList.push(initSub);
          subUpdated = true;
        }
      });
      if (!hasMigrated) {
        for (let i = subsList.length - 1; i >= 0; i--) {
          if (REMOVED_SUBJECT_IDS.has(subsList[i].id)) {
            subsList.splice(i, 1);
            subUpdated = true;
          }
        }
        subsList.forEach(s => {
          if (s.code && s.code.startsWith('IT')) {
            s.code = 'INF' + s.code.slice(2);
            subUpdated = true;
          }
        });
      }
      if (subUpdated) {
        localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subsList));
      }
    } catch {
      localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(INITIAL_SUBJECTS));
    }
  }

  // 4. Chapters non-destructive merge
  const existingChRaw = localStorage.getItem(STORAGE_KEYS.CHAPTERS);
  if (!existingChRaw) {
    localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(INITIAL_CHAPTERS));
  } else if (!hasMigrated) {
    try {
      const chList: Chapter[] = JSON.parse(existingChRaw);
      let chUpdated = false;
      INITIAL_CHAPTERS.forEach(initCh => {
        const idx = chList.findIndex(c => c.id === initCh.id);
        if (idx >= 0) {
          if (['ch_pb_1', 'ch_pb_2', 'ch_pb_3', 'ch_pa_1', 'ch_pa_2', 'ch_pa_3', 'ch_oop_1', 'ch_oop_2', 'ch_oop_3'].includes(initCh.id)) {
            chList[idx].title = initCh.title;
            chList[idx].description = initCh.description;
            chUpdated = true;
          }
        } else {
          chList.push(initCh);
          chUpdated = true;
        }
      });
      if (chUpdated) localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chList));
    } catch {
      localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(INITIAL_CHAPTERS));
    }
  }

  // 5. Questions: seed or non-destructively merge missing default questions & backfill questionUsage
  const existingQRaw = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
  if (!existingQRaw) {
    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(INITIAL_QUESTIONS));
  } else if (!hasMigrated) {
    try {
      const qList: Question[] = JSON.parse(existingQRaw);
      let qUpdated = false;
      INITIAL_QUESTIONS.forEach(initQ => {
        const idx = qList.findIndex(q => q.id === initQ.id);
        if (idx >= 0) {
          if (qList[idx].questionUsage !== initQ.questionUsage) {
            qList[idx].questionUsage = initQ.questionUsage;
            qUpdated = true;
          }
        } else {
          qList.push(initQ);
          qUpdated = true;
        }
      });
      if (qUpdated) {
        localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(qList));
      }
    } catch {
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(INITIAL_QUESTIONS));
    }
  }

  // 6. Exams non-destructive merge + remove stale exams referencing deleted subjects or missing questions
  const existingExRaw = localStorage.getItem(STORAGE_KEYS.EXAMS);
  if (!existingExRaw) {
    localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(INITIAL_EXAMS));
  } else if (!hasMigrated) {
    try {
      const mergedQuestions: Question[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.QUESTIONS) || '[]');
      const validQuestionIds = new Set(mergedQuestions.map(q => q.id));
      const initialExamIds = new Set(INITIAL_EXAMS.map(e => e.id));
      let exList: Exam[] = JSON.parse(existingExRaw);
      exList = exList
        .filter(e => !REMOVED_SUBJECT_IDS.has(e.subjectId))
        .filter(e => {
          if (initialExamIds.has(e.id)) return true;
          const remainingIds = (e.questionIds || []).filter(qid => validQuestionIds.has(qid));
          return remainingIds.length > 0;
        })
        .map(e => {
          if (initialExamIds.has(e.id)) return e;
          const remainingIds = (e.questionIds || []).filter(qid => validQuestionIds.has(qid));
          return { ...e, questionIds: remainingIds, totalQuestions: remainingIds.length };
        });

      INITIAL_EXAMS.forEach(initEx => {
        const idx = exList.findIndex(e => e.id === initEx.id);
        if (idx >= 0) {
          if (!exList[idx].examFormat && initEx.examFormat) {
            exList[idx].examFormat = initEx.examFormat;
          }
          if (exList[idx].isOfficialSchoolExam === undefined) {
            exList[idx].isOfficialSchoolExam = initEx.isOfficialSchoolExam ?? true;
          }
          if (exList[idx].totalQuestions !== initEx.totalQuestions) {
            exList[idx].totalQuestions = initEx.totalQuestions;
          }
          if (['exam_pb_prac_01', 'exam_pa_prac_01', 'exam_oop_prac_01'].includes(initEx.id)) {
            exList[idx].title = initEx.title;
            exList[idx].description = initEx.description;
          }
        } else {
          exList.push(initEx);
        }
      });
      localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(exList));
    } catch {
      localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(INITIAL_EXAMS));
    }
  } else {
    try {
      const exList: Exam[] = JSON.parse(existingExRaw);
      let exChanged = false;
      INITIAL_EXAMS.forEach(initEx => {
        const idx = exList.findIndex(e => e.id === initEx.id);
        if (idx >= 0 && exList[idx].totalQuestions !== initEx.totalQuestions) {
          exList[idx].totalQuestions = initEx.totalQuestions;
          exChanged = true;
        }
      });
      if (exChanged) {
        localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(exList));
      }
    } catch {
      // ignore
    }
  }

  // 7. Materials non-destructive merge + direct content backfill
  const existingMatRaw = localStorage.getItem(STORAGE_KEYS.MATERIALS);
  if (!existingMatRaw) {
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(INITIAL_MATERIALS));
  } else if (!hasMigrated) {
    try {
      const matList: StudyMaterial[] = JSON.parse(existingMatRaw);
      let matUpdated = false;
      INITIAL_MATERIALS.forEach(initMat => {
        const idx = matList.findIndex(m => m.id === initMat.id);
        if (idx >= 0) {
          if (!matList[idx].content && initMat.content) {
            matList[idx].content = initMat.content;
            matList[idx].materialCategory = initMat.materialCategory;
            matUpdated = true;
          }
          if (['mat_pb_syl', 'mat_pb_lec', 'mat_pa_syl', 'mat_pa_lec', 'mat_oop_syl', 'mat_oop_lec', 'mat_seo_syl'].includes(initMat.id)) {
            matList[idx].title = initMat.title;
            matList[idx].description = initMat.description;
            matList[idx].content = initMat.content;
            matUpdated = true;
          }
          if (REASSIGNED_SUBJECT_IDS.has(initMat.subjectId) && matList[idx].uploadedBy !== initMat.uploadedBy) {
            matList[idx].uploadedBy = initMat.uploadedBy;
            matUpdated = true;
          }
        } else {
          matList.push(initMat);
          matUpdated = true;
        }
      });
      if (matUpdated) localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(matList));
    } catch {
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(INITIAL_MATERIALS));
    }
  }

  // 8. Project topics & registrations (non-destructive merge)
  const existingTopicsRaw = localStorage.getItem(STORAGE_KEYS.PROJECT_TOPICS);
  if (!existingTopicsRaw) {
    localStorage.setItem(STORAGE_KEYS.PROJECT_TOPICS, JSON.stringify(INITIAL_PROJECT_TOPICS));
  } else if (!hasMigrated) {
    try {
      const topicList: ProjectTopic[] = JSON.parse(existingTopicsRaw);
      let topicUpdated = false;
      INITIAL_PROJECT_TOPICS.forEach(initTopic => {
        if (!topicList.some(t => t.id === initTopic.id)) {
          topicList.push(initTopic);
          topicUpdated = true;
        }
      });
      if (topicUpdated) {
        localStorage.setItem(STORAGE_KEYS.PROJECT_TOPICS, JSON.stringify(topicList));
      }
    } catch {
      localStorage.setItem(STORAGE_KEYS.PROJECT_TOPICS, JSON.stringify(INITIAL_PROJECT_TOPICS));
    }
  }
  if (!localStorage.getItem(STORAGE_KEYS.PROJECT_REGISTRATIONS)) {
    localStorage.setItem(STORAGE_KEYS.PROJECT_REGISTRATIONS, JSON.stringify(INITIAL_PROJECT_REGISTRATIONS));
  }

  const existingAttemptsRaw = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
  if (!existingAttemptsRaw) {
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(INITIAL_EXAM_ATTEMPTS));
  } else {
    try {
      const attemptList: ExamAttempt[] = JSON.parse(existingAttemptsRaw);
      const filteredAttempts = attemptList.filter(a => !DEFAULT_STUDENT_IDS.has(a.studentId));
      if (filteredAttempts.length !== attemptList.length) {
        localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(filteredAttempts));
      }
    } catch {
      localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(INITIAL_EXAM_ATTEMPTS));
    }
  }
  if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(INITIAL_NOTIFICATIONS));
  }
  const existingLogsRaw = localStorage.getItem(STORAGE_KEYS.LOGS);
  if (!existingLogsRaw) {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(INITIAL_ACTIVITY_LOGS));
  } else {
    try {
      const logList: ActivityLog[] = JSON.parse(existingLogsRaw);
      let logUpdated = false;
      const migratedLogs = logList
        .filter(l => {
          if (DEFAULT_STUDENT_IDS.has(l.userId)) {
            logUpdated = true;
            return false;
          }
          return true;
        })
        .map(l => {
          if (l.userName && (l.userName.includes('TS. Nguyễn Tùng Sơn') || l.userName.includes('Nguyễn Văn Kiên'))) {
            logUpdated = true;
            return {
              ...l,
              userName: l.userName
                .replace(/TS\. Nguyễn Tùng Sơn/g, 'Nguyễn Vũ Xuân Kiên')
                .replace(/Nguyễn Văn Kiên/g, 'Nguyễn Vũ Xuân Kiên'),
            };
          }
          return l;
        });
      if (logUpdated) {
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(migratedLogs));
      }
    } catch {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(INITIAL_ACTIVITY_LOGS));
    }
  }
  if (!localStorage.getItem(STORAGE_KEYS.LEARNING_DOCUMENTS)) {
    localStorage.setItem(STORAGE_KEYS.LEARNING_DOCUMENTS, JSON.stringify(INITIAL_LEARNING_DOCUMENTS));
  } else if (!hasMigrated) {
    try {
      const docList: LearningDocument[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEARNING_DOCUMENTS) || '[]');
      let docUpdated = false;
      INITIAL_LEARNING_DOCUMENTS.forEach(initDoc => {
        const idx = docList.findIndex(d => d.id === initDoc.id);
        if (idx >= 0 && REASSIGNED_SUBJECT_IDS.has(initDoc.subjectId)) {
          if (docList[idx].lecturerId !== initDoc.lecturerId || docList[idx].uploadedBy !== initDoc.uploadedBy) {
            docList[idx].lecturerId = initDoc.lecturerId;
            docList[idx].uploadedBy = initDoc.uploadedBy;
            docUpdated = true;
          }
        }
      });
      if (docUpdated) localStorage.setItem(STORAGE_KEYS.LEARNING_DOCUMENTS, JSON.stringify(docList));
    } catch {
      // ignore
    }
  }
  if (!localStorage.getItem(STORAGE_KEYS.AI_GENERATED_QUESTIONS)) {
    localStorage.setItem(STORAGE_KEYS.AI_GENERATED_QUESTIONS, JSON.stringify(INITIAL_AI_GENERATED_QUESTIONS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.FAVORITES)) {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(['q_dsa_01', 'q_net_02']));
  }

  if (!hasMigrated) {
    // Purge any stale chapters/materials/topics/registrations referencing removed subjects
    try {
      const chRaw = localStorage.getItem(STORAGE_KEYS.CHAPTERS);
      if (chRaw) {
        const chs: Chapter[] = JSON.parse(chRaw);
        localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chs.filter(c => !REMOVED_SUBJECT_IDS.has(c.subjectId))));
      }
      const matRaw = localStorage.getItem(STORAGE_KEYS.MATERIALS);
      if (matRaw) {
        const mats: StudyMaterial[] = JSON.parse(matRaw);
        localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(mats.filter(m => !REMOVED_SUBJECT_IDS.has(m.subjectId))));
      }
      const topRaw = localStorage.getItem(STORAGE_KEYS.PROJECT_TOPICS);
      if (topRaw) {
        const tops: ProjectTopic[] = JSON.parse(topRaw);
        localStorage.setItem(STORAGE_KEYS.PROJECT_TOPICS, JSON.stringify(tops.filter(t => !REMOVED_SUBJECT_IDS.has(t.subjectId))));
      }
      const regRaw = localStorage.getItem(STORAGE_KEYS.PROJECT_REGISTRATIONS);
      if (regRaw) {
        const regs: ProjectRegistration[] = JSON.parse(regRaw);
        localStorage.setItem(STORAGE_KEYS.PROJECT_REGISTRATIONS, JSON.stringify(regs.filter(r => !REMOVED_SUBJECT_IDS.has(r.subjectId))));
      }
    } catch {
      // ignore
    }

    recalculateQuestionCounts();
    localStorage.setItem(MIGRATION_KEY, '1');
  }

  // Always guarantee no duplicate IDs exist in any stored collection (prevents React duplicate key errors)
  sanitizeStorageKeyIds(STORAGE_KEYS.LOGS, 'reassign', 'log');
  sanitizeStorageKeyIds(STORAGE_KEYS.ATTEMPTS, 'reassign', 'att');
  sanitizeStorageKeyIds(STORAGE_KEYS.PRACTICE, 'reassign', 'prac');
  sanitizeStorageKeyIds(STORAGE_KEYS.USERS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.LECTURER_SUBJECTS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.SUBJECTS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.CHAPTERS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.QUESTIONS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.EXAMS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.MATERIALS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.PROJECT_TOPICS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.PROJECT_REGISTRATIONS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.NOTIFICATIONS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.LEARNING_DOCUMENTS, 'dedupe');
  sanitizeStorageKeyIds(STORAGE_KEYS.AI_GENERATED_QUESTIONS, 'dedupe');
}

// Ensure initialized on module load
initializeStorage();

// Current User & Auth
export function getCurrentUser(): User | null {
  const users = getUsers();
  const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (raw) {
    try {
      const u: User = JSON.parse(raw);
      const fresh = users.find(x => x.id === u.id);
      if (fresh && fresh.status === 'active') {
        return fresh;
      }
    } catch {
      // invalid stored user
    }
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
  return null;
}

export function setCurrentUser(user: User, options?: { skipLog?: boolean }) {
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  if (!options?.skipLog) {
    addActivityLog('Đổi phiên đăng nhập', `Chuyển sang tài khoản ${user.fullName} (${user.role})`, {
      actor: user,
    });
  }
}

export function logoutUser(): null {
  const cur = getCurrentUser();
  if (cur) {
    addActivityLog('Đăng xuất tài khoản', `${cur.fullName} (${cur.username}) đăng xuất khỏi hệ thống`, {
      actor: cur,
    });
  }
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  return null;
}

class ServerApiError extends Error {
  status: number;
  constructor(message: unknown, status: number) {
    super(extractErrorMessage(message, `Lỗi máy chủ (HTTP ${status}).`));
    this.status = status;
  }
}

const USERS_BROADCAST_CHANNEL = 'it_study_users_sync_v1';
const LOGS_BROADCAST_CHANNEL = 'it_study_logs_sync_v1';

export function broadcastUsersUpdated(source: string = 'sync') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(USERS_BROADCAST_CHANNEL);
      ch.postMessage({ type: 'USERS_UPDATED', source, at: Date.now() });
      ch.close();
    }
  } catch {
    // ignore unsupported BroadcastChannel
  }
}

export function subscribeUsersBroadcast(onUpdate: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const ch = new BroadcastChannel(USERS_BROADCAST_CHANNEL);
    ch.onmessage = (event) => {
      if (event?.data?.type === 'USERS_UPDATED') {
        onUpdate();
      }
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}

export function broadcastLogsUpdated(source: string = 'sync') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(LOGS_BROADCAST_CHANNEL);
      ch.postMessage({ type: 'LOGS_UPDATED', source, at: Date.now() });
      ch.close();
    }
  } catch {
    // ignore unsupported BroadcastChannel
  }
}

export function subscribeLogsBroadcast(onUpdate: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const ch = new BroadcastChannel(LOGS_BROADCAST_CHANNEL);
    ch.onmessage = (event) => {
      if (event?.data?.type === 'LOGS_UPDATED') {
        onUpdate();
      }
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}

async function requestUsersApi<T = any>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const method = (options.method || 'GET').toUpperCase();
    const requestUrl =
      method === 'GET'
        ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`
        : url;

    const res = await fetch(requestUrl, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-store',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (/^(<!doctype|<html)/i.test(trimmed)) {
      throw new ServerApiError(
        `Máy chủ API chưa sẵn sàng (HTTP ${res.status}). Vui lòng tải lại trang hoặc thử lại sau ít giây.`,
        res.status
      );
    }

    let data: any = {};
    if (trimmed) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        throw new ServerApiError(`Phản hồi từ máy chủ không hợp lệ (HTTP ${res.status}).`, res.status);
      }
    }

    if (!res.ok) {
      const msg = extractErrorMessage(data, `Lỗi máy chủ (HTTP ${res.status}).`);
      throw new ServerApiError(msg, res.status);
    }

    return data as T;
  } catch (err) {
    if (err instanceof ServerApiError) {
      throw err;
    }
    throw new ServerApiError(
      extractErrorMessage(err, 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.'),
      0
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function mergeTwoUserRecords(a: User, b: User): User {
  const aUpdated = Date.parse(a.updatedAt || a.lastLogin || '') || 0;
  const bUpdated = Date.parse(b.updatedAt || b.lastLogin || '') || 0;
  const merged: User = bUpdated >= aUpdated ? { ...a, ...b } : { ...b, ...a };

  // Always preserve password and authUid across Firestore <-> Express merges
  if (!merged.password) {
    merged.password = a.password || b.password;
  }
  if (!merged.authUid) {
    merged.authUid = b.authUid || a.authUid;
  }

  // Always keep the newest login & update timestamps
  const aLoginTs = Date.parse(a.lastLogin || '') || 0;
  const bLoginTs = Date.parse(b.lastLogin || '') || 0;
  if (aLoginTs > bLoginTs && a.lastLogin) {
    merged.lastLogin = a.lastLogin;
  } else if (b.lastLogin) {
    merged.lastLogin = b.lastLogin;
  }
  if (aUpdated > bUpdated && a.updatedAt) {
    merged.updatedAt = a.updatedAt;
  } else if (b.updatedAt) {
    merged.updatedAt = b.updatedAt;
  }

  const mergedPaidSubjects = Array.from(
    new Set([
      ...(Array.isArray(a.paidSubjectIds) ? a.paidSubjectIds.map(String) : []),
      ...(Array.isArray(b.paidSubjectIds) ? b.paidSubjectIds.map(String) : []),
    ])
  );
  if (mergedPaidSubjects.length > 0) {
    merged.paidSubjectIds = mergedPaidSubjects;
  }

  if (a.hasPaidExamAccess || b.hasPaidExamAccess || mergedPaidSubjects.length > 0) {
    merged.hasPaidExamAccess = true;
    merged.examAccessPaidAt = b.examAccessPaidAt || a.examAccessPaidAt;
    merged.examAccessOrderCode = b.examAccessOrderCode || a.examAccessOrderCode;
  }

  return merged;
}

export function applySyncedUsersToLocalStorage(serverUsers: User[], deletedIds: string[] = []): User[] {
  const existingLocal = getUsers();
  const deletedSet = new Set(deletedIds || []);
  const mergedMap = new Map<string, User>();

  // 1. Keep all existing non-deleted local users
  for (const localUser of existingLocal) {
    if (!localUser || !localUser.id) continue;
    if (deletedSet.has(localUser.id)) continue;
    if (DEFAULT_STUDENT_IDS.has(localUser.id) || DEFAULT_STUDENT_USERNAMES.has((localUser.username || '').toLowerCase())) {
      continue;
    }
    mergedMap.set(localUser.id, localUser);
  }

  // 2. Safely merge server / Firestore users (including matching students linked across ID vs authUid)
  for (const serverUser of (serverUsers || [])) {
    if (!serverUser || !serverUser.id) continue;
    if (deletedSet.has(serverUser.id)) {
      mergedMap.delete(serverUser.id);
      continue;
    }
    if (DEFAULT_STUDENT_IDS.has(serverUser.id) || DEFAULT_STUDENT_USERNAMES.has((serverUser.username || '').toLowerCase())) {
      continue;
    }

    let matchKey: string | undefined = mergedMap.has(serverUser.id) ? serverUser.id : undefined;
    if (!matchKey && serverUser.role === 'student') {
      for (const [k, candidate] of mergedMap.entries()) {
        if (candidate.role !== 'student') continue;
        const sameAuthUid = serverUser.authUid && candidate.authUid && serverUser.authUid === candidate.authUid;
        const sameEmail = serverUser.email && candidate.email && serverUser.email.toLowerCase() === candidate.email.toLowerCase();
        const sameStuCode = serverUser.studentCode && candidate.studentCode && serverUser.studentCode.toLowerCase() === candidate.studentCode.toLowerCase();
        if (sameAuthUid || sameEmail || sameStuCode) {
          matchKey = k;
          break;
        }
      }
    }

    if (!matchKey) {
      mergedMap.set(serverUser.id, serverUser);
    } else {
      const existingMatch = mergedMap.get(matchKey)!;
      const mergedUser = mergeTwoUserRecords(existingMatch, serverUser);
      if (matchKey !== serverUser.id) {
        mergedMap.delete(matchKey);
      }
      mergedMap.set(serverUser.id, { ...mergedUser, id: serverUser.id });
    }
  }

  const { list: finalUsers } = ensureUniqueItemIds(Array.from(mergedMap.values()), 'usr');
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(finalUsers));

  const current = getCurrentUser();
  if (current) {
    if (deletedSet.has(current.id)) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } else {
      const matched = finalUsers.find(
        u =>
          u.id === current.id ||
          (current.authUid && u.authUid === current.authUid) ||
          (current.email && u.email.toLowerCase() === current.email.toLowerCase())
      );
      if (!matched || matched.status === 'locked') {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      } else {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(matched));
      }
    }
  }

  return finalUsers;
}

export type ServerStorageMode = 'persistent_cloud' | 'persistent_disk' | 'ephemeral_tmp' | 'unknown';
let lastServerStorageMode: ServerStorageMode = 'unknown';
let lastSyncedAtIso: string | null = null;
let lastSyncErrorMsg: string | null = null;
let inFlightUsersSyncPromise: Promise<User[]> | null = null;

export function getServerStorageMode(): ServerStorageMode {
  return lastServerStorageMode;
}

export function getLastUserSyncInfo(): { syncedAt: string | null; error: string | null } {
  return { syncedAt: lastSyncedAtIso, error: lastSyncErrorMsg };
}

function recordServerStorageMode(mode?: unknown) {
  if (mode === 'persistent_cloud' || mode === 'persistent_disk' || mode === 'ephemeral_tmp') {
    lastServerStorageMode = mode;
  }
}

export async function probeServerStorageMode(): Promise<ServerStorageMode> {
  try {
    const res = await requestUsersApi<{ success: boolean; storageMode?: ServerStorageMode }>(
      '/api/system/storage-status',
      { method: 'GET' },
      5000
    );
    recordServerStorageMode(res?.storageMode);
  } catch {
    // ignore probe failure
  }
  return lastServerStorageMode;
}

async function executeSyncUsersWithServer(): Promise<User[]> {
  const fbUser = getCurrentFirebaseUser();
  const isFbAdmin = isFirebaseAdminUser(fbUser);

  let firestoreUsers: User[] = [];
  let firestoreDeletedIds: string[] = [];

  // 1. If Admin is signed into Firebase Google Auth, pull authoritative users & tombstones from Firestore first
  if (isFbAdmin) {
    try {
      const fsData = await fetchAllUsersAndDeletedFromFirestoreAsAdmin();
      firestoreUsers = fsData.users;
      firestoreDeletedIds = fsData.deletedIds;
    } catch (fsErr) {
      console.warn('Firestore pull warning during syncUsersWithServer:', fsErr);
    }
  }

  const localUsers = getUsers();
  // Merge local + Firestore users (excluding deleted tombstones) before syncing with Express API
  const preMergedUsers = firestoreUsers.length > 0 || firestoreDeletedIds.length > 0
    ? applySyncedUsersToLocalStorage(firestoreUsers, firestoreDeletedIds)
    : localUsers;

  let finalUsers = preMergedUsers;
  let combinedDeletedIds = [...firestoreDeletedIds];

  try {
    const res = await requestUsersApi<{
      success: boolean;
      users: User[];
      deletedIds?: string[];
      storageMode?: ServerStorageMode;
    }>(
      '/api/users/sync',
      {
        method: 'POST',
        body: JSON.stringify({ users: preMergedUsers }),
      },
      6000
    );
    recordServerStorageMode(res.storageMode);
    combinedDeletedIds = Array.from(new Set([...(res.deletedIds || []), ...firestoreDeletedIds]));
    finalUsers = applySyncedUsersToLocalStorage(res.users || [], combinedDeletedIds);
    lastSyncedAtIso = new Date().toISOString();
    lastSyncErrorMsg = null;
  } catch (err) {
    lastSyncErrorMsg = extractErrorMessage(err, 'Không thể kết nối máy chủ API.');
    if (!isFbAdmin) {
      throw err;
    }
    lastSyncedAtIso = new Date().toISOString();
  }

  // 2. If Admin is signed into Firebase Google Auth, push any newly discovered server/local users & tombstones up to Firestore
  if (isFbAdmin) {
    try {
      await pushUsersToFirestoreAsAdmin(finalUsers, combinedDeletedIds);
    } catch (fsPushErr) {
      console.warn('Firestore push warning during syncUsersWithServer:', fsPushErr);
    }
  }

  return finalUsers;
}

// Đồng bộ 2 chiều danh sách tài khoản giữa Client <-> Express Server <-> Firebase Firestore
export async function syncUsersWithServer(): Promise<User[]> {
  if (inFlightUsersSyncPromise) {
    return inFlightUsersSyncPromise;
  }
  inFlightUsersSyncPromise = executeSyncUsersWithServer().finally(() => {
    inFlightUsersSyncPromise = null;
  });
  return inFlightUsersSyncPromise;
}

export async function mergeFirestoreSnapshotIntoSystem(
  firestoreUsers: User[],
  removedDocIds: string[] = []
): Promise<User[]> {
  let deletedIds = [...removedDocIds];
  try {
    const fsDeleted = await fetchDeletedUserIdsFromFirestoreAsAdmin();
    deletedIds = Array.from(new Set([...deletedIds, ...fsDeleted]));
  } catch {
    // ignore tombstone fetch warning
  }

  let merged = applySyncedUsersToLocalStorage(firestoreUsers, deletedIds);
  lastSyncedAtIso = new Date().toISOString();
  lastSyncErrorMsg = null;
  broadcastUsersUpdated('firestore_snapshot');

  // Mirror newly appeared Firestore users (e.g. from phone on Vercel) to Express server cleanly
  try {
    const res = await requestUsersApi<{
      success: boolean;
      users: User[];
      deletedIds?: string[];
      storageMode?: ServerStorageMode;
    }>(
      '/api/users/sync',
      {
        method: 'POST',
        body: JSON.stringify({ users: merged }),
      },
      6000
    );
    recordServerStorageMode(res.storageMode);
    const allDeleted = Array.from(new Set([...deletedIds, ...(res.deletedIds || [])]));
    merged = applySyncedUsersToLocalStorage(res.users || [], allDeleted);
  } catch {
    // keep Firestore merged list if API is unreachable
  }

  return merged;
}

export async function fetchUsersFromServer(): Promise<User[]> {
  const res = await requestUsersApi<{
    success: boolean;
    users: User[];
    deletedIds?: string[];
    storageMode?: ServerStorageMode;
  }>(
    '/api/users',
    { method: 'GET' },
    6000
  );
  recordServerStorageMode(res.storageMode);
  lastSyncedAtIso = new Date().toISOString();
  lastSyncErrorMsg = null;
  return applySyncedUsersToLocalStorage(res.users || [], res.deletedIds || []);
}

// Authentication Service (xác thực trực tiếp với máy chủ tập trung, tự động ghi nhận lastLogin & Audit Log IP thật)
export async function loginUser(
  usernameOrEmail: string,
  password?: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  const query = usernameOrEmail.trim().toLowerCase();
  const cleanPassword = password ?? '';

  if (!query) {
    return { success: false, error: 'Vui lòng nhập tên đăng nhập, MSSV hoặc email.' };
  }
  if (!cleanPassword) {
    return { success: false, error: 'Vui lòng nhập mật khẩu tài khoản.' };
  }

  const applyServerLoginSuccess = (serverLogin: {
    user: User;
    users?: User[];
    deletedIds?: string[];
    log?: ActivityLog;
    logs?: ActivityLog[];
    storageMode?: ServerStorageMode;
  }) => {
    recordServerStorageMode(serverLogin?.storageMode);
    if (Array.isArray(serverLogin?.users)) {
      applySyncedUsersToLocalStorage(serverLogin.users, serverLogin.deletedIds || []);
    } else if (serverLogin?.user) {
      applySyncedUsersToLocalStorage([serverLogin.user], serverLogin.deletedIds || []);
    }
    if (Array.isArray(serverLogin?.logs)) {
      applySyncedLogsToLocalStorage(serverLogin.logs);
    } else if (serverLogin?.log) {
      applySyncedLogsToLocalStorage([serverLogin.log]);
    }
    lastSyncedAtIso = new Date().toISOString();
    lastSyncErrorMsg = null;
    const syncedUser = getUsers().find(u => u.id === serverLogin.user.id) || serverLogin.user;
    setCurrentUser(syncedUser, { skipLog: true });
    broadcastUsersUpdated('user_login');

    const fbUser = getCurrentFirebaseUser();
    if (fbUser && fbUser.emailVerified && serverLogin.log) {
      if (isFirebaseAdminUser(fbUser) || serverLogin.log.userRole === 'student') {
        void createActivityLogInFirestore(fbUser, serverLogin.log).catch(() => {});
      }
    }
    return { success: true, user: syncedUser };
  };

  const callServerLogin = async () => {
    const loginLogId = makeUniqueId('log');
    return requestUsersApi<{
      success: boolean;
      user: User;
      users?: User[];
      deletedIds?: string[];
      log?: ActivityLog;
      logs?: ActivityLog[];
      storageMode?: ServerStorageMode;
    }>(
      '/api/users/login',
      {
        method: 'POST',
        body: JSON.stringify({ usernameOrEmail: query, password: cleanPassword, clientLogId: loginLogId }),
      },
      7000
    );
  };

  let shouldTryLocalFallback = false;

  try {
    const serverLogin = await callServerLogin();
    if (serverLogin?.user) {
      return applyServerLoginSuccess(serverLogin);
    }
  } catch (err) {
    if (err instanceof ServerApiError) {
      if (err.status === 401 || err.status === 403 || err.status === 400) {
        return { success: false, error: extractErrorMessage(err, 'Đăng nhập không thành công.') };
      }

      if (err.status === 404) {
        // Check if this browser holds a local account after a serverless /tmp cold-start
        const localBeforeSync = getUsers().find(
          u =>
            u.username.toLowerCase() === query ||
            u.email.toLowerCase() === query ||
            (u.studentCode && u.studentCode.toLowerCase() === query)
        );
        try {
          await syncUsersWithServer();
        } catch {
          // ignore sync warning
        }
        const localAfterSync = getUsers().find(
          u =>
            u.username.toLowerCase() === query ||
            u.email.toLowerCase() === query ||
            (u.studentCode && u.studentCode.toLowerCase() === query)
        );
        if (localBeforeSync && localAfterSync) {
          try {
            const retryRes = await callServerLogin();
            if (retryRes?.user) {
              return applyServerLoginSuccess(retryRes);
            }
          } catch (retryErr) {
            if (retryErr instanceof ServerApiError && retryErr.status >= 400 && retryErr.status < 500) {
              return { success: false, error: extractErrorMessage(retryErr, 'Đăng nhập không thành công.') };
            }
            shouldTryLocalFallback = true;
          }
        }
        if (!shouldTryLocalFallback) {
          return {
            success: false,
            error: extractErrorMessage(err, 'Tên đăng nhập, MSSV hoặc email không tồn tại trong hệ thống.'),
          };
        }
      } else {
        // Network error (status 0) or transient 5xx
        shouldTryLocalFallback = true;
      }
    } else {
      shouldTryLocalFallback = true;
    }
  }

  if (!shouldTryLocalFallback) {
    return { success: false, error: 'Đăng nhập không thành công. Vui lòng thử lại.' };
  }

  // Offline / transient network fallback using cached localStorage
  const users = getUsers();
  const user = users.find(
    u =>
      u.username.toLowerCase() === query ||
      u.email.toLowerCase() === query ||
      (u.studentCode && u.studentCode.toLowerCase() === query)
  );

  if (!user) {
    return { success: false, error: 'Không thể kết nối máy chủ và chưa tìm thấy tài khoản trong bộ nhớ thiết bị.' };
  }

  if (user.status === 'locked') {
    return { success: false, error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên Khoa CNTT.' };
  }

  if (!user.password) {
    return {
      success: false,
      error: 'Tài khoản này chưa được thiết lập mật khẩu đăng nhập. Vui lòng liên hệ Quản trị viên Khoa CNTT để đặt lại mật khẩu.',
    };
  }

  if (user.password !== cleanPassword) {
    return { success: false, error: 'Mật khẩu không chính xác. Vui lòng thử lại.' };
  }

  const now = new Date().toISOString();
  const updatedUser: User = { ...user, lastLogin: now, updatedAt: now };
  let updatedList = users.map(u => (u.id === user.id ? updatedUser : u));
  if (updatedUser.role === 'student' && !DEFAULT_STUDENT_IDS.has(updatedUser.id) && updatedUser.className?.trim()) {
    updatedList = syncDefaultStudentClasses(updatedList, updatedUser).list;
  }
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedList));
  setCurrentUser(updatedUser, { skipLog: true });
  broadcastUsersUpdated('user_login_offline');
  addActivityLog('Đăng nhập thành công', `${user.fullName} đăng nhập với vai trò [${user.role.toUpperCase()}]`, {
    actor: updatedUser,
  });

  void requestUsersApi(`/api/users/${encodeURIComponent(updatedUser.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ lastLogin: now, updatedAt: now, skipServerLog: true, userSnapshot: updatedUser }),
  }).catch(() => {});

  return { success: true, user: updatedUser };
}

// Đăng nhập / Đăng ký qua Google (Firebase Auth + Cloud Firestore)
export async function authenticateWithGoogleFirebase(
  fbUser: FirebaseUser,
  extraProfile?: {
    fullName?: string;
    studentCode: string;
    className: string;
    phone?: string;
    major?: string;
  }
): Promise<{
  success: boolean;
  user?: User;
  needsProfileCompletion?: boolean;
  error?: string;
}> {
  if (!fbUser || !fbUser.email || !fbUser.emailVerified) {
    return { success: false, error: 'Tài khoản Google chưa xác thực email.' };
  }

  const cleanEmail = fbUser.email.trim().toLowerCase();

  try {
    await fetchUsersFromServer();
  } catch {
    // Continue using Firestore & local cache
  }

  // 1. Bootstrapped Admin Google login (nguyenvxkien@gmail.com)
  if (isFirebaseAdminUser(fbUser)) {
    const users = getUsers();
    const adminUser =
      users.find((u) => u.id === 'usr_admin' || u.role === 'admin') ||
      INITIAL_USERS.find((u) => u.id === 'usr_admin')!;
    const now = new Date().toISOString();
    const updatedAdmin: User = {
      ...adminUser,
      authUid: fbUser.uid,
      lastLogin: now,
    };
    const nextList = users.some((u) => u.id === updatedAdmin.id)
      ? users.map((u) => (u.id === updatedAdmin.id ? updatedAdmin : u))
      : [updatedAdmin, ...users];
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(nextList));
    setCurrentUser(updatedAdmin, { skipLog: true });
    broadcastUsersUpdated('google_admin_login');
    addActivityLog(
      'Đăng nhập Admin qua Google Firebase',
      `${updatedAdmin.fullName} (${cleanEmail}) kết nối phiên Quản trị Cloud Firestore`,
      { actor: updatedAdmin }
    );

    try {
      await syncUsersWithServer();
    } catch {
      // ignore if offline
    }

    return { success: true, user: updatedAdmin };
  }

  // 2. Check existing user in Firestore or local/server users
  let fsExisting: User | null = null;
  try {
    fsExisting = await fetchOwnUserFromFirestore(fbUser);
  } catch (err) {
    console.warn('Firestore own-profile lookup warning:', err);
  }

  const users = getUsers();
  const matched =
    fsExisting ||
    users.find(
      (u) =>
        (u.authUid && u.authUid === fbUser.uid) ||
        u.email.toLowerCase() === cleanEmail
    );

  if (matched) {
    if (matched.status === 'locked') {
      return {
        success: false,
        error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên Khoa CNTT.',
      };
    }

    const now = new Date().toISOString();
    let finalUser: User = {
      ...matched,
      authUid: fbUser.uid,
      lastLogin: now,
      updatedAt: now,
    };

    // Ensure Firestore doc exists for cross-device sync
    try {
      const fsSaved = await registerOrUpdateStudentInFirestore(fbUser, finalUser);
      finalUser = {
        ...finalUser,
        ...fsSaved,
        // Keep Express internal ID if matched already existed on Express under a non-UID ID
        id: matched.id || fsSaved.id,
        password: matched.password,
      };
    } catch (err) {
      console.warn('Firestore student login sync warning:', err);
    }

    try {
      const serverRes = await requestUsersApi<{
        success: boolean;
        users: User[];
        deletedIds?: string[];
        storageMode?: ServerStorageMode;
      }>(
        '/api/users/sync',
        {
          method: 'POST',
          body: JSON.stringify({ users: [finalUser] }),
        },
        6000
      );
      recordServerStorageMode(serverRes?.storageMode);
      applySyncedUsersToLocalStorage(serverRes?.users || [finalUser], serverRes?.deletedIds || []);
    } catch {
      applySyncedUsersToLocalStorage([finalUser]);
    }

    setCurrentUser(finalUser, { skipLog: true });
    broadcastUsersUpdated('google_student_login');
    addActivityLog(
      'Đăng nhập bằng Google Firebase',
      `${finalUser.fullName} (${finalUser.studentCode || finalUser.username}) đăng nhập qua Cloud Firestore`,
      { actor: finalUser }
    );
    return { success: true, user: finalUser };
  }

  // 3. New student registering via Google Firebase Auth
  if (!extraProfile || !extraProfile.studentCode.trim() || !extraProfile.className.trim()) {
    return { success: false, needsProfileCompletion: true };
  }

  const cleanCode = extraProfile.studentCode.trim();
  if (!/^[a-zA-Z0-9_\-.]{4,25}$/.test(cleanCode)) {
    return {
      success: false,
      error: 'Mã số sinh viên (MSSV) hợp lệ cần từ 4 đến 25 ký tự chữ hoặc số (ví dụ: 223148201057).',
    };
  }
  const cleanClassName = extraProfile.className.trim();
  if (cleanClassName.length < 2) {
    return { success: false, error: 'Vui lòng nhập tên lớp sinh hoạt hợp lệ (ví dụ: K25CNTTE).' };
  }
  if (
    users.some(
      (u) =>
        (u.studentCode && u.studentCode.toUpperCase() === cleanCode.toUpperCase()) ||
        u.username.toLowerCase() === cleanCode.toLowerCase()
    )
  ) {
    return { success: false, error: `Mã sinh viên "${cleanCode}" đã tồn tại trong hệ thống.` };
  }

  const now = new Date().toISOString();
  const safeId = fbUser.uid.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  let createdStudent: User = {
    id: safeId,
    authUid: fbUser.uid,
    username: cleanCode.toLowerCase(),
    email: cleanEmail,
    fullName: (extraProfile.fullName || fbUser.displayName || cleanCode).trim(),
    role: 'student',
    phone: extraProfile.phone?.trim() || '',
    className: cleanClassName,
    major: (extraProfile.major || 'Công nghệ Thông tin').trim() || 'Công nghệ Thông tin',
    status: 'active',
    studentCode: cleanCode,
    createdAt: now,
    lastLogin: now,
    updatedAt: now,
    paidSubjectIds: [],
    hasPaidExamAccess: false,
  };

  // Write to Cloud Firestore first (verified user can create their own doc under firestore.rules)
  const fsUser = await registerOrUpdateStudentInFirestore(fbUser, createdStudent);
  createdStudent = { ...createdStudent, ...fsUser };

  // Also mirror onto Express server so both server & Firestore stay identical
  try {
    const serverRes = await requestUsersApi<{
      success: boolean;
      user: User;
      users: User[];
      storageMode?: ServerStorageMode;
    }>('/api/users/register', {
      method: 'POST',
      body: JSON.stringify({
        user: {
          ...createdStudent,
          password: `fb_${fbUser.uid.slice(0, 12)}`,
        },
        skipServerLog: true,
      }),
    });
    recordServerStorageMode(serverRes?.storageMode);
    if (Array.isArray(serverRes?.users)) {
      applySyncedUsersToLocalStorage(serverRes.users);
    } else {
      applySyncedUsersToLocalStorage([...users, createdStudent]);
    }
  } catch {
    try {
      const syncRes = await requestUsersApi<{
        success: boolean;
        users: User[];
        deletedIds?: string[];
        storageMode?: ServerStorageMode;
      }>(
        '/api/users/sync',
        {
          method: 'POST',
          body: JSON.stringify({
            users: [{ ...createdStudent, password: `fb_${fbUser.uid.slice(0, 12)}` }],
          }),
        },
        6000
      );
      recordServerStorageMode(syncRes?.storageMode);
      applySyncedUsersToLocalStorage(syncRes?.users || [...users, createdStudent], syncRes?.deletedIds || []);
    } catch {
      applySyncedUsersToLocalStorage([...users, createdStudent]);
    }
  }

  setCurrentUser(createdStudent, { skipLog: true });
  broadcastUsersUpdated('google_student_register');
  addActivityLog(
    'Sinh viên đăng ký qua Google Firebase',
    `Sinh viên ${createdStudent.fullName} (${createdStudent.studentCode}) - Lớp ${createdStudent.className}`,
    { actor: createdStudent }
  );
  return { success: true, user: createdStudent };
}

// Student Registration (Strictly role = 'student', lưu trực tiếp lên máy chủ & đồng bộ Firestore nếu có)
export async function registerStudent(
  studentData: {
    fullName: string;
    studentCode: string;
    email: string;
    phone?: string;
    className: string;
    major: string;
    password: string;
  },
  options: { autoLogin?: boolean } = {}
): Promise<User> {
  try {
    await fetchUsersFromServer();
  } catch {
    // Continue even if initial fetch fails
  }

  const users = getUsers();
  const cleanFullName = studentData.fullName.trim();
  const cleanClassName = studentData.className.trim();
  const cleanEmail = studentData.email.trim().toLowerCase();
  const cleanCode = studentData.studentCode.trim();

  if (cleanFullName.length < 2) {
    throw new Error('Vui lòng nhập đầy đủ họ và tên sinh viên.');
  }
  if (cleanClassName.length < 2) {
    throw new Error('Vui lòng nhập tên lớp sinh hoạt hợp lệ (ví dụ: K25CNTTE).');
  }

  // Validate MSSV (alphanumeric, 4 to 25 chars)
  if (!/^[a-zA-Z0-9_\-.]{4,25}$/.test(cleanCode)) {
    throw new Error('Mã số sinh viên (MSSV) hợp lệ cần từ 4 đến 25 ký tự chữ hoặc số (ví dụ: 223148201057 hoặc 24IT001).');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Địa chỉ email không đúng định dạng hợp lệ.');
  }

  // Check email uniqueness
  if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
    throw new Error('Địa chỉ email này đã được đăng ký trong hệ thống.');
  }

  // Check studentCode / username uniqueness
  if (
    users.some(
      u =>
        (u.studentCode && u.studentCode.toUpperCase() === cleanCode.toUpperCase()) ||
        u.username.toLowerCase() === cleanCode.toLowerCase()
    )
  ) {
    throw new Error(`Mã sinh viên "${cleanCode}" đã tồn tại trong hệ thống.`);
  }

  if (!studentData.password || studentData.password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự để đảm bảo an toàn.');
  }

  const now = new Date().toISOString();
  let newStudent: User = {
    id: makeUniqueId('usr_stu'),
    username: cleanCode.toLowerCase(),
    email: cleanEmail,
    password: studentData.password,
    fullName: cleanFullName,
    role: 'student', // BẮT BUỘC role = student, tuyệt đối không nhận role từ client
    phone: studentData.phone?.trim() || '',
    className: cleanClassName,
    major: studentData.major.trim() || 'Công nghệ Thông tin',
    status: 'active',
    studentCode: cleanCode,
    createdAt: now,
    lastLogin: now,
    updatedAt: now,
    paidSubjectIds: [],
    hasPaidExamAccess: false,
  };

  let persistedToServer = false;
  let serverError: ServerApiError | null = null;
  const regLogId = makeUniqueId('log');

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const serverRes = await requestUsersApi<{
        success: boolean;
        user: User;
        users: User[];
        deletedIds?: string[];
        log?: ActivityLog;
        logs?: ActivityLog[];
        storageMode?: ServerStorageMode;
      }>(
        '/api/users/register',
        {
          method: 'POST',
          body: JSON.stringify({ user: newStudent, clientLogId: regLogId }),
        }
      );
      recordServerStorageMode(serverRes?.storageMode);
      if (serverRes?.user) {
        newStudent = serverRes.user;
      }
      if (Array.isArray(serverRes?.users)) {
        applySyncedUsersToLocalStorage(serverRes.users, serverRes?.deletedIds || []);
      } else {
        applySyncedUsersToLocalStorage([...users, newStudent], serverRes?.deletedIds || []);
      }
      if (Array.isArray(serverRes?.logs)) {
        applySyncedLogsToLocalStorage(serverRes.logs);
      } else if (serverRes?.log) {
        applySyncedLogsToLocalStorage([serverRes.log]);
      }
      persistedToServer = true;
      lastSyncedAtIso = new Date().toISOString();
      lastSyncErrorMsg = null;
      break;
    } catch (err) {
      if (err instanceof ServerApiError && err.status >= 400 && err.status < 500 && err.status !== 404) {
        throw new Error(extractErrorMessage(err, 'Thông tin đăng ký không hợp lệ.'));
      }
      serverError = err instanceof ServerApiError ? err : new ServerApiError(err, 0);
      const isTransient = serverError.status === 0 || serverError.status === 502 || serverError.status === 503 || serverError.status === 504;
      if (isTransient && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
    }
  }

  // If authenticated with Firebase (Admin creating or verified Google user), also mirror to Firestore
  const fbUser = getCurrentFirebaseUser();
  let persistedToFirestore = false;
  if (fbUser && isFirebaseAdminUser(fbUser)) {
    try {
      await syncSingleUserUpdateToFirestoreAsAdmin(newStudent);
      persistedToFirestore = true;
    } catch {
      // ignore if Firestore unreachable
    }
  } else if (fbUser && fbUser.emailVerified && !isFirebaseAdminUser(fbUser) && options.autoLogin !== false) {
    try {
      const savedFs = await registerOrUpdateStudentInFirestore(fbUser, newStudent);
      newStudent = { ...newStudent, ...savedFs, password: studentData.password };
      persistedToFirestore = true;
    } catch {
      // ignore if Firestore fails
    }
  }

  if (!persistedToServer && !persistedToFirestore) {
    throw new Error(
      serverError?.message ||
        'Không thể kết nối đến máy chủ hoặc Firebase để lưu tài khoản. Vui lòng kiểm tra kết nối mạng và thử lại.'
    );
  }

  if (!persistedToServer) {
    applySyncedUsersToLocalStorage([...users, newStudent]);
  }

  if (options.autoLogin !== false) {
    setCurrentUser(newStudent, { skipLog: true });
  }
  broadcastUsersUpdated('student_register');
  if (!persistedToServer) {
    addActivityLog(
      'Sinh viên tự đăng ký',
      `Sinh viên ${newStudent.fullName} (${newStudent.studentCode}) - Lớp ${newStudent.className}`,
      { id: regLogId, actor: newStudent }
    );
  } else if (fbUser && fbUser.emailVerified) {
    const serverCreatedLog = getActivityLogs().find(l => l.id === regLogId);
    if (serverCreatedLog) {
      void createActivityLogInFirestore(fbUser, serverCreatedLog).catch(() => {});
    }
  }

  return newStudent;
}

// Admin: Create Lecturer Account
export async function createLecturerUser(lecturerData: {
  username: string;
  fullName: string;
  lecturerCode: string;
  email: string;
  phone: string;
  department: string;
  password: string;
  assignedSubjectIds?: string[];
}): Promise<User> {
  const users = getUsers();
  const cleanUsername = lecturerData.username.trim().toLowerCase();
  const cleanEmail = lecturerData.email.trim().toLowerCase();
  const cleanCode = lecturerData.lecturerCode.trim();

  if (!/^\d{4}$/.test(cleanCode)) {
    throw new Error('Mã giảng viên (ID giảng viên) bắt buộc phải gồm đúng 4 chữ số (ví dụ: 0006).');
  }
  if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
    throw new Error(`Tên đăng nhập "${cleanUsername}" đã được sử dụng.`);
  }
  if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
    throw new Error(`Email "${cleanEmail}" đã được sử dụng trong hệ thống.`);
  }
  if (users.some(u => u.lecturerCode && u.lecturerCode.toUpperCase() === cleanCode.toUpperCase())) {
    throw new Error(`Mã giảng viên "${cleanCode}" đã tồn tại.`);
  }

  const now = new Date().toISOString();
  let newLecturer: User = {
    id: makeUniqueId('usr_lecturer'),
    username: cleanUsername,
    email: cleanEmail,
    password: lecturerData.password,
    fullName: lecturerData.fullName.trim(),
    role: 'lecturer',
    phone: lecturerData.phone.trim(),
    department: lecturerData.department.trim() || 'Khoa Công nghệ Thông tin',
    lecturerCode: cleanCode,
    status: 'active',
    createdAt: now,
    lastLogin: now,
    updatedAt: now,
    assignedSubjectIds: lecturerData.assignedSubjectIds || [],
  };

  try {
    const serverRes = await requestUsersApi<{
      success: boolean;
      user: User;
      users: User[];
      storageMode?: ServerStorageMode;
    }>(
      '/api/users',
      {
        method: 'POST',
        body: JSON.stringify({ user: newLecturer, skipServerLog: true }),
      }
    );
    recordServerStorageMode(serverRes?.storageMode);
    if (serverRes?.user) {
      newLecturer = serverRes.user;
    }
    if (Array.isArray(serverRes?.users)) {
      applySyncedUsersToLocalStorage(serverRes.users);
    } else {
      applySyncedUsersToLocalStorage([...users, newLecturer]);
    }
  } catch (err) {
    if (err instanceof ServerApiError) {
      throw err;
    }
    applySyncedUsersToLocalStorage([...users, newLecturer]);
  }

  // If subjects were assigned, sync lecturer_subjects table & clear previous owners
  if (lecturerData.assignedSubjectIds && lecturerData.assignedSubjectIds.length > 0) {
    const assignedSet = new Set(lecturerData.assignedSubjectIds);
    const syncedUsers = getUsers().map(u => {
      if (u.id !== newLecturer.id && u.role === 'lecturer' && u.assignedSubjectIds) {
        return { ...u, assignedSubjectIds: u.assignedSubjectIds.filter(id => !assignedSet.has(id)) };
      }
      return u;
    });
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(syncedUsers));

    let assignments = getLecturerSubjects().filter(a => !assignedSet.has(a.subjectId));
    lecturerData.assignedSubjectIds.forEach(subId => {
      assignments.push({
        id: makeUniqueId('ls'),
        lecturerId: newLecturer.id,
        lecturerName: newLecturer.fullName,
        subjectId: subId,
        assignedAt: now.split('T')[0],
      });
      updateSubjectAssignedLecturer(subId, newLecturer.id, newLecturer.fullName);
    });
    localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(assignments));
  }

  if (isFirebaseAdminUser(getCurrentFirebaseUser())) {
    void syncSingleUserUpdateToFirestoreAsAdmin(newLecturer).catch(() => {});
  }
  broadcastUsersUpdated('create_lecturer');
  addActivityLog('Admin cấp tài khoản giảng viên', `${newLecturer.fullName} (${newLecturer.lecturerCode}) - ${newLecturer.department}`);
  return newLecturer;
}

// User Profile Management
export async function updateUserProfile(userId: string, data: {
  fullName?: string;
  email?: string;
  phone?: string;
  className?: string;
  department?: string;
}): Promise<User> {
  const users = getUsers();
  const target = users.find(u => u.id === userId);
  if (!target) throw new Error('Không tìm thấy tài khoản người dùng.');

  // Validate email if changed
  if (data.email) {
    const cleanNewEmail = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanNewEmail)) {
      throw new Error('Địa chỉ email không đúng định dạng hợp lệ.');
    }
    if (cleanNewEmail !== target.email.toLowerCase()) {
      if (users.some(u => u.id !== userId && u.email.toLowerCase() === cleanNewEmail)) {
        throw new Error('Email này đã được sử dụng bởi một tài khoản khác.');
      }
    }
  }

  const now = new Date().toISOString();
  const payload = {
    fullName: data.fullName ? data.fullName.trim() : target.fullName,
    email: data.email ? data.email.trim().toLowerCase() : target.email,
    phone: data.phone !== undefined ? data.phone.trim() : target.phone,
    className: data.className !== undefined ? data.className.trim() : target.className,
    department: data.department !== undefined ? data.department.trim() : target.department,
    updatedAt: now,
  };

  let updated: User = { ...target, ...payload };

  try {
    const serverRes = await requestUsersApi<{
      success: boolean;
      user: User;
      users: User[];
      storageMode?: ServerStorageMode;
    }>(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ ...payload, skipServerLog: true, userSnapshot: updated }),
      }
    );
    recordServerStorageMode(serverRes?.storageMode);
    if (serverRes?.user) {
      updated = serverRes.user;
    }
    if (Array.isArray(serverRes?.users)) {
      applySyncedUsersToLocalStorage(serverRes.users);
    } else {
      applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
    }
  } catch (err) {
    if (err instanceof ServerApiError && err.status !== 404) {
      throw err;
    }
    applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
  }

  // If current logged-in user, refresh session
  const current = getCurrentUser();
  if (current && current.id === userId) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updated));
  }

  const fbUser = getCurrentFirebaseUser();
  if (isFirebaseAdminUser(fbUser)) {
    void syncSingleUserUpdateToFirestoreAsAdmin(updated).catch(() => {});
  } else if (fbUser && fbUser.emailVerified && updated.authUid === fbUser.uid) {
    void registerOrUpdateStudentInFirestore(fbUser, updated).catch(() => {});
  }
  broadcastUsersUpdated('update_profile');
  addActivityLog('Cập nhật thông tin tài khoản', `Người dùng ${updated.fullName} cập nhật hồ sơ`);
  return updated;
}

// Change Password
export async function changeUserPassword(userId: string, oldPass: string, newPass: string): Promise<void> {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) throw new Error('Không tìm thấy tài khoản.');

  if (user.password && user.password !== oldPass) {
    throw new Error('Mật khẩu hiện tại không đúng.');
  }

  if (!newPass || newPass.length < 6) {
    throw new Error('Mật khẩu mới phải có độ dài ít nhất 6 ký tự.');
  }

  const now = new Date().toISOString();
  let updated: User = { ...user, password: newPass, updatedAt: now };

  try {
    const serverRes = await requestUsersApi<{
      success: boolean;
      user: User;
      users: User[];
      storageMode?: ServerStorageMode;
    }>(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ password: newPass, updatedAt: now, userSnapshot: updated }),
      }
    );
    recordServerStorageMode(serverRes?.storageMode);
    if (serverRes?.user) updated = serverRes.user;
    if (Array.isArray(serverRes?.users)) {
      applySyncedUsersToLocalStorage(serverRes.users);
    } else {
      applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
    }
  } catch (err) {
    if (err instanceof ServerApiError && err.status !== 404) {
      throw err;
    }
    applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
  }

  const current = getCurrentUser();
  if (current && current.id === userId) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updated));
  }

  broadcastUsersUpdated('change_password');
  addActivityLog('Đổi mật khẩu', `Tài khoản ${user.username} đã thay đổi mật khẩu`);
}

// Admin: Reset Password
export async function resetUserPassword(userId: string, newPass: string): Promise<void> {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) throw new Error('Không tìm thấy tài khoản.');

  const now = new Date().toISOString();
  const updated: User = { ...user, password: newPass, updatedAt: now };

  try {
    const serverRes = await requestUsersApi<{
      success: boolean;
      users: User[];
      storageMode?: ServerStorageMode;
    }>(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ password: newPass, updatedAt: now, skipServerLog: true, userSnapshot: updated }),
      }
    );
    recordServerStorageMode(serverRes?.storageMode);
    if (Array.isArray(serverRes?.users)) {
      applySyncedUsersToLocalStorage(serverRes.users);
    } else {
      applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
    }
  } catch (err) {
    if (err instanceof ServerApiError && err.status !== 404) {
      throw err;
    }
    applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
  }

  if (isFirebaseAdminUser(getCurrentFirebaseUser())) {
    void syncSingleUserUpdateToFirestoreAsAdmin(updated).catch(() => {});
  }
  broadcastUsersUpdated('reset_password');
  addActivityLog('Admin đặt lại mật khẩu', `Đặt lại mật khẩu cho tài khoản ${user.fullName} (${user.username})`);
}

// Admin: Toggle User Status (Lock/Unlock)
export async function toggleUserStatus(userId: string): Promise<'active' | 'locked'> {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) throw new Error('Không tìm thấy tài khoản.');

  if (user.role === 'admin' && user.id === 'usr_admin') {
    throw new Error('Không thể khóa tài khoản Quản trị viên tối cao.');
  }

  const newStatus: 'active' | 'locked' = user.status === 'active' ? 'locked' : 'active';
  const now = new Date().toISOString();
  const updated: User = { ...user, status: newStatus, updatedAt: now };

  try {
    const serverRes = await requestUsersApi<{
      success: boolean;
      users: User[];
      storageMode?: ServerStorageMode;
    }>(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus, updatedAt: now, skipServerLog: true, userSnapshot: updated }),
      }
    );
    recordServerStorageMode(serverRes?.storageMode);
    if (Array.isArray(serverRes?.users)) {
      applySyncedUsersToLocalStorage(serverRes.users);
    } else {
      applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
    }
  } catch (err) {
    if (err instanceof ServerApiError && err.status !== 404) {
      throw err;
    }
    applySyncedUsersToLocalStorage(users.map(u => (u.id === userId ? updated : u)));
  }

  if (isFirebaseAdminUser(getCurrentFirebaseUser())) {
    void syncSingleUserUpdateToFirestoreAsAdmin(updated).catch(() => {});
  }
  broadcastUsersUpdated('toggle_status');
  addActivityLog('Khóa/Mở khóa tài khoản', `${newStatus === 'locked' ? 'Khóa' : 'Mở khóa'} tài khoản ${user.fullName}`);
  return newStatus;
}

// Admin: Delete User
export async function deleteUser(userId: string): Promise<void> {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  if (user.id === 'usr_admin' || user.role === 'admin') {
    throw new Error('Không thể xóa tài khoản Quản trị viên.');
  }

  try {
    const serverRes = await requestUsersApi<{
      success: boolean;
      users: User[];
      storageMode?: ServerStorageMode;
    }>(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ skipServerLog: true }),
      }
    );
    recordServerStorageMode(serverRes?.storageMode);
    if (Array.isArray(serverRes?.users)) {
      applySyncedUsersToLocalStorage(serverRes.users, [userId]);
    } else {
      applySyncedUsersToLocalStorage(users.filter(u => u.id !== userId), [userId]);
    }
  } catch (err) {
    if (err instanceof ServerApiError && err.status !== 404) {
      throw err;
    }
    applySyncedUsersToLocalStorage(users.filter(u => u.id !== userId), [userId]);
  }

  if (user.role === 'lecturer') {
    const assignments = getLecturerSubjects().filter(a => a.lecturerId !== userId);
    localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(assignments));

    const updatedSubjects = getSubjects().map(s =>
      s.assignedLecturerId === userId
        ? { ...s, assignedLecturerId: undefined, assignedLecturerName: undefined }
        : s
    );
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(updatedSubjects));
  }

  if (isFirebaseAdminUser(getCurrentFirebaseUser())) {
    void deleteUserFromFirestoreAsAdmin(userId).catch(() => {});
  }
  broadcastUsersUpdated('delete_user');
  addActivityLog('Xóa tài khoản', `Đã xóa tài khoản ${user.fullName} (${user.role})`);
}

export function getUsers(): User[] {
  return safeJsonParse<User[]>(localStorage.getItem(STORAGE_KEYS.USERS), INITIAL_USERS);
}

// Lecturer-Subject Assignments
export function getLecturerSubjects(): LecturerSubjectAssignment[] {
  return safeJsonParse<LecturerSubjectAssignment[]>(localStorage.getItem(STORAGE_KEYS.LECTURER_SUBJECTS), INITIAL_LECTURER_SUBJECTS);
}

export function assignLecturerToSubject(subjectId: string, lecturerId: string) {
  const users = getUsers();
  const lecturer = users.find(u => u.id === lecturerId);
  if (!lecturer) throw new Error('Không tìm thấy giảng viên.');

  // Update in subjects
  updateSubjectAssignedLecturer(subjectId, lecturer.id, lecturer.fullName);

  // Update in lecturer_subjects
  let assignments = getLecturerSubjects();
  assignments = assignments.filter(a => a.subjectId !== subjectId);
  assignments.push({
    id: makeUniqueId('ls'),
    lecturerId: lecturer.id,
    lecturerName: lecturer.fullName,
    subjectId,
    assignedAt: new Date().toISOString().split('T')[0],
  });
  localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(assignments));

  // Sync assignedSubjectIds across ALL lecturers (remove from previous owner, add to new owner)
  const now = new Date().toISOString();
  const updatedUsers = users.map(u => {
    if (u.role !== 'lecturer') return u;
    const prev = u.assignedSubjectIds || [];
    if (u.id === lecturer.id) {
      return prev.includes(subjectId) ? u : { ...u, assignedSubjectIds: [...prev, subjectId], updatedAt: now };
    }
    if (prev.includes(subjectId)) {
      return { ...u, assignedSubjectIds: prev.filter(id => id !== subjectId), updatedAt: now };
    }
    return u;
  });
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
  void syncUsersWithServer().catch(() => {});

  addActivityLog('Phân công giảng dạy', `Gán môn ${subjectId} cho giảng viên ${lecturer.fullName}`);
}

export function unassignLecturerFromSubject(subjectId: string) {
  updateSubjectAssignedLecturer(subjectId, undefined, undefined);

  const assignments = getLecturerSubjects().filter(a => a.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(assignments));

  const now = new Date().toISOString();
  const users = getUsers();
  const updatedUsers = users.map(u => {
    if (u.role !== 'lecturer') return u;
    const prev = u.assignedSubjectIds || [];
    if (prev.includes(subjectId)) {
      return { ...u, assignedSubjectIds: prev.filter(id => id !== subjectId), updatedAt: now };
    }
    return u;
  });
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
  void syncUsersWithServer().catch(() => {});
  addActivityLog('Gỡ phân công giảng dạy', `Gỡ phân công giảng viên khỏi môn ${subjectId}`);
}

function updateSubjectAssignedLecturer(subjectId: string, lecturerId?: string, lecturerName?: string) {
  const subjects = getSubjects();
  const updated = subjects.map(s => {
    if (s.id === subjectId) {
      return { ...s, assignedLecturerId: lecturerId, assignedLecturerName: lecturerName };
    }
    return s;
  });
  localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(updated));
}

// Subjects
export function getSubjects(): Subject[] {
  return safeJsonParse<Subject[]>(localStorage.getItem(STORAGE_KEYS.SUBJECTS), INITIAL_SUBJECTS);
}

export function getSubjectById(id: string): Subject | undefined {
  return getSubjects().find(s => s.id === id);
}

// Get subjects visible to a user based on RBAC
export function getSubjectsForUser(user: User): Subject[] {
  const allSubjects = getSubjects();
  if (user.role === 'admin') {
    return allSubjects;
  }
  if (user.role === 'lecturer') {
    return allSubjects.filter(s =>
      s.assignedLecturerId === user.id ||
      (user.assignedSubjectIds && user.assignedSubjectIds.includes(s.id))
    );
  }
  // Student: see all active published subjects
  return allSubjects.filter(s => s.status === 'active');
}

export function saveSubject(subjectData: Partial<Subject> & { id?: string }): Subject {
  const subjects = getSubjects();
  let rawCode = (subjectData.code || '').trim().toUpperCase();
  if (rawCode) {
    if (rawCode.startsWith('IT')) {
      rawCode = 'INF' + rawCode.slice(2);
    } else if (!rawCode.startsWith('INF')) {
      rawCode = 'INF' + rawCode.replace(/^[A-Z_]+/, '');
    }
  }
  const normalizedCode = rawCode;
  if (normalizedCode && subjects.some(s => s.id !== subjectData.id && s.code.toUpperCase() === normalizedCode)) {
    throw new Error(`Mã học phần "${normalizedCode}" đã tồn tại trong hệ thống.`);
  }

  let updatedSubject: Subject;
  if (subjectData.id) {
    const existing = subjects.find(s => s.id === subjectData.id);
    if (!existing) throw new Error('Không tìm thấy môn học để cập nhật.');
    updatedSubject = {
      ...existing,
      ...subjectData,
      code: normalizedCode || (existing.code.startsWith('IT') ? 'INF' + existing.code.slice(2) : existing.code),
      subjectType: subjectData.subjectType || existing.subjectType || 'theory',
    } as Subject;
    const updatedList = subjects.map(s => s.id === subjectData.id ? updatedSubject : s);
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(updatedList));
    addActivityLog('Cập nhật môn học', `Cập nhật thông tin môn ${updatedSubject.name}`);
  } else {
    const newId = makeUniqueId('sub');
    updatedSubject = {
      id: newId,
      code: normalizedCode || 'INF0000',
      name: subjectData.name?.trim() || 'Môn học mới',
      nameEn: subjectData.nameEn?.trim() || '',
      description: subjectData.description?.trim() || '',
      category: subjectData.category || 'programming',
      subjectType: subjectData.subjectType || 'theory',
      credits: subjectData.credits || 3,
      semester: subjectData.semester || 1,
      status: subjectData.status || 'active',
      chaptersCount: 1,
      questionsCount: 0,
      studentsCount: 0,
      assignedLecturerId: subjectData.assignedLecturerId,
      assignedLecturerName: subjectData.assignedLecturerName,
    };
    subjects.push(updatedSubject);
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));

    // Auto-create default Chapter 1 for the new subject so Practice / Questions / AI work immediately
    const chapters = getChapters();
    chapters.push({
      id: makeUniqueId('ch'),
      subjectId: newId,
      chapterNumber: 1,
      title: `Tổng quan và Cơ sở lý thuyết ${updatedSubject.name}`,
      description: 'Nội dung nhập môn, chuẩn đầu ra và các khái niệm nền tảng của học phần.',
      orderNum: 1,
      questionCount: 0,
    });
    localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chapters));

    if (updatedSubject.assignedLecturerId) {
      assignLecturerToSubject(newId, updatedSubject.assignedLecturerId);
    }

    addActivityLog('Tạo môn học mới', `Thêm môn học ${updatedSubject.name}`);
  }
  return updatedSubject;
}

export function deleteSubject(subjectId: string) {
  const subjects = getSubjects();
  const target = subjects.find(s => s.id === subjectId);
  if (!target) return;

  const filtered = subjects.filter(s => s.id !== subjectId);
  localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(filtered));

  // Clean up assignments, chapters, project topics & registrations
  const assignments = getLecturerSubjects().filter(a => a.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.LECTURER_SUBJECTS, JSON.stringify(assignments));

  const now = new Date().toISOString();
  const updatedUsers = getUsers().map(u => {
    if (u.assignedSubjectIds && u.assignedSubjectIds.includes(subjectId)) {
      return { ...u, assignedSubjectIds: u.assignedSubjectIds.filter(id => id !== subjectId), updatedAt: now };
    }
    return u;
  });
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
  void syncUsersWithServer().catch(() => {});

  const chapters = getChapters().filter(c => c.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chapters));

  const topics = getProjectTopics().filter(t => t.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.PROJECT_TOPICS, JSON.stringify(topics));

  const regs = getProjectRegistrations().filter(r => r.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.PROJECT_REGISTRATIONS, JSON.stringify(regs));

  const remainingQs = getQuestions().filter(q => q.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(remainingQs));

  const remainingExams = getExams().filter(e => e.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(remainingExams));

  const remainingMats = getStudyMaterials().filter(m => m.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(remainingMats));

  const remainingDocs = getLearningDocuments().filter(d => d.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.LEARNING_DOCUMENTS, JSON.stringify(remainingDocs));

  const remainingAiQs = getAIGeneratedQuestions().filter(q => q.subjectId !== subjectId);
  localStorage.setItem(STORAGE_KEYS.AI_GENERATED_QUESTIONS, JSON.stringify(remainingAiQs));

  addActivityLog('Xóa môn học', `Đã xóa môn học ${target.name} (${target.code})`);
}

// Chapters
export function getChapters(subjectId?: string): Chapter[] {
  const list = safeJsonParse<Chapter[]>(localStorage.getItem(STORAGE_KEYS.CHAPTERS), INITIAL_CHAPTERS);
  if (subjectId) {
    return list.filter(c => c.subjectId === subjectId);
  }
  return list;
}

export function saveChapter(chapterData: Omit<Chapter, 'id'> & { id?: string }): Chapter {
  const chapters = getChapters();
  let saved: Chapter;
  const existing = chapterData.id ? chapters.find(c => c.id === chapterData.id) : undefined;
  if (existing) {
    saved = { ...existing, ...chapterData } as Chapter;
    localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chapters.map(c => c.id === saved.id ? saved : c)));
  } else {
    saved = { ...chapterData, id: chapterData.id || makeUniqueId('ch') };
    chapters.push(saved);
    localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chapters));

    const subjects = getSubjects().map(s =>
      s.id === saved.subjectId ? { ...s, chaptersCount: chapters.filter(c => c.subjectId === s.id).length } : s
    );
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
  }
  return saved;
}

// Questions Bank
export function getQuestions(filters?: {
  subjectId?: string;
  chapterId?: string;
  difficulty?: string;
  questionType?: string;
  questionUsage?: QuestionUsage | 'all';
  search?: string;
}): Question[] {
  let list = safeJsonParse<Question[]>(localStorage.getItem(STORAGE_KEYS.QUESTIONS), INITIAL_QUESTIONS);

  if (filters?.subjectId && filters.subjectId !== 'all') {
    list = list.filter(q => q.subjectId === filters.subjectId);
  }
  if (filters?.chapterId && filters.chapterId !== 'all') {
    list = list.filter(q => q.chapterId === filters.chapterId);
  }
  if (filters?.difficulty && filters.difficulty !== 'all') {
    list = list.filter(q => q.difficulty === filters.difficulty);
  }
  if (filters?.questionType && filters.questionType !== 'all') {
    list = list.filter(q => q.questionType === filters.questionType);
  }
  if (filters?.questionUsage && filters.questionUsage !== 'all') {
    list = list.filter(q => {
      const usage = q.questionUsage || 'practice';
      return usage === filters.questionUsage || usage === 'both';
    });
  }
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(item =>
      (item.content || '').toLowerCase().includes(q) ||
      (item.explanation && item.explanation.toLowerCase().includes(q))
    );
  }
  return list;
}

export function getQuestionById(id: string): Question | undefined {
  return getQuestions().find(q => q.id === id);
}

export function verifyLecturerCanAccessSubject(subjectId: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'lecturer') {
    const assigned = getSubjectsForUser(user);
    return assigned.some(s => s.id === subjectId);
  }
  return false;
}

export function recalculateQuestionCounts() {
  const questions = getQuestions();
  const chapters = getChapters();
  const subjects = getSubjects();

  const qCountBySubject: Record<string, number> = {};
  const qCountByChapter: Record<string, number> = {};
  questions.forEach(q => {
    qCountBySubject[q.subjectId] = (qCountBySubject[q.subjectId] || 0) + 1;
    if (q.chapterId) {
      qCountByChapter[q.chapterId] = (qCountByChapter[q.chapterId] || 0) + 1;
    }
  });

  const updatedChapters = chapters.map(c => ({
    ...c,
    questionCount: qCountByChapter[c.id] || 0,
  }));
  localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(updatedChapters));

  const chCountBySubject: Record<string, number> = {};
  updatedChapters.forEach(c => {
    chCountBySubject[c.subjectId] = (chCountBySubject[c.subjectId] || 0) + 1;
  });

  const updatedSubjects = subjects.map(s => ({
    ...s,
    questionsCount: qCountBySubject[s.id] || 0,
    chaptersCount: chCountBySubject[s.id] || s.chaptersCount || 0,
  }));
  localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(updatedSubjects));
}

export function getUploadedQuestionsCount(subjectId?: string): number {
  const initialIds = new Set(INITIAL_QUESTIONS.map(q => q.id));
  const user = getCurrentUser();
  const allowedIds = user?.role === 'lecturer'
    ? new Set(getSubjectsForUser(user).map(s => s.id))
    : null;

  return getQuestions().filter(q => {
    if (initialIds.has(q.id)) return false;
    if (subjectId && q.subjectId !== subjectId) return false;
    if (allowedIds && !allowedIds.has(q.subjectId)) return false;
    return true;
  }).length;
}

export function resetUploadedQuestions(subjectId?: string): { removedQuestions: number; removedExams: number } {
  if (subjectId && !verifyLecturerCanAccessSubject(subjectId)) {
    throw new Error('Bạn chỉ có quyền reset câu hỏi của học phần được phân công phụ trách.');
  }

  const user = getCurrentUser();
  const allowedIds = user?.role === 'lecturer'
    ? new Set(getSubjectsForUser(user).map(s => s.id))
    : null;

  const initialQuestionIds = new Set(INITIAL_QUESTIONS.map(q => q.id));
  const currentQuestions = getQuestions();

  const removedIds = new Set<string>();
  const keptQuestions = currentQuestions.filter(q => {
    const isInitial = initialQuestionIds.has(q.id);
    if (isInitial) return true;
    if (subjectId && q.subjectId !== subjectId) return true;
    if (allowedIds && !allowedIds.has(q.subjectId)) return true;
    removedIds.add(q.id);
    return false;
  });

  localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(keptQuestions));

  const initialExamIds = new Set(INITIAL_EXAMS.map(e => e.id));
  const currentExams = getExams();
  let removedExams = 0;

  const keptExams = currentExams
    .map(ex => {
      if (initialExamIds.has(ex.id)) return ex;
      const hadRemovedQ = (ex.questionIds || []).some(qid => removedIds.has(qid));
      if (!hadRemovedQ) return ex;
      const remainingQIds = (ex.questionIds || []).filter(qid => !removedIds.has(qid));
      if (remainingQIds.length === 0) {
        removedExams += 1;
        return null;
      }
      return {
        ...ex,
        questionIds: remainingQIds,
        totalQuestions: remainingQIds.length,
      };
    })
    .filter((ex): ex is Exam => ex !== null);

  localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(keptExams));
  recalculateQuestionCounts();

  addActivityLog(
    'Reset ngân hàng câu hỏi đã upload',
    `Đã xóa ${removedIds.size} câu hỏi cũ đã tải lên${removedExams > 0 ? ` và ${removedExams} đề thi liên quan` : ''}`
  );

  return { removedQuestions: removedIds.size, removedExams };
}

export function saveQuestion(questionData: Omit<Question, 'id' | 'createdAt'> & { id?: string }): Question {
  if (!verifyLecturerCanAccessSubject(questionData.subjectId)) {
    throw new Error('Giảng viên chỉ có quyền quản lý và thêm câu hỏi cho môn học được phân công phụ trách.');
  }
  const questions = getQuestions();
  let updatedQuestion: Question;
  if (questionData.id) {
    const existing = questions.find(q => q.id === questionData.id);
    if (!existing) {
      updatedQuestion = {
        ...questionData,
        questionUsage: questionData.questionUsage || 'practice',
        id: questionData.id,
        createdAt: new Date().toISOString(),
      };
      questions.unshift(updatedQuestion);
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
    } else {
      updatedQuestion = {
        ...existing,
        ...questionData,
        questionUsage: questionData.questionUsage || existing.questionUsage || 'practice',
      };
      const updatedList = questions.map(q => q.id === questionData.id ? updatedQuestion : q);
      localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(updatedList));
    }
    recalculateQuestionCounts();
    addActivityLog('Cập nhật câu hỏi', `Cập nhật câu hỏi ID: ${updatedQuestion.id}`);
  } else {
    updatedQuestion = {
      ...questionData,
      questionUsage: questionData.questionUsage || 'practice',
      id: makeUniqueId('q'),
      createdAt: new Date().toISOString(),
    };
    questions.unshift(updatedQuestion);
    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
    recalculateQuestionCounts();

    addActivityLog('Tạo câu hỏi mới', `Thêm câu hỏi vào môn ${updatedQuestion.subjectId}`);
  }
  return updatedQuestion;
}

export function deleteQuestion(id: string) {
  const questions = getQuestions();
  const target = questions.find(q => q.id === id);
  if (target && !verifyLecturerCanAccessSubject(target.subjectId)) {
    throw new Error('Giảng viên chỉ có quyền xóa câu hỏi của môn học được phân công phụ trách.');
  }
  const filtered = questions.filter(q => q.id !== id);
  localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(filtered));
  recalculateQuestionCounts();

  addActivityLog('Xóa câu hỏi', `Đã xóa câu hỏi ID: ${id}`);
}

export function importQuestionsFromFile(
  drafts: Array<Omit<Question, 'id' | 'createdAt'>>,
  sourceLabel = 'File Word/Excel'
): Question[] {
  const user = getCurrentUser();
  if (user && user.role === 'lecturer') {
    const assigned = getSubjectsForUser(user);
    for (const d of drafts) {
      if (!assigned.some(s => s.id === d.subjectId)) {
        throw new Error('Giảng viên chỉ có quyền tải lên ngân hàng câu hỏi cho môn học được phân công phụ trách.');
      }
    }
  }

  const questions = getQuestions();
  const now = new Date().toISOString();
  const created: Question[] = drafts.map((d, idx) => ({
    ...d,
    id: makeUniqueId(`q_imp_${idx}`),
    createdAt: now,
  }));

  const updatedQuestions = [...created, ...questions];
  localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(updatedQuestions));
  recalculateQuestionCounts();

  addActivityLog('Nhập ngân hàng câu hỏi', `Đã nhập ${created.length} câu hỏi từ ${sourceLabel}`);
  return created;
}

// Exams
export function getExams(subjectId?: string): Exam[] {
  const list = safeJsonParse<Exam[]>(localStorage.getItem(STORAGE_KEYS.EXAMS), INITIAL_EXAMS);
  if (subjectId && subjectId !== 'all') {
    return list.filter(e => e.subjectId === subjectId);
  }
  return list;
}

export function getExamById(id: string): Exam | undefined {
  return getExams().find(e => e.id === id);
}

export function saveExam(examData: Partial<Exam> & { id?: string }): Exam {
  const subId = examData.subjectId || 'sub_dsa';
  if (!verifyLecturerCanAccessSubject(subId)) {
    throw new Error('Giảng viên chỉ có quyền tạo và quản lý đề thi cho môn học được phân công phụ trách.');
  }

  const exams = getExams();
  let updatedExam: Exam;
  const existingExam = examData.id ? exams.find(e => e.id === examData.id) : undefined;
  if (existingExam) {
    updatedExam = {
      ...existingExam,
      ...examData,
    } as Exam;
    const updatedList = exams.map(e => e.id === existingExam.id ? updatedExam : e);
    localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(updatedList));
    addActivityLog('Cập nhật đề thi', `Cập nhật đề: ${updatedExam.title}`);
  } else {
    updatedExam = {
      id: makeUniqueId('exam'),
      subjectId: subId,
      title: examData.title || 'Đề thi mới',
      code: examData.code || `EX-${Date.now().toString().slice(-4)}`,
      description: examData.description || 'Đề thi trắc nghiệm học phần',
      examFormat: examData.examFormat || 'theory',
      durationMinutes: Math.max(5, Number(examData.durationMinutes) || 45),
      totalQuestions:
        examData.totalQuestions && examData.totalQuestions > 0
          ? examData.totalQuestions
          : examData.examFormat === 'practical'
          ? 2
          : 45,
      maxScore: Math.max(1, Number(examData.maxScore) || 10),
      passScore: examData.passScore !== undefined ? Number(examData.passScore) : 0,
      allowReview: examData.allowReview !== undefined ? examData.allowReview : true,
      shuffleQuestions: examData.shuffleQuestions !== undefined ? examData.shuffleQuestions : true,
      maxAttempts: Math.max(1, Number(examData.maxAttempts) || 3),
      startTime: examData.startTime || new Date().toISOString(),
      endTime: examData.endTime || '2026-12-31T23:59:59Z',
      status: examData.status || 'published',
      questionIds: examData.questionIds || [],
      createdBy: examData.createdBy || getCurrentUser()?.id || 'system',
      createdAt: new Date().toISOString(),
      isOfficialSchoolExam: examData.isOfficialSchoolExam ?? true,
    };
    exams.unshift(updatedExam);
    localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(exams));
    addActivityLog('Tạo đề thi mới', `Tạo đề thi: ${updatedExam.title}`);
  }
  return updatedExam;
}

export function deleteExam(id: string) {
  const exams = getExams();
  const filtered = exams.filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(filtered));
  addActivityLog('Xóa đề thi', `Đã xóa đề thi ID: ${id}`);
}

// Exam Attempts
export function getExamAttempts(studentId?: string): ExamAttempt[] {
  const parsed = safeJsonParse<ExamAttempt[]>(localStorage.getItem(STORAGE_KEYS.ATTEMPTS), INITIAL_EXAM_ATTEMPTS);
  const fixed = ensureUniqueItemIds(parsed, 'att');
  if (fixed.changed && localStorage.getItem(STORAGE_KEYS.ATTEMPTS)) {
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(fixed.list));
  }
  if (studentId) {
    return fixed.list.filter(a => a.studentId === studentId);
  }
  return fixed.list;
}

export function saveExamAttempt(attempt: ExamAttempt) {
  const attempts = getExamAttempts();
  const existingIdx = attempts.findIndex(a => a.id === attempt.id);
  if (existingIdx >= 0) {
    attempts[existingIdx] = attempt;
  } else {
    attempts.unshift(attempt);
  }
  try {
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(attempts));
  } catch {
    // Trim heavy image base64 payloads from older attempts (keep latest 3 attempts intact) if quota is tight
    const compacted = attempts.map((att, idx) => {
      if (idx < 3 || !att.answers) return att;
      const nextAnswers: Record<string, any> = {};
      Object.entries(att.answers).forEach(([qId, val]) => {
        if (val && typeof val === 'object' && val.kind === 'image') {
          nextAnswers[qId] = `[Hình ảnh đã lưu trước đó: ${val.fileName || 'image'}]`;
        } else {
          nextAnswers[qId] = val;
        }
      });
      return { ...att, answers: nextAnswers };
    });
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(compacted));
  }
  addActivityLog('Hoàn thành bài thi', `${attempt.studentName} hoàn thành đề thi ${attempt.examTitle} (${attempt.score}/${attempt.maxScore} điểm)`);
}

// Practice Sessions
export function getPracticeSessions(studentId?: string): PracticeSession[] {
  const list = safeJsonParse<PracticeSession[]>(localStorage.getItem(STORAGE_KEYS.PRACTICE), []);
  if (studentId) {
    return list.filter(p => p.studentId === studentId);
  }
  return list;
}

export function savePracticeSession(session: PracticeSession) {
  const list = getPracticeSessions();
  list.unshift(session);
  localStorage.setItem(STORAGE_KEYS.PRACTICE, JSON.stringify(list));
  addActivityLog('Luyện tập câu hỏi', `Luyện tập môn ${session.subjectId} đạt ${session.score}/10`);
}

// Study Materials (Local + Persistent Server Sync for Zero Font Corruption)
export function getStudyMaterials(subjectId?: string): StudyMaterial[] {
  const list = safeJsonParse<StudyMaterial[]>(localStorage.getItem(STORAGE_KEYS.MATERIALS), INITIAL_MATERIALS);
  if (subjectId && subjectId !== 'all') {
    return list.filter(m => m.subjectId === subjectId);
  }
  return list;
}

export function saveStudyMaterial(material: Omit<StudyMaterial, 'id' | 'downloadCount' | 'uploadedAt'> & { id?: string }): StudyMaterial {
  const materials = getStudyMaterials();
  const created: StudyMaterial = {
    ...material,
    id: material.id || makeUniqueId('mat'),
    downloadCount: 0,
    uploadedAt: new Date().toISOString(),
  };
  const nextList = [created, ...materials.filter(m => m.id !== created.id)];
  try {
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(nextList));
  } catch {
    // Fallback if binary fileDataUrl exceeds browser localStorage quota — keep metadata locally, binary lives on server
    const slimList = nextList.map(m =>
      m.id === created.id && m.fileDataUrl ? { ...m, fileDataUrl: undefined } : m
    );
    localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(slimList));
  }
  addActivityLog('Tải lên tài liệu học tập', `Đã tải lên "${created.title}"`);
  return created;
}

export async function syncMaterialsWithServer(): Promise<StudyMaterial[]> {
  try {
    const res = await requestUsersApi<{ success: boolean; materials: StudyMaterial[] }>('/api/materials', { method: 'GET' }, 8000);
    const serverList = Array.isArray(res.materials) ? res.materials : [];
    const localList = getStudyMaterials();
    const mergedMap = new Map<string, StudyMaterial>();
    serverList.forEach(m => mergedMap.set(m.id, m));
    localList.forEach(m => {
      if (!mergedMap.has(m.id)) mergedMap.set(m.id, m);
    });
    const merged = Array.from(mergedMap.values());
    try {
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(merged));
    } catch {
      const slim = merged.map(m => (m.serverFileUrl && m.fileDataUrl ? { ...m, fileDataUrl: undefined } : m));
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(slim));
    }
    return merged;
  } catch {
    return getStudyMaterials();
  }
}

export async function uploadMaterialToServer(
  material: Omit<StudyMaterial, 'id' | 'downloadCount' | 'uploadedAt'>
): Promise<StudyMaterial> {
  const localCreated = saveStudyMaterial(material);
  try {
    const res = await requestUsersApi<{ success: boolean; material: StudyMaterial }>(
      '/api/materials',
      {
        method: 'POST',
        body: JSON.stringify(localCreated),
      },
      15000
    );
    if (res?.material) {
      const materials = getStudyMaterials().map(m => (m.id === localCreated.id ? res.material : m));
      try {
        localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
      } catch {
        const slim = materials.map(m => (m.id === res.material.id ? { ...res.material, fileDataUrl: undefined } : m));
        localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(slim));
      }
      return res.material;
    }
  } catch (err) {
    if (err instanceof ServerApiError && err.status === 413) {
      throw err;
    }
  }
  return localCreated;
}

export function deleteStudyMaterial(id: string) {
  const materials = getStudyMaterials();
  const filtered = materials.filter(m => m.id !== id);
  localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(filtered));
  addActivityLog('Xóa tài liệu học tập', `Đã xóa tài liệu ID: ${id}`);
  void requestUsersApi(`/api/materials/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
}

export function incrementDownloadCount(materialId: string) {
  const materials = getStudyMaterials();
  const target = materials.find(m => m.id === materialId);
  if (target) {
    target.downloadCount = (target.downloadCount || 0) + 1;
    try {
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(materials));
    } catch {
      // ignore quota
    }
  }
  void requestUsersApi(`/api/materials/${encodeURIComponent(materialId)}/download-count`, { method: 'PUT' }).catch(() => {});
}

// Project Topics & Student Registrations (Đồ án học phần)
export function getProjectTopics(subjectId?: string): ProjectTopic[] {
  const list = safeJsonParse<ProjectTopic[]>(localStorage.getItem(STORAGE_KEYS.PROJECT_TOPICS), INITIAL_PROJECT_TOPICS);
  if (subjectId && subjectId !== 'all') {
    return list.filter(t => t.subjectId === subjectId);
  }
  return list;
}

export function saveProjectTopic(
  topicData: Partial<ProjectTopic> & { subjectId: string; title: string }
): ProjectTopic {
  const topics = getProjectTopics();
  let saved: ProjectTopic;
  if (topicData.id) {
    const existing = topics.find(t => t.id === topicData.id);
    if (!existing) throw new Error('Không tìm thấy đề tài đồ án để cập nhật.');
    saved = {
      ...existing,
      ...topicData,
    };
    localStorage.setItem(
      STORAGE_KEYS.PROJECT_TOPICS,
      JSON.stringify(topics.map(t => (t.id === saved.id ? saved : t)))
    );
    addActivityLog('Cập nhật đề tài đồ án', `Cập nhật đề tài ${saved.code}: ${saved.title}`);
  } else {
    saved = {
      id: makeUniqueId('pt'),
      subjectId: topicData.subjectId,
      code: (topicData.code || `DA-${topics.length + 1}`).trim().toUpperCase(),
      title: topicData.title.trim(),
      description: topicData.description?.trim() || '',
      guidance: topicData.guidance?.trim() || 'Sinh viên liên hệ giảng viên hướng dẫn để nhận tài liệu đặc tả chi tiết.',
      deliverables: topicData.deliverables && topicData.deliverables.length > 0
        ? topicData.deliverables
        : ['Báo cáo phân tích thiết kế', 'Mã nguồn ứng dụng trên GitHub', 'Quyển báo cáo đồ án'],
      maxStudents: topicData.maxStudents || 3,
      status: topicData.status || 'open',
      createdBy: topicData.createdBy || getCurrentUser()?.fullName || 'Giảng viên',
      createdAt: new Date().toISOString(),
    };
    topics.unshift(saved);
    localStorage.setItem(STORAGE_KEYS.PROJECT_TOPICS, JSON.stringify(topics));
    addActivityLog('Thêm đề tài đồ án mới', `Tạo đề tài ${saved.code}: ${saved.title}`);
  }
  return saved;
}

export function deleteProjectTopic(topicId: string) {
  const topics = getProjectTopics().filter(t => t.id !== topicId);
  localStorage.setItem(STORAGE_KEYS.PROJECT_TOPICS, JSON.stringify(topics));
  const regs = getProjectRegistrations().filter(r => r.topicId !== topicId);
  localStorage.setItem(STORAGE_KEYS.PROJECT_REGISTRATIONS, JSON.stringify(regs));
  addActivityLog('Xóa đề tài đồ án', `Đã xóa đề tài ID: ${topicId}`);
}

export function getProjectRegistrations(filters?: {
  subjectId?: string;
  studentId?: string;
  topicId?: string;
}): ProjectRegistration[] {
  let list = safeJsonParse<ProjectRegistration[]>(localStorage.getItem(STORAGE_KEYS.PROJECT_REGISTRATIONS), INITIAL_PROJECT_REGISTRATIONS);
  if (filters?.subjectId) {
    list = list.filter(r => r.subjectId === filters.subjectId);
  }
  if (filters?.studentId) {
    list = list.filter(r => r.studentId === filters.studentId);
  }
  if (filters?.topicId) {
    list = list.filter(r => r.topicId === filters.topicId);
  }
  return list;
}

export function registerProjectTopic(params: {
  subjectId: string;
  topicId: string;
  student: User;
  note?: string;
  repoUrl?: string;
}): ProjectRegistration {
  const topic = getProjectTopics().find(t => t.id === params.topicId);
  if (!topic) throw new Error('Đề tài đồ án không tồn tại.');
  if (topic.status !== 'open') throw new Error('Đề tài này đã đóng đăng ký.');

  const allRegs = getProjectRegistrations();
  if (allRegs.some(r => r.subjectId === params.subjectId && r.studentId === params.student.id)) {
    throw new Error('Bạn đã đăng ký một đề tài trong học phần này. Vui lòng hủy đăng ký cũ trước khi đổi đề tài.');
  }

  const currentCount = allRegs.filter(r => r.topicId === params.topicId).length;
  if (currentCount >= topic.maxStudents) {
    throw new Error(`Đề tài ${topic.code} đã đủ số lượng sinh viên đăng ký tối đa (${topic.maxStudents} sinh viên).`);
  }

  const reg: ProjectRegistration = {
    id: makeUniqueId('preg'),
    subjectId: params.subjectId,
    topicId: params.topicId,
    studentId: params.student.id,
    studentName: params.student.fullName,
    studentCode: params.student.studentCode,
    className: params.student.className,
    note: params.note?.trim() || '',
    repoUrl: params.repoUrl?.trim() || '',
    registeredAt: new Date().toISOString(),
    status: 'registered',
  };

  allRegs.unshift(reg);
  localStorage.setItem(STORAGE_KEYS.PROJECT_REGISTRATIONS, JSON.stringify(allRegs));
  addActivityLog('Đăng ký đề tài đồ án', `${params.student.fullName} đăng ký đề tài ${topic.code}: ${topic.title}`);
  return reg;
}

export function updateProjectRegistration(
  regId: string,
  data: Partial<Pick<ProjectRegistration, 'status' | 'note' | 'repoUrl'>>
): ProjectRegistration {
  const regs = getProjectRegistrations();
  const target = regs.find(r => r.id === regId);
  if (!target) throw new Error('Không tìm thấy thông tin đăng ký đề tài.');
  const updated: ProjectRegistration = { ...target, ...data };
  localStorage.setItem(
    STORAGE_KEYS.PROJECT_REGISTRATIONS,
    JSON.stringify(regs.map(r => (r.id === regId ? updated : r)))
  );
  addActivityLog('Cập nhật đăng ký đồ án', `Cập nhật đăng ký đề tài của ${updated.studentName}`);
  return updated;
}

export function cancelProjectRegistration(regId: string) {
  const regs = getProjectRegistrations();
  const target = regs.find(r => r.id === regId);
  localStorage.setItem(STORAGE_KEYS.PROJECT_REGISTRATIONS, JSON.stringify(regs.filter(r => r.id !== regId)));
  if (target) {
    addActivityLog('Hủy đăng ký đề tài đồ án', `${target.studentName} hủy đăng ký đề tài`);
  }
}

// Learning Documents for AI
export function getLearningDocuments(subjectId?: string): LearningDocument[] {
  const list = safeJsonParse<LearningDocument[]>(localStorage.getItem(STORAGE_KEYS.LEARNING_DOCUMENTS), INITIAL_LEARNING_DOCUMENTS);
  if (subjectId && subjectId !== 'all') {
    return list.filter(d => d.subjectId === subjectId);
  }
  return list;
}

// Lecturer only sees documents for assigned subjects, Admin sees all
export function getLearningDocumentsForUser(user: User): LearningDocument[] {
  const allDocs = getLearningDocuments();
  if (user.role === 'admin') return allDocs;
  if (user.role === 'lecturer') {
    const userSubjects = getSubjectsForUser(user).map(s => s.id);
    return allDocs.filter(d => d.lecturerId === user.id || userSubjects.includes(d.subjectId));
  }
  return [];
}

export function saveLearningDocument(doc: Partial<LearningDocument>): LearningDocument {
  const docs = getLearningDocuments();
  const existing = doc.id ? docs.find(d => d.id === doc.id) : undefined;
  const resolvedStatus = doc.status ?? existing?.status ?? (doc.analysisResult ? 'analyzed' : 'pending');
  const resolvedProcessingStatus: LearningDocument['processingStatus'] =
    doc.processingStatus ||
    (resolvedStatus === 'analyzed' || doc.analysisResult
      ? 'analyzed'
      : resolvedStatus === 'error'
      ? 'failed'
      : existing?.processingStatus || 'uploaded');

  const created: LearningDocument = {
    ...existing,
    id: doc.id || makeUniqueId('doc'),
    subjectId: doc.subjectId || existing?.subjectId || 'sub_dsa',
    chapterId: doc.chapterId ?? existing?.chapterId,
    lecturerId: doc.lecturerId || existing?.lecturerId || getCurrentUser()?.id || 'system',
    title: doc.title || existing?.title || 'Tài liệu học phần mới',
    fileType: doc.fileType || existing?.fileType || 'pdf',
    fileSize: doc.fileSize || existing?.fileSize || '1.5 MB',
    description: doc.description ?? existing?.description ?? '',
    filePath: doc.filePath || existing?.filePath || `/uploads/${doc.title || 'document'}.pdf`,
    uploadedBy: doc.uploadedBy || existing?.uploadedBy || getCurrentUser()?.fullName || 'Giảng viên',
    uploadedAt: doc.uploadedAt || existing?.uploadedAt || new Date().toISOString(),
    processingStatus: resolvedProcessingStatus,
    status: resolvedStatus,
    analysisResult: doc.analysisResult ?? existing?.analysisResult,
    rawContent: doc.rawContent ?? existing?.rawContent,
  };

  const existingIdx = docs.findIndex(d => d.id === created.id);
  if (existingIdx >= 0) {
    docs[existingIdx] = created;
  } else {
    docs.unshift(created);
    addActivityLog('Upload tài liệu học phần', `Tải lên tài liệu: ${created.title}`);
  }
  localStorage.setItem(STORAGE_KEYS.LEARNING_DOCUMENTS, JSON.stringify(docs));
  return created;
}

export function deleteLearningDocument(id: string) {
  const docs = getLearningDocuments();
  const filtered = docs.filter(d => d.id !== id);
  localStorage.setItem(STORAGE_KEYS.LEARNING_DOCUMENTS, JSON.stringify(filtered));
  addActivityLog('Xóa tài liệu học phần', `Đã xóa tài liệu ID: ${id}`);
}

// AI Generated Questions (Staging Workspace)
export function getAIGeneratedQuestions(filters?: {
  subjectId?: string;
  status?: string;
}): AIGeneratedQuestion[] {
  let list = safeJsonParse<AIGeneratedQuestion[]>(localStorage.getItem(STORAGE_KEYS.AI_GENERATED_QUESTIONS), INITIAL_AI_GENERATED_QUESTIONS);
  if (filters?.subjectId && filters.subjectId !== 'all') {
    list = list.filter(q => q.subjectId === filters.subjectId);
  }
  if (filters?.status && filters.status !== 'all') {
    list = list.filter(q => q.status === filters.status);
  }
  return list;
}

export function saveAIGeneratedQuestion(question: AIGeneratedQuestion): AIGeneratedQuestion {
  const list = getAIGeneratedQuestions();
  const idx = list.findIndex(q => q.id === question.id);
  if (idx >= 0) {
    list[idx] = question;
  } else {
    list.unshift(question);
  }
  localStorage.setItem(STORAGE_KEYS.AI_GENERATED_QUESTIONS, JSON.stringify(list));
  return question;
}

export function approveAIGeneratedQuestion(id: string, reviewer: string | User, notes?: string): Question {
  const reviewerName = typeof reviewer === 'string' ? reviewer : reviewer.fullName;
  const aiQuestions = getAIGeneratedQuestions();
  const target = aiQuestions.find(q => q.id === id);
  if (!target) throw new Error('Không tìm thấy câu hỏi AI');

  target.status = 'approved';
  target.reviewedBy = reviewerName;
  target.reviewNotes = notes || target.reviewNotes;
  target.reviewedAt = new Date().toISOString();
  saveAIGeneratedQuestion(target);

  const fallbackChapter = getChapters(target.subjectId)[0]?.id || 'ch_general';

  // Promote to official questions bank
  const officialQuestion = saveQuestion({
    subjectId: target.subjectId,
    chapterId: target.chapterId || fallbackChapter,
    questionType: target.questionType,
    difficulty: target.difficulty,
    content: target.content,
    codeSnippet: target.codeSnippet,
    options: target.options,
    correctAnswer: target.correctAnswer,
    explanation: target.explanation,
    points: 1,
    createdBy: reviewerName,
    bloomLevel: target.bloomLevel,
    sourceReference: target.sourceReference,
  });

  addActivityLog('Giảng viên duyệt câu hỏi AI', `Duyệt câu hỏi vào môn ${target.subjectId} (Bloom Bậc ${target.bloomLevel})`);
  return officialQuestion;
}

export function rejectAIGeneratedQuestion(id: string, reviewer?: string | User, notes?: string) {
  const reviewerName = typeof reviewer === 'string' ? reviewer : reviewer?.fullName || '';
  const aiQuestions = getAIGeneratedQuestions();
  const target = aiQuestions.find(q => q.id === id);
  if (!target) return;
  target.status = 'rejected';
  target.reviewedBy = reviewerName || target.reviewedBy;
  target.reviewNotes = notes || 'Nội dung chưa đạt chuẩn khảo thí';
  target.reviewedAt = new Date().toISOString();
  saveAIGeneratedQuestion(target);
  addActivityLog('Từ chối câu hỏi AI', `Từ chối câu hỏi ID: ${id}`);
}

export function deleteAIGeneratedQuestion(id: string) {
  const list = getAIGeneratedQuestions();
  const filtered = list.filter(q => q.id !== id);
  localStorage.setItem(STORAGE_KEYS.AI_GENERATED_QUESTIONS, JSON.stringify(filtered));
}

// Favorites
export function getFavorites(studentId: string): string[] {
  return safeJsonParse<string[]>(localStorage.getItem(`${STORAGE_KEYS.FAVORITES}_${studentId}`), ['q_dsa_01', 'q_net_02']);
}

export function toggleFavorite(studentId: string, questionId: string): boolean {
  const current = getFavorites(studentId);
  const exists = current.includes(questionId);
  let updated: string[];
  if (exists) {
    updated = current.filter(id => id !== questionId);
  } else {
    updated = [...current, questionId];
  }
  localStorage.setItem(`${STORAGE_KEYS.FAVORITES}_${studentId}`, JSON.stringify(updated));
  return !exists;
}

// Notifications
export function getNotifications(): NotificationItem[] {
  return safeJsonParse<NotificationItem[]>(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS), INITIAL_NOTIFICATIONS);
}

export function markNotificationRead(id: string) {
  const notifs = getNotifications();
  const updated = notifs.map(n => n.id === id ? { ...n, isRead: true } : n);
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
}

export function markAllNotificationsRead() {
  const notifs = getNotifications();
  const updated = notifs.map(n => ({ ...n, isRead: true }));
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
}

// Activity Logs (Centralized Client <-> Express Server <-> Cloud Firestore)
const MAX_LOCAL_LOGS = 250;
let lastLogsSyncedAtIso: string | null = null;
let inFlightLogsSyncPromise: Promise<ActivityLog[]> | null = null;

export function getLastLogSyncInfo(): { syncedAt: string | null } {
  return { syncedAt: lastLogsSyncedAtIso };
}

function mergeAndSortActivityLogs(lists: ActivityLog[][]): ActivityLog[] {
  const byId = new Map<string, ActivityLog>();
  for (const list of lists) {
    for (const item of list || []) {
      if (!item || typeof item !== 'object' || !item.id) continue;
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
      } else if (existing.ipAddress === '127.0.0.1' && item.ipAddress && item.ipAddress !== '127.0.0.1') {
        byId.set(item.id, { ...existing, ipAddress: item.ipAddress });
      }
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
    .slice(0, MAX_LOCAL_LOGS);
}

export function getActivityLogs(): ActivityLog[] {
  const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
  const parsed = safeJsonParse<ActivityLog[]>(raw, INITIAL_ACTIVITY_LOGS);
  const fixed = ensureUniqueItemIds(parsed, 'log');
  const sorted = mergeAndSortActivityLogs([fixed.list]);
  if (fixed.changed && raw) {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(sorted));
  }
  return sorted;
}

export function applySyncedLogsToLocalStorage(incomingLogs: ActivityLog[]): ActivityLog[] {
  const existing = getActivityLogs();
  const merged = mergeAndSortActivityLogs([existing, incomingLogs]);
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(merged));
  broadcastLogsUpdated('sync_apply');
  return merged;
}

export function addActivityLog(
  action: string,
  target: string,
  options?: {
    id?: string;
    actor?: Partial<User>;
    skipServerSync?: boolean;
    skipFirestoreSync?: boolean;
  }
): ActivityLog {
  const current = getCurrentUser();
  const actor = options?.actor || current;
  const role: 'student' | 'lecturer' | 'admin' =
    actor?.role === 'admin' || actor?.role === 'lecturer' ? actor.role : 'student';

  const newLog: ActivityLog = {
    id: options?.id || makeUniqueId('log'),
    userId: actor?.id || 'guest',
    userName: actor?.fullName || 'Khách',
    userRole: role,
    action,
    target,
    timestamp: new Date().toISOString(),
    ipAddress: '127.0.0.1',
  };

  const mergedLocal = applySyncedLogsToLocalStorage([newLog]);

  if (!options?.skipServerSync) {
    void requestUsersApi<{
      success: boolean;
      logs?: ActivityLog[];
      storageMode?: ServerStorageMode;
    }>(
      '/api/logs/sync',
      {
        method: 'POST',
        body: JSON.stringify({ logs: [newLog] }),
      },
      5000
    )
      .then((res) => {
        recordServerStorageMode(res?.storageMode);
        if (Array.isArray(res?.logs)) {
          applySyncedLogsToLocalStorage(res.logs);
          lastLogsSyncedAtIso = new Date().toISOString();
        }
      })
      .catch(() => {});
  }

  if (!options?.skipFirestoreSync) {
    const fbUser = getCurrentFirebaseUser();
    if (fbUser && fbUser.emailVerified && (isFirebaseAdminUser(fbUser) || newLog.userRole === 'student')) {
      void createActivityLogInFirestore(fbUser, newLog).catch(() => {});
    }
  }

  return mergedLocal[0] || newLog;
}

async function executeSyncLogsWithServer(): Promise<ActivityLog[]> {
  const fbUser = getCurrentFirebaseUser();
  const isFbAdmin = isFirebaseAdminUser(fbUser);

  let firestoreLogs: ActivityLog[] = [];
  if (isFbAdmin) {
    try {
      firestoreLogs = await fetchActivityLogsFromFirestoreAsAdmin();
    } catch {
      // ignore if Firestore list fails temporarily
    }
  }

  const localLogs = getActivityLogs();
  const preMerged = firestoreLogs.length > 0 ? applySyncedLogsToLocalStorage(firestoreLogs) : localLogs;

  let finalLogs = preMerged;
  try {
    const res = await requestUsersApi<{
      success: boolean;
      logs?: ActivityLog[];
      storageMode?: ServerStorageMode;
    }>(
      '/api/logs/sync',
      {
        method: 'POST',
        body: JSON.stringify({ logs: preMerged }),
      },
      6000
    );
    recordServerStorageMode(res?.storageMode);
    if (Array.isArray(res?.logs)) {
      finalLogs = applySyncedLogsToLocalStorage(res.logs);
    }
    lastLogsSyncedAtIso = new Date().toISOString();
  } catch {
    // Keep merged local + Firestore logs if API is temporarily unreachable
    if (isFbAdmin) {
      lastLogsSyncedAtIso = new Date().toISOString();
    }
  }

  if (isFbAdmin) {
    void pushActivityLogsToFirestoreAsAdmin(finalLogs).catch(() => {});
  }

  return finalLogs;
}

export async function syncLogsWithServer(): Promise<ActivityLog[]> {
  if (inFlightLogsSyncPromise) {
    return inFlightLogsSyncPromise;
  }
  inFlightLogsSyncPromise = executeSyncLogsWithServer().finally(() => {
    inFlightLogsSyncPromise = null;
  });
  return inFlightLogsSyncPromise;
}

export async function mergeFirestoreLogsIntoSystem(firestoreLogs: ActivityLog[]): Promise<ActivityLog[]> {
  let merged = applySyncedLogsToLocalStorage(firestoreLogs);
  lastLogsSyncedAtIso = new Date().toISOString();

  try {
    const res = await requestUsersApi<{
      success: boolean;
      logs?: ActivityLog[];
      storageMode?: ServerStorageMode;
    }>(
      '/api/logs/sync',
      {
        method: 'POST',
        body: JSON.stringify({ logs: merged }),
      },
      6000
    );
    recordServerStorageMode(res?.storageMode);
    if (Array.isArray(res?.logs)) {
      merged = applySyncedLogsToLocalStorage(res.logs);
    }
  } catch {
    // keep Firestore merged logs
  }

  return merged;
}

// AI Client Request Handlers calling server proxy routes
async function postJsonApi<T = any>(
  url: string,
  payload: unknown,
  defaultErrorMsg: string,
  timeoutMs = 50000
): Promise<T> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (networkErr: any) {
      window.clearTimeout(timeoutId);
      if (networkErr?.name === 'AbortError') {
        throw new Error(
          'Yêu cầu xử lý AI quá thời gian chờ. Vui lòng giảm số lượng câu hỏi xuống 5 câu/lần hoặc rút gọn tài liệu rồi thử lại.'
        );
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw new Error(
        'Không thể kết nối đến máy chủ API (/api/ai). Vui lòng kiểm tra kết nối mạng hoặc tải lại trang.'
      );
    } finally {
      window.clearTimeout(timeoutId);
    }

    const rawText = await res.text();
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const trimmed = rawText.trim();

    const looksLikeHtml =
      contentType.includes('text/html') ||
      /^<!doctype/i.test(trimmed) ||
      /^<(html|head|body|script|meta|title)/i.test(trimmed) ||
      trimmed.startsWith('<');

    const isTransientGateway = res.status === 502 || res.status === 503 || res.status === 504;
    if (isTransientGateway && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }

    if (looksLikeHtml) {
      if (isTransientGateway) {
        throw new Error(
          `Máy chủ tạm thời quá tải hoặc phản hồi chậm (HTTP ${res.status}). Vui lòng đợi vài giây hoặc chọn tạo 5 câu/lần rồi bấm thử lại.`
        );
      }
      throw new Error(
        `Máy chủ trả về trang HTML thay vì dữ liệu JSON (HTTP ${res.status}). Nguyên nhân thường gặp: bạn đang mở link tĩnh không có máy chủ Node/Express chạy ở /api, hoặc máy chủ vừa khởi động lại. Hãy tải lại trang (F5) và thử lại.`
      );
    }

    if (!trimmed) {
      throw new Error(`${defaultErrorMsg} (Máy chủ trả về phản hồi rỗng, HTTP ${res.status}).`);
    }

    let data: any;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error(
        `Dữ liệu phản hồi từ máy chủ không đúng định dạng JSON (HTTP ${res.status}). Vui lòng thử lại sau ít giây.`
      );
    }

    if (!res.ok) {
      throw new Error(extractErrorMessage(data, `${defaultErrorMsg} (HTTP ${res.status})`));
    }

    return data as T;
  }

  throw new Error(defaultErrorMsg);
}

export async function requestAIAnalyzeDocument(params: {
  documentTitle: string;
  subjectName: string;
  documentType: string;
  rawContent: string;
}) {
  return postJsonApi(
    '/api/ai/analyze-document',
    {
      ...params,
      rawContent: (params.rawContent || '').slice(0, 18000),
    },
    'Lỗi khi yêu cầu AI phân tích tài liệu'
  );
}

export async function requestAIGenerateQuestions(params: {
  subjectName: string;
  chapterTitle?: string;
  documentTitle: string;
  rawContent: string;
  questionCount: number;
  difficulty: string;
  bloomLevel: number;
  questionType: string;
}) {
  return postJsonApi(
    '/api/ai/generate-questions',
    {
      ...params,
      rawContent: (params.rawContent || '').slice(0, 12000),
    },
    'Lỗi khi yêu cầu AI tạo câu hỏi',
    65000
  );
}

export async function requestAIExplainQuestion(params: {
  questionContent: string;
  studentAnswer?: string;
  correctAnswer: any;
  explanation: string;
  options?: any[];
  subjectName: string;
}) {
  return postJsonApi(
    '/api/ai/explain-question',
    params,
    'Lỗi khi gọi AI giải thích câu hỏi'
  );
}

export async function requestAISolvePracticalQuestions(params: {
  subjectName: string;
  subjectCode?: string;
  questions: Array<{
    tempId: string;
    content: string;
    existingCodeSnippet?: string;
    existingAnswer?: string;
  }>;
}): Promise<{
  success: boolean;
  solutions: Array<{
    tempId: string;
    sampleSolution: string;
    rubricKeywords: string;
    explanation: string;
  }>;
}> {
  return postJsonApi(
    '/api/ai/solve-practical-questions',
    params,
    'Lỗi khi gọi AI tìm code và đáp án cho câu hỏi thực hành',
    65000
  );
}

export async function requestAIGradeCode(params: {
  subjectId?: string;
  subjectName: string;
  language?: string;
  questionContent: string;
  codeSnippet?: string;
  sampleSolution?: string;
  rubricKeywords?: string;
  studentCode: string;
  maxPoints?: number;
}): Promise<{
  success: boolean;
  grading: AICodeGradingResult;
}> {
  return postJsonApi(
    '/api/ai/grade-code',
    params,
    'Lỗi khi gọi Gemini AI chấm đoạn code',
    45000
  );
}

export async function requestAIGradeAlgorithmImage(params: {
  subjectName: string;
  questionContent: string;
  sampleSolution?: string;
  rubricKeywords?: string;
  imageDataUrl: string;
  note?: string;
  maxPoints?: number;
}): Promise<{
  success: boolean;
  grading: AICodeGradingResult;
}> {
  return postJsonApi(
    '/api/ai/grade-algorithm-image',
    params,
    'Lỗi khi gọi Gemini AI chấm hình ảnh bài làm thuật toán',
    45000
  );
}



// Generate Complete MySQL 8.0 Normalized Schema Script
export function generateMySQLDump(): string {
  return `-- =====================================================================
-- TRƯỜNG ĐẠI HỌC HẢI PHÒNG - KHOA CÔNG NGHỆ THÔNG TIN
-- HỆ THỐNG ÔN TẬP TRỰC TUYẾN DÀNH CHO SINH VIÊN KHOA CNTT
-- DATABASE SCHEMA DDL & SEED SCRIPT CHO MYSQL 8.0+
-- Thiết kế chuẩn hóa 3NF, Khóa chính, Khóa ngoại, Ràng buộc RBAC & Bảng AI
-- Character Set: utf8mb4 / utf8mb4_unicode_ci | Storage Engine: InnoDB
-- =====================================================================

CREATE DATABASE IF NOT EXISTS \`it_study_db\` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE \`it_study_db\`;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Bảng users (Tài khoản người dùng và xác thực)
DROP TABLE IF EXISTS \`users\`;
CREATE TABLE \`users\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`username\` VARCHAR(50) NOT NULL UNIQUE,
  \`email\` VARCHAR(100) NOT NULL UNIQUE,
  \`password_hash\` VARCHAR(255) NOT NULL,
  \`full_name\` VARCHAR(100) NOT NULL,
  \`phone\` VARCHAR(20) DEFAULT NULL,
  \`role\` ENUM('student', 'lecturer', 'admin') NOT NULL DEFAULT 'student',
  \`status\` ENUM('active', 'locked') NOT NULL DEFAULT 'active',
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  \`last_login\` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_users_role\` (\`role\`),
  INDEX \`idx_users_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng students (Hồ sơ sinh viên)
DROP TABLE IF EXISTS \`students\`;
CREATE TABLE \`students\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`user_id\` VARCHAR(36) NOT NULL UNIQUE,
  \`student_code\` VARCHAR(20) NOT NULL UNIQUE,
  \`full_name\` VARCHAR(100) NOT NULL,
  \`phone\` VARCHAR(20) DEFAULT NULL,
  \`class_name\` VARCHAR(50) NOT NULL,
  \`major\` VARCHAR(100) NOT NULL DEFAULT 'Công nghệ Thông tin',
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bảng lecturers (Hồ sơ giảng viên)
DROP TABLE IF EXISTS \`lecturers\`;
CREATE TABLE \`lecturers\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`user_id\` VARCHAR(36) NOT NULL UNIQUE,
  \`lecturer_code\` VARCHAR(20) NOT NULL UNIQUE,
  \`full_name\` VARCHAR(100) NOT NULL,
  \`phone\` VARCHAR(20) DEFAULT NULL,
  \`department\` VARCHAR(100) NOT NULL,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng subjects (Các môn học chuyên ngành CNTT)
DROP TABLE IF EXISTS \`subjects\`;
CREATE TABLE \`subjects\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`subject_code\` VARCHAR(20) NOT NULL UNIQUE,
  \`subject_name\` VARCHAR(150) NOT NULL,
  \`description\` TEXT DEFAULT NULL,
  \`credits\` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  \`status\` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bảng lecturer_subjects (Phân công giảng viên phụ trách môn học)
DROP TABLE IF EXISTS \`lecturer_subjects\`;
CREATE TABLE \`lecturer_subjects\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`lecturer_id\` VARCHAR(36) NOT NULL,
  \`subject_id\` VARCHAR(36) NOT NULL,
  \`assigned_at\` DATE NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_lecturer_subject\` (\`lecturer_id\`, \`subject_id\`),
  FOREIGN KEY (\`lecturer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`subject_id\`) REFERENCES \`subjects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bảng chapters (Chương mục học phần)
DROP TABLE IF EXISTS \`chapters\`;
CREATE TABLE \`chapters\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`subject_id\` VARCHAR(36) NOT NULL,
  \`chapter_number\` TINYINT UNSIGNED NOT NULL,
  \`title\` VARCHAR(150) NOT NULL,
  \`description\` TEXT DEFAULT NULL,
  \`order_num\` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`subject_id\`) REFERENCES \`subjects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Bảng questions (Ngân hàng câu hỏi chính thức)
DROP TABLE IF EXISTS \`questions\`;
CREATE TABLE \`questions\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`subject_id\` VARCHAR(36) NOT NULL,
  \`chapter_id\` VARCHAR(36) NOT NULL,
  \`question_type\` ENUM('single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'essay') NOT NULL,
  \`difficulty\` ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
  \`bloom_level\` TINYINT UNSIGNED NOT NULL DEFAULT 2,
  \`content\` TEXT NOT NULL,
  \`code_snippet\` TEXT DEFAULT NULL,
  \`options_json\` JSON DEFAULT NULL,
  \`correct_answer\` TEXT NOT NULL,
  \`explanation\` TEXT NOT NULL,
  \`source_reference\` VARCHAR(255) DEFAULT NULL,
  \`points\` DECIMAL(3,1) NOT NULL DEFAULT 1.0,
  \`created_by\` VARCHAR(100) NOT NULL,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`subject_id\`) REFERENCES \`subjects\` (\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`chapter_id\`) REFERENCES \`chapters\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Bảng learning_documents (Tài liệu bài giảng, đề cương giảng viên upload)
DROP TABLE IF EXISTS \`learning_documents\`;
CREATE TABLE \`learning_documents\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`lecturer_id\` VARCHAR(36) NOT NULL,
  \`subject_id\` VARCHAR(36) NOT NULL,
  \`chapter_id\` VARCHAR(36) DEFAULT NULL,
  \`document_name\` VARCHAR(255) NOT NULL,
  \`document_type\` ENUM('pdf', 'docx', 'pptx', 'txt') NOT NULL DEFAULT 'pdf',
  \`file_path\` VARCHAR(255) NOT NULL,
  \`processing_status\` ENUM('uploaded', 'analyzing', 'analyzed', 'failed') NOT NULL DEFAULT 'uploaded',
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`lecturer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`subject_id\`) REFERENCES \`subjects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Bảng document_chapters (Cấu trúc chương bóc tách bởi AI)
DROP TABLE IF EXISTS \`document_chapters\`;
CREATE TABLE \`document_chapters\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`document_id\` VARCHAR(36) NOT NULL,
  \`chapter_number\` TINYINT UNSIGNED NOT NULL,
  \`chapter_title\` VARCHAR(200) NOT NULL,
  \`core_concepts\` JSON DEFAULT NULL,
  \`summary\` TEXT DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`document_id\`) REFERENCES \`learning_documents\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Bảng ai_generation_jobs (Nhật ký phiên tạo câu hỏi Gemini AI)
DROP TABLE IF EXISTS \`ai_generation_jobs\`;
CREATE TABLE \`ai_generation_jobs\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`lecturer_id\` VARCHAR(36) NOT NULL,
  \`subject_id\` VARCHAR(36) NOT NULL,
  \`document_id\` VARCHAR(36) NOT NULL,
  \`total_questions\` SMALLINT UNSIGNED NOT NULL,
  \`model_name\` VARCHAR(50) NOT NULL DEFAULT 'gemini-3.1-flash-lite',
  \`status\` ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'completed',
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`lecturer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`subject_id\`) REFERENCES \`subjects\` (\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`document_id\`) REFERENCES \`learning_documents\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Bảng ai_generated_questions (Vùng chờ duyệt câu hỏi do AI tạo)
DROP TABLE IF EXISTS \`ai_generated_questions\`;
CREATE TABLE \`ai_generated_questions\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`generation_job_id\` VARCHAR(36) NOT NULL,
  \`question_content\` TEXT NOT NULL,
  \`question_type\` ENUM('single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'essay') NOT NULL DEFAULT 'single_choice',
  \`difficulty\` ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium',
  \`bloom_level\` TINYINT UNSIGNED NOT NULL DEFAULT 2,
  \`correct_answer\` TEXT NOT NULL,
  \`explanation\` TEXT NOT NULL,
  \`source_reference\` VARCHAR(255) DEFAULT NULL,
  \`approval_status\` ENUM('pending_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending_review',
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`generation_job_id\`) REFERENCES \`ai_generation_jobs\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Bảng question_reviews (Lịch sử duyệt câu hỏi của giảng viên)
DROP TABLE IF EXISTS \`question_reviews\`;
CREATE TABLE \`question_reviews\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`ai_question_id\` VARCHAR(36) NOT NULL,
  \`reviewer_id\` VARCHAR(36) NOT NULL,
  \`action\` ENUM('approved', 'rejected', 'modified') NOT NULL,
  \`review_notes\` TEXT DEFAULT NULL,
  \`reviewed_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`ai_question_id\`) REFERENCES \`ai_generated_questions\` (\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`reviewer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Bảng ai_explanations (Giải thích chuyên sâu của AI cho sinh viên)
DROP TABLE IF EXISTS \`ai_explanations\`;
CREATE TABLE \`ai_explanations\` (
  \`id\` VARCHAR(36) NOT NULL,
  \`question_id\` VARCHAR(36) NOT NULL,
  \`student_id\` VARCHAR(36) NOT NULL,
  \`student_answer\` TEXT DEFAULT NULL,
  \`ai_response_json\` JSON NOT NULL,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  FOREIGN KEY (\`question_id\`) REFERENCES \`questions\` (\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`student_id\` ) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- DỮ LIỆU BAN ĐẦU (SEED DATA) CHO CÁC MÔN HỌC CHUYÊN NGÀNH CNTT
-- =====================================================================

INSERT INTO \`subjects\` (\`id\`, \`subject_code\`, \`subject_name\`, \`description\`, \`credits\`, \`status\`) VALUES
('sub_dsa', 'INF2030', 'Cấu trúc dữ liệu và giải thuật', 'Danh sách liên kết, Ngăn xếp, Hàng đợi, Cây BST, Đồ thị và giải thuật sắp xếp O(n log n).', 4, 'active'),
('sub_coa', 'INF2010', 'Tổ chức và kiến trúc máy tính', 'Kiến trúc máy tính, tập lệnh ISA, đường ống Pipelining, bộ nhớ Cache và xử lý I/O.', 3, 'active'),
('sub_intro', 'INF1001', 'Tổng quan Công nghệ thông tin và định hướng nghề nghiệp', 'Khái quát các chuyên ngành CNTT, đạo đức nghề nghiệp, luật an ninh mạng và lộ trình phát triển sự nghiệp.', 2, 'active'),
('sub_net', 'INF3080', 'Mạng máy tính và hệ thống mở', 'Mô hình OSI 7 tầng, TCP/IP, chia mạng con Subnetting/CIDR, máy chủ Linux và chuẩn hệ thống mở POSIX.', 3, 'active'),
('sub_hardware', 'INF1020', 'Lắp ráp và cài đặt máy tính', 'Linh kiện phần cứng PC, quy trình lắp ráp chống tĩnh điện ESD, BIOS/UEFI, phân vùng GPT và cài đặt HĐH.', 2, 'active');

INSERT INTO \`users\` (\`id\`, \`username\`, \`email\`, \`password_hash\`, \`full_name\`, \`role\`, \`status\`) VALUES
('usr_admin', 'admin', 'admin@dhhp.edu.vn', 'admin123', 'Nguyễn Vũ Xuân Kiên', 'admin', 'active'),
('usr_lecturer_1', 'gv_daongoctu', 'gv.daongoctu@dhhp.edu.vn', 'gv123456', 'ThS. Đào Ngọc Tú', 'lecturer', 'active'),
('usr_lecturer_2', 'gv_hoangvanlam', 'gv.hoangvanlam@dhhp.edu.vn', 'gv123456', 'ThS. Hoàng Văn Lâm', 'lecturer', 'active'),
('usr_lecturer_3', 'gv_quachduythanh', 'gv.quachduythanh@dhhp.edu.vn', 'gv123456', 'ThS. Quách Duy Thành', 'lecturer', 'active'),
('usr_lecturer_4', 'gv_daovietanh', 'gv.daovietanh@dhhp.edu.vn', 'gv123456', 'ThS. Đào Việt Anh', 'lecturer', 'active'),
('usr_lecturer_5', 'gv_nguyenhaan', 'gv.nguyenhaan@dhhp.edu.vn', 'gv123456', 'ThS. Nguyễn Hà An', 'lecturer', 'active'),
('usr_lecturer_8', 'gv_tranquoctuan', 'gv.tranquoctuan@dhhp.edu.vn', 'gv123456', 'ThS. Trần Quốc Tuấn', 'lecturer', 'active'),
('usr_lecturer_9', 'gv_nguyenthihongmai', 'gv.nguyenthihongmai@dhhp.edu.vn', 'gv123456', 'ThS. Nguyễn Thị Hồng Mai', 'lecturer', 'active'),
('usr_lecturer_10', 'gv_nguyenmanhhung', 'gv.nguyenmanhhung@dhhp.edu.vn', 'gv123456', 'ThS. Nguyễn Mạnh Hùng', 'lecturer', 'active'),
('usr_lecturer_11', 'gv_vuthison', 'gv.vuthison@dhhp.edu.vn', 'gv123456', 'ThS. Vũ Thị Sơn', 'lecturer', 'active');

INSERT INTO \`lecturer_subjects\` (\`id\`, \`lecturer_id\`, \`subject_id\`, \`assigned_at\`) VALUES
('ls_1', 'usr_lecturer_11', 'sub_dsa', '2024-01-15'),
('ls_2', 'usr_lecturer_10', 'sub_coa', '2024-01-15'),
('ls_3', 'usr_lecturer_3', 'sub_intro', '2024-01-15'),
('ls_4', 'usr_lecturer_9', 'sub_net', '2024-01-15'),
('ls_5', 'usr_lecturer_8', 'sub_hardware', '2024-01-15');
`;
}

// =========================================================================
// SEPAY PAYMENT & PER-SUBJECT EXAM ACCESS API HELPERS (10.000đ / MÔN)
// =========================================================================
export function hasUnlockedSubjectExam(user: User | null | undefined, subjectId?: string): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'lecturer') return true;
  if (!subjectId) return false;
  return Array.isArray(user.paidSubjectIds) && user.paidSubjectIds.includes(subjectId);
}

function updateLocalPaidUser(updatedUser: User) {
  const users = getUsers();
  const nextUsers = users.some(u => u.id === updatedUser.id)
    ? users.map(u => (u.id === updatedUser.id ? updatedUser : u))
    : [...users, updatedUser];
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));

  const current = getCurrentUser();
  if (current && current.id === updatedUser.id) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
  }
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const res = await requestUsersApi<{
    success: boolean;
    config: PaymentConfig;
    storageMode?: ServerStorageMode;
  }>('/api/payments/config', { method: 'GET' }, 6000);
  recordServerStorageMode(res.storageMode);
  return res.config;
}

export async function savePaymentConfig(config: Partial<PaymentConfig>): Promise<PaymentConfig> {
  const res = await requestUsersApi<{ success: boolean; config: PaymentConfig }>(
    '/api/payments/config',
    {
      method: 'PUT',
      body: JSON.stringify(config),
    },
    8000
  );
  return res.config;
}

export async function getPaymentOrders(userId?: string, subjectId?: string): Promise<ExamPaymentOrder[]> {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (subjectId) params.set('subjectId', subjectId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await requestUsersApi<{
    success: boolean;
    orders: ExamPaymentOrder[];
    storageMode?: ServerStorageMode;
  }>(
    `/api/payments/orders${query}`,
    { method: 'GET' },
    8000
  );
  recordServerStorageMode(res.storageMode);
  return res.orders || [];
}

export async function createExamPaymentOrder(
  userOrId: string | User,
  subjectId: string,
  subjectName?: string
): Promise<{
  alreadyPaid?: boolean;
  user?: User;
  order?: ExamPaymentOrder;
  config?: Partial<PaymentConfig>;
}> {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;
  const userSnapshot = typeof userOrId === 'string'
    ? getUsers().find(u => u.id === userId) || getCurrentUser() || undefined
    : userOrId;

  const res = await requestUsersApi<{
    success: boolean;
    alreadyPaid?: boolean;
    user?: User;
    order?: ExamPaymentOrder;
    config?: Partial<PaymentConfig>;
  }>(
    '/api/payments/create-order',
    {
      method: 'POST',
      body: JSON.stringify({ userId, user: userSnapshot, subjectId, subjectName }),
    },
    8000
  );
  if (res.alreadyPaid && res.user) {
    updateLocalPaidUser(res.user);
  }
  return res;
}

export async function testSepayConfig(): Promise<{
  success: boolean;
  ready: boolean;
  issues: string[];
  config: Partial<PaymentConfig>;
  sampleQrUrl: string;
}> {
  return requestUsersApi(
    '/api/payments/test-config',
    { method: 'POST', body: JSON.stringify({}) },
    8000
  );
}

export async function checkExamPaymentStatus(orderCode: string): Promise<{
  paid: boolean;
  order: ExamPaymentOrder;
  user?: User;
}> {
  const res = await requestUsersApi<{
    success: boolean;
    paid: boolean;
    order: ExamPaymentOrder;
    user?: User;
  }>(`/api/payments/status/${encodeURIComponent(orderCode)}`, { method: 'GET' }, 6000);
  if (res.paid && res.user) {
    updateLocalPaidUser(res.user);
  }
  return res;
}

export async function markExamPaymentSubmitted(orderCode: string): Promise<ExamPaymentOrder> {
  const res = await requestUsersApi<{
    success: boolean;
    order: ExamPaymentOrder;
  }>(
    '/api/payments/mark-submitted',
    {
      method: 'POST',
      body: JSON.stringify({ orderCode }),
    },
    6000
  );
  return res.order;
}

export async function adminGrantExamAccess(
  userId: string,
  subjectId: string,
  subjectName?: string,
  orderCode?: string,
  confirmedBy?: string
): Promise<{
  user: User;
  users: User[];
  orders: ExamPaymentOrder[];
}> {
  const userSnapshot = getUsers().find(u => u.id === userId) || undefined;
  const res = await requestUsersApi<{
    success: boolean;
    user: User;
    users: User[];
    orders: ExamPaymentOrder[];
    storageMode?: ServerStorageMode;
  }>(
    '/api/payments/grant-access',
    {
      method: 'POST',
      body: JSON.stringify({ userId, subjectId, subjectName, orderCode, confirmedBy, skipServerLog: true, userSnapshot }),
    },
    8000
  );
  recordServerStorageMode(res.storageMode);
  if (res.users) {
    applySyncedUsersToLocalStorage(res.users);
  } else if (res.user) {
    updateLocalPaidUser(res.user);
  }
  if (res.user && isFirebaseAdminUser(getCurrentFirebaseUser())) {
    void syncSingleUserUpdateToFirestoreAsAdmin(res.user).catch(() => {});
  }
  broadcastUsersUpdated('grant_exam_access');
  addActivityLog(
    'Xác nhận mở khóa môn thi thử (10k)',
    `${confirmedBy || 'Admin/Giảng viên'} xác nhận mở khóa môn ${subjectName || subjectId} cho ${res.user?.fullName || userId}`
  );
  return res;
}

