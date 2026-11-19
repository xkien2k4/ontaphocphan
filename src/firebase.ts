import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { ActivityLog, User } from './types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'nguyenvxkien@gmail.com';

// Initialize Firebase App and named Firestore database from firebase-applet-config.json
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { firebaseConfig };

// Startup connectivity probe against Firestore database
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.', error);
      return false;
    }
    // permission-denied or not-found still proves live connectivity to Firestore server
    return true;
  }
}

void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Defensive helpers synchronized with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const BLUEPRINT_USERNAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;
export const BLUEPRINT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const BLUEPRINT_CODE_REGEX = /^[a-zA-Z0-9_.\-]*$/;

export function sanitizeFirestoreDocId(raw: string): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length >= 3 ? cleaned : `usr_${cleaned}_${Date.now()}`.slice(0, 128);
}

export function serializeUserForFirestore(
  user: User,
  options: {
    isCreate: boolean;
    authUid?: string;
    existingCreatedAt?: Timestamp;
    isSelfStudentCreate?: boolean;
  }
): Record<string, unknown> {
  const cleanId = sanitizeFirestoreDocId(user.id);
  const cleanUsername = String(user.username || user.studentCode || cleanId)
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_.\-]/g, '_')
    .slice(0, 64);
  const cleanEmail = String(user.email || `${cleanUsername}@dhhp.edu.vn`)
    .trim()
    .toLowerCase()
    .slice(0, 150);
  const safeEmail = BLUEPRINT_EMAIL_REGEX.test(cleanEmail)
    ? cleanEmail
    : `${cleanUsername || 'user'}@dhhp.edu.vn`.slice(0, 150);
  const cleanFullName = String(user.fullName || cleanUsername || 'Sinh viên').trim().slice(0, 120);

  const payload: Record<string, unknown> = {
    id: cleanId,
    username: cleanUsername.length >= 2 ? cleanUsername : `u_${cleanUsername || 'sv'}`,
    email: safeEmail,
    fullName: cleanFullName.length >= 2 ? cleanFullName : 'Sinh viên CNTT',
    role: options.isSelfStudentCreate ? 'student' : user.role,
    status: options.isSelfStudentCreate ? 'active' : user.status,
    createdAt: options.isCreate || !options.existingCreatedAt ? serverTimestamp() : options.existingCreatedAt,
    updatedAt: serverTimestamp(),
  };

  const resolvedAuthUid = (options.authUid || user.authUid || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  if (resolvedAuthUid) {
    payload.authUid = resolvedAuthUid;
  }

  if (typeof user.phone === 'string' && user.phone.trim()) {
    payload.phone = user.phone.trim().slice(0, 25);
  }
  if (typeof user.studentCode === 'string' && user.studentCode.trim()) {
    const cleanStu = user.studentCode.trim().replace(/[^a-zA-Z0-9_.\-]/g, '').slice(0, 25);
    if (cleanStu) payload.studentCode = cleanStu;
  }
  if (!options.isSelfStudentCreate && typeof user.lecturerCode === 'string' && user.lecturerCode.trim()) {
    const cleanLec = user.lecturerCode.trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20);
    if (cleanLec) payload.lecturerCode = cleanLec;
  }
  if (typeof user.className === 'string' && user.className.trim()) {
    payload.className = user.className.trim().slice(0, 60);
  }
  if (!options.isSelfStudentCreate && typeof user.department === 'string' && user.department.trim()) {
    payload.department = user.department.trim().slice(0, 120);
  }
  if (typeof user.major === 'string' && user.major.trim()) {
    payload.major = user.major.trim().slice(0, 120);
  }
  if (!options.isSelfStudentCreate && Array.isArray(user.assignedSubjectIds)) {
    payload.assignedSubjectIds = user.assignedSubjectIds.map(String).slice(0, 50);
  }

  if (options.isSelfStudentCreate) {
    payload.paidSubjectIds = [];
    payload.hasPaidExamAccess = false;
  } else {
    if (Array.isArray(user.paidSubjectIds)) {
      payload.paidSubjectIds = user.paidSubjectIds.map(String).slice(0, 100);
    }
    if (typeof user.hasPaidExamAccess === 'boolean') {
      payload.hasPaidExamAccess = user.hasPaidExamAccess;
    }
    if (typeof user.examAccessPaidAt === 'string' && user.examAccessPaidAt.trim()) {
      payload.examAccessPaidAt = user.examAccessPaidAt.trim().slice(0, 64);
    }
    if (typeof user.examAccessOrderCode === 'string' && user.examAccessOrderCode.trim()) {
      const cleanOrderCode = user.examAccessOrderCode.trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64);
      if (cleanOrderCode) payload.examAccessOrderCode = cleanOrderCode;
    }
  }

  if (typeof user.lastLogin === 'string' && user.lastLogin.trim()) {
    payload.lastLogin = user.lastLogin.trim().slice(0, 64);
  }

  return payload;
}

export function deserializeFirestoreUser(data: Record<string, any>, fallbackId: string): {
  user: User;
  rawCreatedAt?: Timestamp;
} {
  const toIso = (val: unknown): string | undefined => {
    if (!val) return undefined;
    if (val instanceof Timestamp) return val.toDate().toISOString();
    if (typeof (val as any)?.toDate === 'function') return (val as any).toDate().toISOString();
    if (typeof val === 'string') return val;
    return undefined;
  };

  const user: User = {
    id: String(data.id || fallbackId),
    authUid: typeof data.authUid === 'string' ? data.authUid : undefined,
    username: String(data.username || fallbackId),
    email: String(data.email || ''),
    fullName: String(data.fullName || 'Người dùng'),
    role: data.role === 'admin' || data.role === 'lecturer' ? data.role : 'student',
    status: data.status === 'locked' ? 'locked' : 'active',
    phone: typeof data.phone === 'string' ? data.phone : undefined,
    studentCode: typeof data.studentCode === 'string' ? data.studentCode : undefined,
    lecturerCode: typeof data.lecturerCode === 'string' ? data.lecturerCode : undefined,
    className: typeof data.className === 'string' ? data.className : undefined,
    department: typeof data.department === 'string' ? data.department : undefined,
    major: typeof data.major === 'string' ? data.major : undefined,
    assignedSubjectIds: Array.isArray(data.assignedSubjectIds) ? data.assignedSubjectIds.map(String) : undefined,
    paidSubjectIds: Array.isArray(data.paidSubjectIds) ? data.paidSubjectIds.map(String) : undefined,
    hasPaidExamAccess: typeof data.hasPaidExamAccess === 'boolean' ? data.hasPaidExamAccess : undefined,
    examAccessPaidAt: typeof data.examAccessPaidAt === 'string' ? data.examAccessPaidAt : undefined,
    examAccessOrderCode: typeof data.examAccessOrderCode === 'string' ? data.examAccessOrderCode : undefined,
    lastLogin: typeof data.lastLogin === 'string' ? data.lastLogin : undefined,
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) || new Date().toISOString(),
  };

  return {
    user,
    rawCreatedAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
  };
}

export function serializeActivityLogForFirestore(
  log: ActivityLog,
  authUid?: string
): Record<string, unknown> {
  const cleanId = sanitizeFirestoreDocId(log.id || `log_${Date.now()}`);
  const cleanUserId =
    String(log.userId || 'guest')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .slice(0, 128) || 'guest';
  const cleanRole: 'student' | 'lecturer' | 'admin' =
    log.userRole === 'admin' || log.userRole === 'lecturer' ? log.userRole : 'student';

  const payload: Record<string, unknown> = {
    id: cleanId,
    userId: cleanUserId,
    userName: String(log.userName || 'Người dùng').trim().slice(0, 150) || 'Người dùng',
    userRole: cleanRole,
    action: String(log.action || 'Hoạt động hệ thống').trim().slice(0, 120) || 'Hoạt động hệ thống',
    target: String(log.target || '-').trim().slice(0, 400) || '-',
    timestamp: String(log.timestamp || new Date().toISOString()).slice(0, 64),
    ipAddress: String(log.ipAddress || '127.0.0.1').trim().slice(0, 64) || '127.0.0.1',
    createdAt: serverTimestamp(),
  };

  const cleanAuthUid = (authUid || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  if (cleanAuthUid) {
    payload.authUid = cleanAuthUid;
  }

  return payload;
}

export function deserializeFirestoreActivityLog(
  data: Record<string, any>,
  fallbackId: string
): ActivityLog {
  let timestamp = typeof data.timestamp === 'string' && data.timestamp ? data.timestamp : '';
  if (!timestamp && data.createdAt instanceof Timestamp) {
    timestamp = data.createdAt.toDate().toISOString();
  } else if (!timestamp && typeof data.createdAt?.toDate === 'function') {
    timestamp = data.createdAt.toDate().toISOString();
  }
  return {
    id: String(data.id || fallbackId),
    userId: String(data.userId || 'guest'),
    userName: String(data.userName || 'Người dùng'),
    userRole: data.userRole === 'admin' || data.userRole === 'lecturer' ? data.userRole : 'student',
    action: String(data.action || 'Hoạt động hệ thống'),
    target: String(data.target || ''),
    timestamp: timestamp || new Date().toISOString(),
    ipAddress: String(data.ipAddress || '127.0.0.1'),
  };
}
