import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  deserializeFirestoreActivityLog,
  deserializeFirestoreUser,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeFirestoreDocId,
  serializeActivityLogForFirestore,
  serializeUserForFirestore,
} from '../firebase';
import type { ActivityLog, User } from '../types';

export function isFirebaseAdminUser(fbUser: FirebaseUser | null | undefined): boolean {
  if (!fbUser || !fbUser.emailVerified || !fbUser.email) return false;
  return fbUser.email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
}

export function getCurrentFirebaseUser(): FirebaseUser | null {
  return auth.currentUser;
}

export function subscribeFirebaseAuthState(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function signInFirebaseWithGoogle(): Promise<FirebaseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  if (isFirebaseAdminUser(cred.user)) {
    // Ensure /admins/{uid} lookup doc exists for bootstrapped admin
    const adminPath = `admins/${cred.user.uid}`;
    try {
      const adminRef = doc(db, 'admins', cred.user.uid);
      const snap = await getDoc(adminRef);
      if (!snap.exists()) {
        await setDoc(adminRef, {
          uid: cred.user.uid,
          email: (cred.user.email || BOOTSTRAPPED_ADMIN_EMAIL).toLowerCase(),
          fullName: (cred.user.displayName || 'Nguyễn Vũ Xuân Kiên').slice(0, 120),
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, adminPath);
    }
  }
  return cred.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function fetchOwnUserFromFirestore(fbUser: FirebaseUser): Promise<User | null> {
  const path = `users/${fbUser.uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', fbUser.uid));
    if (!snap.exists()) return null;
    return deserializeFirestoreUser(snap.data(), snap.id).user;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function registerOrUpdateStudentInFirestore(
  fbUser: FirebaseUser,
  student: User
): Promise<User> {
  const docId = sanitizeFirestoreDocId(fbUser.uid);
  const path = `users/${docId}`;
  const docRef = doc(db, 'users', docId);

  let existingSnap;
  try {
    existingSnap = await getDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existingSnap.exists()) {
    const payload = serializeUserForFirestore(
      {
        ...student,
        id: docId,
        authUid: fbUser.uid,
        email: fbUser.email || student.email,
      },
      {
        isCreate: true,
        authUid: fbUser.uid,
        isSelfStudentCreate: !isFirebaseAdminUser(fbUser),
      }
    );
    try {
      await setDoc(docRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    try {
      const fresh = await getDoc(docRef);
      if (fresh.exists()) {
        return deserializeFirestoreUser(fresh.data(), fresh.id).user;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    return { ...student, id: docId, authUid: fbUser.uid };
  }

  const existing = deserializeFirestoreUser(existingSnap.data(), existingSnap.id);
  const safeUpdatePayload: Record<string, unknown> = {
    fullName: String(student.fullName || existing.user.fullName).trim().slice(0, 120),
    phone: String(student.phone ?? existing.user.phone ?? '').trim().slice(0, 25),
    className: String(student.className ?? existing.user.className ?? '').trim().slice(0, 60),
    major: String(student.major ?? existing.user.major ?? 'Công nghệ Thông tin').trim().slice(0, 120),
    lastLogin: new Date().toISOString().slice(0, 64),
    updatedAt: serverTimestamp(),
  };
  if (student.studentCode && student.studentCode.trim()) {
    safeUpdatePayload.studentCode = student.studentCode.trim().replace(/[^a-zA-Z0-9_.\-]/g, '').slice(0, 25);
  }

  try {
    await updateDoc(docRef, safeUpdatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  try {
    const fresh = await getDoc(docRef);
    if (fresh.exists()) {
      return deserializeFirestoreUser(fresh.data(), fresh.id).user;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  return existing.user;
}

export async function fetchAllUsersAndDeletedFromFirestoreAsAdmin(): Promise<{
  users: User[];
  deletedIds: string[];
}> {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser)) {
    return { users: [], deletedIds: [] };
  }

  let users: User[] = [];
  let deletedIds: string[] = [];

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    users = usersSnap.docs.map((d) => deserializeFirestoreUser(d.data(), d.id).user);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }

  try {
    const delSnap = await getDocs(collection(db, 'deleted_users'));
    deletedIds = delSnap.docs.map((d) => String(d.data()?.userId || d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'deleted_users');
  }

  return { users, deletedIds };
}

export async function fetchDeletedUserIdsFromFirestoreAsAdmin(): Promise<string[]> {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser)) {
    return [];
  }
  try {
    const delSnap = await getDocs(collection(db, 'deleted_users'));
    return delSnap.docs.map((d) => String(d.data()?.userId || d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'deleted_users');
  }
}

export async function pushUsersToFirestoreAsAdmin(
  usersToPush: User[],
  deletedIdsToRecord: string[] = []
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser) || !fbUser) return;

  let existingDocsMap = new Map<string, { user: User; rawCreatedAt?: Timestamp }>();
  let existingDeletedSet = new Set<string>();

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.docs.forEach((d) => {
      existingDocsMap.set(d.id, deserializeFirestoreUser(d.data(), d.id));
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }

  try {
    const delSnap = await getDocs(collection(db, 'deleted_users'));
    delSnap.docs.forEach((d) => existingDeletedSet.add(String(d.data()?.userId || d.id)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'deleted_users');
  }

  let batch = writeBatch(db);
  let opCount = 0;

  const commitAndResetBatch = async () => {
    if (opCount === 0) return;
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
    batch = writeBatch(db);
    opCount = 0;
  };

  for (const rawDelId of deletedIdsToRecord) {
    const delId = sanitizeFirestoreDocId(rawDelId);
    if (!existingDeletedSet.has(delId)) {
      batch.set(doc(db, 'deleted_users', delId), {
        userId: delId,
        deletedByUid: fbUser.uid,
        deletedAt: serverTimestamp(),
      });
      opCount++;
    }
    if (existingDocsMap.has(delId)) {
      batch.delete(doc(db, 'users', delId));
      opCount++;
    }
    if (opCount >= 400) {
      await commitAndResetBatch();
    }
  }

  for (const u of usersToPush) {
    const docId = sanitizeFirestoreDocId(u.id);
    if (existingDeletedSet.has(docId) || deletedIdsToRecord.includes(u.id)) {
      continue;
    }

    const existingEntry = existingDocsMap.get(docId);
    if (!existingEntry) {
      const payload = serializeUserForFirestore(u, { isCreate: true });
      batch.set(doc(db, 'users', docId), payload);
      opCount++;
    } else {
      const localUpdated = Date.parse(u.updatedAt || u.lastLogin || '') || 0;
      const fsUpdated = Date.parse(existingEntry.user.updatedAt || existingEntry.user.lastLogin || '') || 0;
      const paidMismatch =
        (u.paidSubjectIds?.length || 0) !== (existingEntry.user.paidSubjectIds?.length || 0) ||
        u.status !== existingEntry.user.status ||
        u.fullName !== existingEntry.user.fullName;

      if (localUpdated > fsUpdated || paidMismatch) {
        const mergedPaid = Array.from(
          new Set([...(existingEntry.user.paidSubjectIds || []), ...(u.paidSubjectIds || [])])
        );
        const payload = serializeUserForFirestore(
          {
            ...existingEntry.user,
            ...u,
            username: existingEntry.user.username, // immutable in rules
            paidSubjectIds: mergedPaid,
            hasPaidExamAccess: Boolean(existingEntry.user.hasPaidExamAccess || u.hasPaidExamAccess || mergedPaid.length > 0),
          },
          {
            isCreate: false,
            existingCreatedAt: existingEntry.rawCreatedAt,
          }
        );
        // Strip immutable keys before update
        delete payload.id;
        delete payload.username;
        delete payload.createdAt;
        batch.update(doc(db, 'users', docId), payload);
        opCount++;
      }
    }

    if (opCount >= 400) {
      await commitAndResetBatch();
    }
  }

  await commitAndResetBatch();
}

export async function syncSingleUserUpdateToFirestoreAsAdmin(user: User): Promise<void> {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser)) return;

  const docId = sanitizeFirestoreDocId(user.id);
  const path = `users/${docId}`;
  const ref = doc(db, 'users', docId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const payload = serializeUserForFirestore(user, { isCreate: true });
      await setDoc(ref, payload);
    } else {
      const existing = deserializeFirestoreUser(snap.data(), snap.id);
      const payload = serializeUserForFirestore(
        {
          ...existing.user,
          ...user,
          username: existing.user.username,
        },
        {
          isCreate: false,
          existingCreatedAt: existing.rawCreatedAt,
        }
      );
      delete payload.id;
      delete payload.username;
      delete payload.createdAt;
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserFromFirestoreAsAdmin(userId: string): Promise<void> {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser) || !fbUser) return;

  const docId = sanitizeFirestoreDocId(userId);
  try {
    await setDoc(doc(db, 'deleted_users', docId), {
      userId: docId,
      deletedByUid: fbUser.uid,
      deletedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `deleted_users/${docId}`);
  }

  try {
    const ref = doc(db, 'users', docId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${docId}`);
  }
}

export function subscribeUsersFirestoreAsAdmin(
  onUsers: (users: User[], removedIds: string[]) => void,
  onError?: (err: Error) => void
): () => void {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser)) {
    return () => {};
  }

  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs.map((d) => deserializeFirestoreUser(d.data(), d.id).user);
      const removedIds = snapshot
        .docChanges()
        .filter((change) => change.type === 'removed')
        .map((change) => change.doc.id);
      onUsers(list, removedIds);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    }
  );
}

export function subscribeOwnUserDocFirestore(
  fbUser: FirebaseUser,
  onUser: (user: User | null) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${fbUser.uid}`;
  return onSnapshot(
    doc(db, 'users', fbUser.uid),
    (snap) => {
      if (!snap.exists()) {
        onUser(null);
        return;
      }
      onUser(deserializeFirestoreUser(snap.data(), snap.id).user);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    }
  );
}

// =========================================================================
// ACTIVITY / AUDIT LOGS FIRESTORE SYNC (/activity_logs)
// =========================================================================

export async function createActivityLogInFirestore(
  fbUser: FirebaseUser,
  log: ActivityLog
): Promise<void> {
  if (!fbUser || !fbUser.emailVerified) return;
  const isAdmin = isFirebaseAdminUser(fbUser);
  if (!isAdmin && log.userRole !== 'student') return;

  const docId = sanitizeFirestoreDocId(log.id);
  const path = `activity_logs/${docId}`;
  try {
    const payload = serializeActivityLogForFirestore(
      { ...log, id: docId },
      fbUser.uid
    );
    await setDoc(doc(db, 'activity_logs', docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchActivityLogsFromFirestoreAsAdmin(): Promise<ActivityLog[]> {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser)) {
    return [];
  }

  try {
    const q = query(
      collection(db, 'activity_logs'),
      orderBy('createdAt', 'desc'),
      limit(250)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => deserializeFirestoreActivityLog(d.data(), d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'activity_logs');
  }
}

export async function pushActivityLogsToFirestoreAsAdmin(
  logsToPush: ActivityLog[]
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser) || !fbUser || logsToPush.length === 0) return;

  const existingIds = new Set<string>();
  try {
    const snap = await getDocs(query(collection(db, 'activity_logs'), limit(300)));
    snap.docs.forEach((d) => existingIds.add(d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'activity_logs');
  }

  let batch = writeBatch(db);
  let opCount = 0;

  for (const log of logsToPush.slice(0, 150)) {
    const docId = sanitizeFirestoreDocId(log.id);
    if (existingIds.has(docId)) continue;
    existingIds.add(docId);

    const payload = serializeActivityLogForFirestore(
      { ...log, id: docId },
      fbUser.uid
    );
    batch.set(doc(db, 'activity_logs', docId), payload);
    opCount++;

    if (opCount >= 400) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'activity_logs');
      }
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'activity_logs');
    }
  }
}

export function subscribeActivityLogsFirestoreAsAdmin(
  onLogs: (logs: ActivityLog[]) => void,
  onError?: (err: Error) => void
): () => void {
  const fbUser = auth.currentUser;
  if (!isFirebaseAdminUser(fbUser)) {
    return () => {};
  }

  const path = 'activity_logs';
  const q = query(
    collection(db, path),
    orderBy('createdAt', 'desc'),
    limit(250)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => deserializeFirestoreActivityLog(d.data(), d.id));
      onLogs(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    }
  );
}
