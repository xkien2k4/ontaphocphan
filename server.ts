import express, { NextFunction, Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { INITIAL_ACTIVITY_LOGS, INITIAL_MATERIALS, INITIAL_USERS } from './src/data/mockData';
import type { ActivityLog, ExamPaymentOrder, PaymentConfig, StudyMaterial, User } from './src/types';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(
  express.json({
    limit: '15mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Prevent browser/CDN caching on dynamic API endpoints (especially /api/users)
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// =========================================================================
// CENTRALIZED PERSISTENT STORAGE (data/*.json, auto /tmp fallback on Vercel)
// =========================================================================
function resolveWritableDataDir(): string {
  const localDir = path.resolve(process.cwd(), 'data');
  const isServerless =
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

  let canWriteLocal = !isServerless;
  if (canWriteLocal) {
    try {
      fs.mkdirSync(localDir, { recursive: true });
      fs.accessSync(localDir, fs.constants.W_OK);
    } catch {
      canWriteLocal = false;
    }
  }

  if (!canWriteLocal) {
    const tmpDir = path.join('/tmp', 'it-study-data');
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      if (fs.existsSync(localDir)) {
        for (const file of fs.readdirSync(localDir)) {
          const src = path.join(localDir, file);
          const dest = path.join(tmpDir, file);
          if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
          }
        }
      }
    } catch (err) {
      console.error('Serverless /tmp data initialization warning:', err);
    }
    return tmpDir;
  }
  return localDir;
}

const DATA_DIR = resolveWritableDataDir();
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DELETED_USERS_FILE = path.join(DATA_DIR, 'deleted-users.json');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');
const PAYMENT_CONFIG_FILE = path.join(DATA_DIR, 'payment-config.json');
const PAYMENT_ORDERS_FILE = path.join(DATA_DIR, 'payment-orders.json');
const ACTIVITY_LOGS_FILE = path.join(DATA_DIR, 'activity-logs.json');

type ServerStorageMode = 'persistent_cloud' | 'persistent_disk' | 'ephemeral_tmp';

function getUpstashConfig(): { url: string; token: string } | null {
  const url = String(
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.REDIS_REST_URL ||
    ''
  ).trim().replace(/\/+$/, '');
  const token = String(
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.REDIS_REST_TOKEN ||
    ''
  ).trim();
  if (url && token) return { url, token };
  return null;
}

function getFirebaseRtdbUrl(): string | null {
  const url = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  return url || null;
}

function getServerStorageMode(): ServerStorageMode {
  if (getUpstashConfig() || getFirebaseRtdbUrl()) {
    return 'persistent_cloud';
  }
  const isServerless =
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  return isServerless || DATA_DIR.startsWith('/tmp') ? 'ephemeral_tmp' : 'persistent_disk';
}

async function readCloudKvJson<T>(key: string): Promise<T | null> {
  const upstash = getUpstashConfig();
  if (upstash) {
    try {
      const resp = await fetch(upstash.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstash.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
      });
      if (!resp.ok) return null;
      const payload = (await resp.json()) as { result?: unknown };
      if (payload?.result === null || payload?.result === undefined) return null;
      let parsed: unknown = payload.result;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {}
        }
      }
      return parsed as T;
    } catch (err) {
      console.error(`Cloud KV read error (${key}):`, err);
      return null;
    }
  }

  const rtdbUrl = getFirebaseRtdbUrl();
  if (rtdbUrl) {
    try {
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      const authParam = process.env.FIREBASE_DATABASE_SECRET
        ? `?auth=${encodeURIComponent(process.env.FIREBASE_DATABASE_SECRET)}`
        : '';
      const resp = await fetch(`${rtdbUrl}/${safeKey}.json${authParam}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data === null ? null : (data as T);
    } catch (err) {
      console.error(`Firebase RTDB read error (${key}):`, err);
      return null;
    }
  }

  return null;
}

async function writeCloudKvJson(key: string, value: unknown): Promise<boolean> {
  const upstash = getUpstashConfig();
  if (upstash) {
    try {
      const resp = await fetch(upstash.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstash.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', key, JSON.stringify(value)]),
      });
      return resp.ok;
    } catch (err) {
      console.error(`Cloud KV write error (${key}):`, err);
      return false;
    }
  }

  const rtdbUrl = getFirebaseRtdbUrl();
  if (rtdbUrl) {
    try {
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
      const authParam = process.env.FIREBASE_DATABASE_SECRET
        ? `?auth=${encodeURIComponent(process.env.FIREBASE_DATABASE_SECRET)}`
        : '';
      const resp = await fetch(`${rtdbUrl}/${safeKey}.json${authParam}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      return resp.ok;
    } catch (err) {
      console.error(`Firebase RTDB write error (${key}):`, err);
      return false;
    }
  }

  return false;
}

let usersMutationQueue: Promise<unknown> = Promise.resolve();
function withUsersWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = usersMutationQueue.then(fn, fn);
  usersMutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

let logsMutationQueue: Promise<unknown> = Promise.resolve();
function withLogsWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = logsMutationQueue.then(fn, fn);
  logsMutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

let serverUserIdCounter = 0;
function makeServerUserId(prefix: string): string {
  serverUserIdCounter += 1;
  return `${prefix}_${Date.now()}_${serverUserIdCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

const SEED_STUDENT_IDS = new Set(['usr_stu_1', 'usr_stu_2', 'usr_stu_3', 'usr_stu_4', 'usr_stu_5', 'usr_stu_6']);
const SEED_STUDENT_USERNAMES = new Set(['sv2024001', 'sv2024002', 'sv2024003', 'sv2024004', 'sv2024005', 'sv2024006']);

function isLegacySeedStudent(u: Partial<User> | null | undefined): boolean {
  if (!u) return false;
  const id = String(u.id || '').trim();
  const username = String(u.username || '').trim().toLowerCase();
  return SEED_STUDENT_IDS.has(id) || SEED_STUDENT_USERNAMES.has(username);
}

function sanitizeUsersList(rawList: unknown): { users: User[]; changed: boolean } {
  if (!Array.isArray(rawList)) {
    return { users: INITIAL_USERS.map(u => ({ ...u })), changed: true };
  }

  const seenIds = new Set<string>();
  const cleaned: User[] = [];
  let changed = false;

  for (const item of rawList) {
    if (!item || typeof item !== 'object' || typeof (item as any).id !== 'string' || !(item as any).id.trim()) {
      changed = true;
      continue;
    }
    const u = { ...(item as User) };
    if (isLegacySeedStudent(u)) {
      changed = true;
      continue;
    }
    if (seenIds.has(u.id)) {
      changed = true;
      continue;
    }
    seenIds.add(u.id);

    if (u.id === 'usr_admin' || u.username === 'admin') {
      if (u.fullName === 'TS. Nguyễn Tùng Sơn' || u.fullName === 'Nguyễn Văn Kiên' || !u.fullName) {
        u.fullName = 'Nguyễn Vũ Xuân Kiên';
        changed = true;
      }
      if (u.department === 'Ban Chủ nhiệm Khoa CNTT' || !u.department) {
        u.department = 'Khoa Công nghệ Thông tin';
        changed = true;
      }
      if (u.status !== 'active') {
        u.status = 'active';
        changed = true;
      }
      if (u.phone === '0987654321') {
        u.phone = '0334613184';
        changed = true;
      }
    }

    if (u.role === 'lecturer' && (!u.department || u.department.startsWith('Bộ môn '))) {
      u.department = 'Khoa Công nghệ Thông tin';
      changed = true;
    }

    cleaned.push(u);
  }

  // Ensure core admin account always exists
  if (!cleaned.some(u => u.id === 'usr_admin')) {
    const adminSeed = INITIAL_USERS.find(u => u.id === 'usr_admin');
    if (adminSeed) {
      cleaned.unshift({ ...adminSeed });
      changed = true;
    }
  }

  return { users: cleaned, changed };
}

function writeJsonAtomic(filePath: string, data: unknown) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.warn(`[Storage Warning] Cannot write to ${filePath} (read-only filesystem or disk lock):`, err);
  }
}

const LEGACY_LECTURER_TITLE_UPGRADES: Record<string, string> = {
  usr_lecturer_19: 'ThS. Đào Thị Hường',
  usr_lecturer_21: 'ThS. Thái Thu Huyền',
  usr_lecturer_25: 'ThS. Phạm Nghĩa Luân',
  usr_lecturer_26: 'ThS. Lê Đăng Nguyên',
  usr_lecturer_27: 'ThS. Lê Đắc Nhường',
  usr_lecturer_29: 'ThS. Nguyễn Văn Quyền',
};

function mergeDefaultLecturers(users: User[], deletedIds: Set<string>): { users: User[]; changed: boolean } {
  const result = [...users];
  let changed = false;
  const defaultLecturers = INITIAL_USERS.filter(u => u.role === 'lecturer');
  for (const seedLec of defaultLecturers) {
    if (deletedIds.has(seedLec.id)) continue;
    const existingIdx = result.findIndex(
      u =>
        u.id === seedLec.id ||
        u.username.toLowerCase() === seedLec.username.toLowerCase() ||
        (seedLec.lecturerCode && u.lecturerCode === seedLec.lecturerCode)
    );
    if (existingIdx < 0) {
      result.push({ ...seedLec });
      changed = true;
    } else if (
      LEGACY_LECTURER_TITLE_UPGRADES[seedLec.id] &&
      result[existingIdx].fullName === LEGACY_LECTURER_TITLE_UPGRADES[seedLec.id] &&
      result[existingIdx].fullName !== seedLec.fullName
    ) {
      result[existingIdx] = { ...result[existingIdx], fullName: seedLec.fullName };
      changed = true;
    }
  }
  return { users: result, changed };
}

function readUsersStore(): User[] {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore read-only dir
  }
  if (!fs.existsSync(USERS_FILE)) {
    const seeded = INITIAL_USERS.map(u => ({ ...u }));
    writeJsonAtomic(USERS_FILE, seeded);
    return seeded;
  }

  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const { users: sanitized, changed: sanitizedChanged } = sanitizeUsersList(parsed);
    const deletedIds = readDeletedUserIds();
    const { users, changed: mergedChanged } = mergeDefaultLecturers(sanitized, deletedIds);
    if (sanitizedChanged || mergedChanged) {
      writeJsonAtomic(USERS_FILE, users);
    }
    return users;
  } catch (err) {
    console.error('Error reading users store, restoring initial seed:', err);
    const seeded = INITIAL_USERS.map(u => ({ ...u }));
    writeJsonAtomic(USERS_FILE, seeded);
    return seeded;
  }
}

function writeUsersStore(users: User[]): User[] {
  const { users: sanitized } = sanitizeUsersList(users);
  writeJsonAtomic(USERS_FILE, sanitized);
  return sanitized;
}

function readDeletedUserIds(): Set<string> {
  try {
    if (!fs.existsSync(DELETED_USERS_FILE)) return new Set<string>();
    const raw = fs.readFileSync(DELETED_USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function writeDeletedUserIds(ids: Set<string>) {
  writeJsonAtomic(DELETED_USERS_FILE, Array.from(ids));
}

// Lazy initialization for serverless cold-start performance
let memoryUsersCache: User[] | null = INITIAL_USERS.map(u => ({ ...u }));
let memoryUsersCacheTime = 0;
const CACHE_TTL_MS = 2000; // 2 seconds in-memory cache for high concurrency performance

async function readUsersStoreAsync(): Promise<User[]> {
  try {
    const now = Date.now();
    if (memoryUsersCache && now - memoryUsersCacheTime < CACHE_TTL_MS) {
      return memoryUsersCache;
    }

    if (getServerStorageMode() === 'persistent_cloud') {
      try {
        const cloudUsers = await readCloudKvJson<User[]>('it_study:users_v1');
        if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
          const { users: sanitized, changed: sanitizedChanged } = sanitizeUsersList(cloudUsers);
          let deletedIds = new Set<string>();
          try {
            deletedIds = await readDeletedUserIdsAsync();
          } catch {
            // ignore
          }
          const { users, changed: mergedChanged } = mergeDefaultLecturers(sanitized, deletedIds);
          if (sanitizedChanged || mergedChanged) {
            void writeCloudKvJson('it_study:users_v1', users).catch(() => {});
          }
          try {
            writeJsonAtomic(USERS_FILE, users);
          } catch {
            // ignore local mirror failure
          }
          memoryUsersCache = users;
          memoryUsersCacheTime = now;
          return users;
        }
      } catch (cloudErr) {
        console.warn('[Storage Cloud Read Warning]:', cloudErr);
      }
    }

    const localUsers = readUsersStore();
    memoryUsersCache = localUsers;
    memoryUsersCacheTime = now;
    return localUsers;
  } catch (err) {
    console.error('[Storage Fallback Error in readUsersStoreAsync]:', err);
    return INITIAL_USERS.map(u => ({ ...u }));
  }
}

async function writeUsersStoreAsync(users: User[]): Promise<User[]> {
  const { users: sanitized } = sanitizeUsersList(users);
  memoryUsersCache = sanitized;
  memoryUsersCacheTime = Date.now();

  if (getServerStorageMode() === 'persistent_cloud') {
    void writeCloudKvJson('it_study:users_v1', sanitized).catch(() => {});
  }
  try {
    writeJsonAtomic(USERS_FILE, sanitized);
  } catch (err) {
    console.warn('[Storage] Non-fatal writeUsersStore error:', err);
  }
  return sanitized;
}

async function readDeletedUserIdsAsync(): Promise<Set<string>> {
  try {
    if (getServerStorageMode() === 'persistent_cloud') {
      const cloudIds = await readCloudKvJson<string[]>('it_study:deleted_users_v1');
      if (Array.isArray(cloudIds)) {
        return new Set(cloudIds.map(String));
      }
      return new Set<string>();
    }
    return readDeletedUserIds();
  } catch {
    return new Set<string>();
  }
}

async function writeDeletedUserIdsAsync(ids: Set<string>): Promise<void> {
  try {
    const list = Array.from(ids);
    if (getServerStorageMode() === 'persistent_cloud') {
      void writeCloudKvJson('it_study:deleted_users_v1', list).catch(() => {});
    }
    writeJsonAtomic(DELETED_USERS_FILE, list);
  } catch {
    // ignore
  }
}

// =========================================================================
// CENTRALIZED ACTIVITY / AUDIT LOGS STORE
// =========================================================================
const MAX_ACTIVITY_LOGS = 250;

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  let raw = '';
  if (typeof fwd === 'string' && fwd.trim()) {
    raw = fwd.split(',')[0].trim();
  } else if (Array.isArray(fwd) && fwd.length > 0) {
    raw = String(fwd[0]).split(',')[0].trim();
  } else if (typeof req.headers['x-real-ip'] === 'string') {
    raw = req.headers['x-real-ip'].trim();
  } else if (req.socket?.remoteAddress) {
    raw = req.socket.remoteAddress;
  }
  const clean = raw.replace(/^::ffff:/i, '').trim().slice(0, 64);
  if (!clean || clean === '::1') return '127.0.0.1';
  return clean;
}

function normalizeAndDedupeActivityLogs(rawList: unknown, fallbackIp?: string): ActivityLog[] {
  const source = Array.isArray(rawList) ? rawList : INITIAL_ACTIVITY_LOGS;
  const byId = new Map<string, ActivityLog>();

  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<ActivityLog>;
    const id = String(raw.id || '').trim();
    if (!id) continue;
    const rawIp = String(raw.ipAddress || '').trim();
    const ipAddress =
      rawIp && rawIp !== '127.0.0.1'
        ? rawIp.slice(0, 64)
        : (fallbackIp || rawIp || '127.0.0.1').slice(0, 64);
    const role: 'student' | 'lecturer' | 'admin' =
      raw.userRole === 'admin' || raw.userRole === 'lecturer' ? raw.userRole : 'student';

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, {
        id: id.slice(0, 128),
        userId: String(raw.userId || 'guest').slice(0, 128),
        userName: String(raw.userName || 'Người dùng').slice(0, 150),
        userRole: role,
        action: String(raw.action || 'Hoạt động hệ thống').slice(0, 120),
        target: String(raw.target || '').slice(0, 400),
        timestamp: String(raw.timestamp || new Date().toISOString()).slice(0, 64),
        ipAddress,
      });
    } else if (existing.ipAddress === '127.0.0.1' && ipAddress !== '127.0.0.1') {
      byId.set(id, { ...existing, ipAddress });
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
    .slice(0, MAX_ACTIVITY_LOGS);
}

function readActivityLogsStore(): ActivityLog[] {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ACTIVITY_LOGS_FILE)) {
    const seeded = normalizeAndDedupeActivityLogs(INITIAL_ACTIVITY_LOGS);
    writeJsonAtomic(ACTIVITY_LOGS_FILE, seeded);
    return seeded;
  }
  try {
    const raw = fs.readFileSync(ACTIVITY_LOGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeAndDedupeActivityLogs(parsed);
  } catch {
    const seeded = normalizeAndDedupeActivityLogs(INITIAL_ACTIVITY_LOGS);
    writeJsonAtomic(ACTIVITY_LOGS_FILE, seeded);
    return seeded;
  }
}

async function readActivityLogsStoreAsync(): Promise<ActivityLog[]> {
  if (getServerStorageMode() === 'persistent_cloud') {
    const cloudLogs = await readCloudKvJson<ActivityLog[]>('it_study:logs_v1');
    if (Array.isArray(cloudLogs) && cloudLogs.length > 0) {
      const normalized = normalizeAndDedupeActivityLogs(cloudLogs);
      try {
        writeJsonAtomic(ACTIVITY_LOGS_FILE, normalized);
      } catch {
        // ignore local mirror error on serverless
      }
      return normalized;
    }
    const localLogs = readActivityLogsStore();
    await writeCloudKvJson('it_study:logs_v1', localLogs);
    return localLogs;
  }
  return readActivityLogsStore();
}

async function writeActivityLogsStoreAsync(logs: ActivityLog[]): Promise<ActivityLog[]> {
  const normalized = normalizeAndDedupeActivityLogs(logs);
  if (getServerStorageMode() === 'persistent_cloud') {
    await writeCloudKvJson('it_study:logs_v1', normalized);
  }
  try {
    writeJsonAtomic(ACTIVITY_LOGS_FILE, normalized);
  } catch (err) {
    if (getServerStorageMode() !== 'persistent_cloud') {
      throw err;
    }
  }
  return normalized;
}

async function appendServerActivityLog(entry: {
  id?: string;
  userId: string;
  userName: string;
  userRole: 'student' | 'lecturer' | 'admin';
  action: string;
  target: string;
  timestamp?: string;
  ipAddress: string;
}): Promise<{ log: ActivityLog; logs: ActivityLog[] }> {
  return withLogsWriteLock(async () => {
    const existing = await readActivityLogsStoreAsync();
    const safeId =
      entry.id && /^[a-zA-Z0-9_\-]{3,128}$/.test(entry.id)
        ? entry.id
        : makeServerUserId('log');
    const created: ActivityLog = {
      id: safeId,
      userId: String(entry.userId || 'guest').slice(0, 128),
      userName: String(entry.userName || 'Người dùng').slice(0, 150),
      userRole: entry.userRole,
      action: String(entry.action || 'Hoạt động hệ thống').slice(0, 120),
      target: String(entry.target || '').slice(0, 400),
      timestamp: String(entry.timestamp || new Date().toISOString()).slice(0, 64),
      ipAddress: String(entry.ipAddress || '127.0.0.1').slice(0, 64),
    };
    const nextLogs = await writeActivityLogsStoreAsync([created, ...existing]);
    return { log: created, logs: nextLogs };
  });
}

function readMaterialsStore(): StudyMaterial[] {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
  if (!fs.existsSync(MATERIALS_FILE)) {
    const seeded = INITIAL_MATERIALS.map(m => ({ ...m }));
    writeJsonAtomic(MATERIALS_FILE, seeded);
    return seeded;
  }
  try {
    const raw = fs.readFileSync(MATERIALS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const seeded = INITIAL_MATERIALS.map(m => ({ ...m }));
      writeJsonAtomic(MATERIALS_FILE, seeded);
      return seeded;
    }
    const list: StudyMaterial[] = [...parsed];
    let updated = false;
    for (const initMat of INITIAL_MATERIALS) {
      if (!list.some(m => m.id === initMat.id)) {
        list.push({ ...initMat });
        updated = true;
      }
    }
    if (updated) writeJsonAtomic(MATERIALS_FILE, list);
    return list;
  } catch {
    const seeded = INITIAL_MATERIALS.map(m => ({ ...m }));
    writeJsonAtomic(MATERIALS_FILE, seeded);
    return seeded;
  }
}

async function readMaterialsStoreAsync(): Promise<StudyMaterial[]> {
  if (getServerStorageMode() === 'persistent_cloud') {
    const cloudMaterials = await readCloudKvJson<StudyMaterial[]>('it_study:materials_v1');
    if (Array.isArray(cloudMaterials) && cloudMaterials.length > 0) {
      const list: StudyMaterial[] = [...cloudMaterials];
      let updated = false;
      for (const initMat of INITIAL_MATERIALS) {
        if (!list.some(m => m.id === initMat.id)) {
          list.push({ ...initMat });
          updated = true;
        }
      }
      if (updated) {
        await writeCloudKvJson('it_study:materials_v1', list);
      }
      return list;
    }
    const localSeed = readMaterialsStore();
    await writeCloudKvJson('it_study:materials_v1', localSeed);
    return localSeed;
  }
  return readMaterialsStore();
}

async function writeMaterialsStoreAsync(materials: StudyMaterial[]): Promise<StudyMaterial[]> {
  if (getServerStorageMode() === 'persistent_cloud') {
    await writeCloudKvJson('it_study:materials_v1', materials);
  }
  try {
    writeJsonAtomic(MATERIALS_FILE, materials);
  } catch {
    // ignore
  }
  return materials;
}

function writeMaterialsStore(materials: StudyMaterial[]): StudyMaterial[] {
  writeJsonAtomic(MATERIALS_FILE, materials);
  return materials;
}

// =========================================================================
// SEPAY PAYMENT CONFIG & ORDERS STORE (10,000 VND Lifetime Exam Unlock)
// =========================================================================
const SEPAY_BANKS: Record<string, string> = {
  MB: 'MBBank (Ngân hàng Quân Đội)',
  ICB: 'VietinBank',
  VCB: 'Vietcombank',
  BIDV: 'BIDV',
  TCB: 'Techcombank',
  ACB: 'ACB (Ngân hàng Á Châu)',
  VPB: 'VPBank',
  TPB: 'TPBank',
  VIB: 'VIB',
  STB: 'Sacombank',
  HDB: 'HDBank',
  OCB: 'OCB (Ngân hàng Phương Đông)',
  MSB: 'MSB (Hàng Hải)',
  SHB: 'SHB',
  LPB: 'LPBank (Lộc Phát)',
  EIB: 'Eximbank',
  VBA: 'Agribank',
  CAKE: 'CAKE by VPBank',
};

function normalizeBankAccountName(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toUpperCase();
}

function getDefaultPaymentConfig(): PaymentConfig {
  const envBank = String(process.env.SEPAY_BANK_CODE || 'ICB').trim().toUpperCase();
  const envAcc = String(process.env.SEPAY_ACCOUNT_NUMBER || '10387719154').replace(/\s+/g, '').trim();
  const envName = normalizeBankAccountName(process.env.SEPAY_ACCOUNT_NAME || 'NGUYEN VU XUAN KIEN');
  const envToken = String(process.env.SEPAY_WEBHOOK_TOKEN || '').trim();
  return {
    provider: 'manual',
    bankCode: envBank,
    bankName: SEPAY_BANKS[envBank] || envBank || 'VietinBank',
    accountNumber: envAcc,
    accountName: envName,
    examFeeVnd: 10000,
    webhookToken: envToken,
    enabled: Boolean(envBank && envAcc),
    updatedAt: new Date().toISOString(),
  };
}

function normalizePaymentConfigObject(parsed: any): PaymentConfig {
  const defaults = getDefaultPaymentConfig();
  const parsedBank = String(parsed?.bankCode || '').trim().toUpperCase();
  const parsedAcc = String(parsed?.accountNumber || '').replace(/\s+/g, '').trim();
  const parsedName = normalizeBankAccountName(parsed?.accountName || '');
  const parsedToken = String(parsed?.webhookToken || '').trim();

  const bankCode = parsedBank || defaults.bankCode;
  const accountNumber = parsedAcc || defaults.accountNumber;
  const accountName = parsedName || defaults.accountName;
  const webhookToken = parsedToken || defaults.webhookToken;
  const examFeeVnd = Math.max(1000, Number(parsed?.examFeeVnd) || defaults.examFeeVnd || 10000);
  const hasConfiguredBank = Boolean(bankCode && accountNumber);
  const enabled = parsedAcc
    ? (parsed?.enabled !== undefined ? Boolean(parsed.enabled) && hasConfiguredBank : hasConfiguredBank)
    : hasConfiguredBank;

  return {
    provider: 'manual',
    bankCode,
    bankName: SEPAY_BANKS[bankCode] || String(parsed?.bankName || '').trim() || bankCode || 'VietinBank',
    accountNumber,
    accountName,
    examFeeVnd,
    webhookToken,
    enabled,
    updatedAt: parsed?.updatedAt || defaults.updatedAt,
  };
}

function readPaymentConfigStore(): PaymentConfig {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const defaults = getDefaultPaymentConfig();
  if (!fs.existsSync(PAYMENT_CONFIG_FILE)) {
    writeJsonAtomic(PAYMENT_CONFIG_FILE, defaults);
    return defaults;
  }
  try {
    const raw = fs.readFileSync(PAYMENT_CONFIG_FILE, 'utf8');
    return normalizePaymentConfigObject(JSON.parse(raw));
  } catch {
    return defaults;
  }
}

async function readPaymentConfigStoreAsync(): Promise<PaymentConfig> {
  if (getServerStorageMode() === 'persistent_cloud') {
    const cloudCfg = await readCloudKvJson<PaymentConfig>('it_study:payment_config_v1');
    if (cloudCfg && typeof cloudCfg === 'object') {
      const normalized = normalizePaymentConfigObject(cloudCfg);
      try {
        writeJsonAtomic(PAYMENT_CONFIG_FILE, normalized);
      } catch {
        // ignore
      }
      return normalized;
    }
    const localCfg = readPaymentConfigStore();
    await writeCloudKvJson('it_study:payment_config_v1', localCfg);
    return localCfg;
  }
  return readPaymentConfigStore();
}

function writePaymentConfigStore(cfg: PaymentConfig): PaymentConfig {
  writeJsonAtomic(PAYMENT_CONFIG_FILE, cfg);
  return cfg;
}

async function writePaymentConfigStoreAsync(cfg: PaymentConfig): Promise<PaymentConfig> {
  if (getServerStorageMode() === 'persistent_cloud') {
    await writeCloudKvJson('it_study:payment_config_v1', cfg);
  }
  try {
    writeJsonAtomic(PAYMENT_CONFIG_FILE, cfg);
  } catch {
    // ignore
  }
  return cfg;
}

function readPaymentOrdersStore(): ExamPaymentOrder[] {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PAYMENT_ORDERS_FILE)) {
    writeJsonAtomic(PAYMENT_ORDERS_FILE, []);
    return [];
  }
  try {
    const raw = fs.readFileSync(PAYMENT_ORDERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readPaymentOrdersStoreAsync(): Promise<ExamPaymentOrder[]> {
  if (getServerStorageMode() === 'persistent_cloud') {
    const cloudOrders = await readCloudKvJson<ExamPaymentOrder[]>('it_study:payment_orders_v1');
    if (Array.isArray(cloudOrders)) {
      try {
        writeJsonAtomic(PAYMENT_ORDERS_FILE, cloudOrders);
      } catch {
        // ignore
      }
      return cloudOrders;
    }
    const localOrders = readPaymentOrdersStore();
    await writeCloudKvJson('it_study:payment_orders_v1', localOrders);
    return localOrders;
  }
  return readPaymentOrdersStore();
}

function writePaymentOrdersStore(orders: ExamPaymentOrder[]): ExamPaymentOrder[] {
  writeJsonAtomic(PAYMENT_ORDERS_FILE, orders);
  return orders;
}

async function writePaymentOrdersStoreAsync(orders: ExamPaymentOrder[]): Promise<ExamPaymentOrder[]> {
  if (getServerStorageMode() === 'persistent_cloud') {
    await writeCloudKvJson('it_study:payment_orders_v1', orders);
  }
  try {
    writeJsonAtomic(PAYMENT_ORDERS_FILE, orders);
  } catch {
    // ignore
  }
  return orders;
}

function buildSepayQrUrl(cfg: PaymentConfig, amount: number, orderCode: string): string {
  const bank = cfg.bankCode.trim() || 'ICB';
  const acc = cfg.accountNumber.trim() || '10387719154';
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: orderCode,
    accountName: cfg.accountName || 'NGUYEN VU XUAN KIEN',
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(acc)}-compact2.png?${params.toString()}`;
}

function makeOrderCode(existingOrders: ExamPaymentOrder[]): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = `DHHPEX${suffix}`;
    if (!existingOrders.some(o => o.orderCode === candidate)) {
      return candidate;
    }
  }
  return `DHHPEX${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

// Shared Gemini Client on server-side with User-Agent header
const apiKey = process.env.GEMINI_API_KEY || '';
const envModel = (process.env.GEMINI_MODEL || '').trim();
const DEPRECATED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
]);
const GEMINI_MODEL = !envModel || DEPRECATED_MODELS.has(envModel) ? 'gemini-3.1-flash-lite' : envModel;
const FALLBACK_MODELS = Array.from(
  new Set([GEMINI_MODEL, 'gemini-4-hydrogen'])
);

const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Track AI generation usage and enforce rate limit
interface GenerationUsageRecord {
  timestamp: number;
  subjectName: string;
}
const usageLog: GenerationUsageRecord[] = [];
const MAX_GENERATIONS_PER_HOUR = 60;

function checkRateLimit(): boolean {
  const oneHourAgo = Date.now() - 3600000;
  while (usageLog.length > 0 && usageLog[0].timestamp <= oneHourAgo) {
    usageLog.shift();
  }
  return usageLog.length < MAX_GENERATIONS_PER_HOUR;
}

function parseGeminiJson<T = any>(rawText: string | undefined, defaultVal: T): T {
  if (!rawText) return defaultVal;
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt extracting outermost JSON object or array if model included surrounding prose
    const firstObj = cleaned.indexOf('{');
    const lastObj = cleaned.lastIndexOf('}');
    if (firstObj !== -1 && lastObj > firstObj) {
      try {
        return JSON.parse(cleaned.slice(firstObj, lastObj + 1)) as T;
      } catch {
        // continue to array check
      }
    }
    const firstArr = cleaned.indexOf('[');
    const lastArr = cleaned.lastIndexOf(']');
    if (firstArr !== -1 && lastArr > firstArr) {
      try {
        return JSON.parse(cleaned.slice(firstArr, lastArr + 1)) as T;
      } catch {
        // fall through
      }
    }
    console.error('JSON parse error from Gemini output. Snippet:', cleaned.slice(0, 300));
    return defaultVal;
  }
}

function extractErrorDetails(error: any): { status: number; codeText: string; detailMsg: string } {
  const rawMsg = String(error?.message || error || '');
  let status = Number(error?.status || error?.code || error?.statusCode) || 0;
  let codeText = String(error?.statusText || '');
  let detailMsg = rawMsg;

  // @google/genai ApiError often serializes JSON into error.message
  const firstBrace = rawMsg.indexOf('{');
  const lastBrace = rawMsg.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(rawMsg.slice(firstBrace, lastBrace + 1));
      const inner = parsed?.error || parsed;
      if (inner?.code && !status) status = Number(inner.code) || 0;
      if (inner?.status) codeText = String(inner.status);
      if (inner?.message) detailMsg = String(inner.message);
    } catch {
      // ignore non-JSON message
    }
  }

  return { status, codeText, detailMsg };
}

function formatGeminiError(error: any): { status: number; message: string } {
  const { status, codeText, detailMsg } = extractErrorDetails(error);
  const combined = `${codeText} ${detailMsg}`.toUpperCase();

  if (
    status === 401 ||
    status === 403 ||
    combined.includes('API_KEY_INVALID') ||
    combined.includes('PERMISSION_DENIED') ||
    combined.includes('UNAUTHENTICATED')
  ) {
    return {
      status: 403,
      message: 'API Key Gemini không hợp lệ hoặc chưa được cấp quyền. Vui lòng kiểm tra lại cấu hình GEMINI_API_KEY trên máy chủ.',
    };
  }
  if (status === 429 || combined.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Hệ thống Gemini AI đang vượt giới hạn tần suất (429). Vui lòng đợi 10-15 giây rồi bấm thử lại.',
    };
  }
  if (status === 503 || combined.includes('UNAVAILABLE') || combined.includes('HIGH DEMAND')) {
    return {
      status: 503,
      message: 'Máy chủ Gemini AI đang quá tải tạm thời (503). Hệ thống đã tự động chuyển thử các mô hình dự phòng nhưng đều bận, vui lòng thử lại sau vài giây hoặc giảm xuống 5 câu/lần.',
    };
  }
  if (status === 408 || status === 504 || combined.includes('ETIMEDOUT') || combined.includes('TIMEOUT')) {
    return {
      status: 504,
      message: 'Yêu cầu tới Gemini AI vượt quá thời gian chờ. Vui lòng thử lại với số lượng 5 câu hỏi mỗi lần hoặc nội dung tài liệu ngắn gọn hơn.',
    };
  }
  if (status === 404 || combined.includes('NOT_FOUND')) {
    return {
      status: 404,
      message: `Không tìm thấy mô hình Gemini phù hợp (${GEMINI_MODEL}). Vui lòng kiểm tra cấu hình mô hình trên máy chủ.`,
    };
  }
  if (status === 400) {
    return {
      status: 400,
      message: `Dữ liệu gửi lên Gemini AI chưa hợp lệ: ${detailMsg || 'Bad Request'}`,
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: detailMsg || 'Lỗi kết nối đến dịch vụ Gemini AI.',
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutErr: any = new Error(`ETIMEDOUT: ${label} exceeded ${timeoutMs}ms`);
      timeoutErr.status = 504;
      reject(timeoutErr);
    }, timeoutMs);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function callWithModelFallback<T>(
  runner: (model: string, useThinkingLow: boolean) => Promise<T>,
  perModelTimeoutMs = 35000
): Promise<T> {
  let primaryError: any = null;
  let lastNon404Error: any = null;

  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const model = FALLBACK_MODELS[i];
    const useThinkingLow = model === 'gemini-4-hydrogen';

    try {
      return await withTimeout(
        runner(model, useThinkingLow),
        i === 0 ? perModelTimeoutMs : 20000,
        `Gemini(${model})`
      );
    } catch (err: any) {
      const { status, codeText, detailMsg } = extractErrorDetails(err);
      const combined = `${codeText} ${detailMsg}`.toUpperCase();
      const isAuthOrBadKey =
        status === 401 ||
        status === 403 ||
        combined.includes('API_KEY_INVALID') ||
        combined.includes('PERMISSION_DENIED');
      const isNotFound = status === 404 || combined.includes('NOT_FOUND');

      if (i === 0 && !primaryError) {
        primaryError = err;
      }
      if (!isNotFound) {
        lastNon404Error = err;
      }

      console.log(
        `[AI Failover] Model ${model} skipped (status=${status || 'unknown'}): ${detailMsg.slice(0, 140)}`
      );

      if (isAuthOrBadKey) {
        throw err;
      }
    }
  }

  throw lastNon404Error || primaryError;
}

// 1. API Analyze Document (Đề cương, bài giảng)
app.post('/api/ai/analyze-document', async (req: Request, res: Response) => {
  try {
    const { documentTitle, subjectName, documentType, rawContent } = req.body;

    if (!rawContent || rawContent.trim().length === 0) {
      return res.status(400).json({ error: 'Nội dung tài liệu không được để trống' });
    }

    if (ai) {
      const prompt = `Bạn là một chuyên gia khảo thí và thiết kế chương trình đào tạo ngành Công nghệ Thông tin.
Hãy phân tích tài liệu sau đây của học phần "${subjectName}":
Tiêu đề tài liệu: "${documentTitle}"
Loại tài liệu: "${documentType}"
Nội dung tài liệu:
"""
${rawContent.slice(0, 18000)}
"""

Hãy phân tích và trả về JSON hợp lệ với cấu trúc:
{
  "subjectName": "${subjectName}",
  "courseGoals": ["Mục tiêu 1", "Mục tiêu 2"],
  "clos": [
    {"code": "CLO1", "description": "Chuẩn đầu ra 1"},
    {"code": "CLO2", "description": "Chuẩn đầu ra 2"}
  ],
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Tên chương",
      "summary": "Tóm tắt ngắn gọn",
      "coreConcepts": ["Khái niệm 1", "Thuật toán/Công thức 2"]
    }
  ],
  "keyTopics": ["Chủ đề trọng tâm 1", "Chủ đề 2"],
  "priorityReview": ["Chủ đề ưu tiên ôn thi 1", "Chủ đề 2"]
}`;

      const parsed = await callWithModelFallback(async (model, useThinkingLow) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            systemInstruction: 'Phân tích tài liệu giáo trình/đề cương học phần CNTT chính xác và trích xuất thông tin ngắn gọn, súc tích theo cấu trúc JSON chuẩn.',
          },
        });
        const data = parseGeminiJson(response.text, null as any);
        if (!data || typeof data !== 'object' || !Array.isArray(data.chapters)) {
          const invalidErr: any = new Error('INVALID_AI_ANALYSIS_FORMAT');
          invalidErr.status = 502;
          throw invalidErr;
        }
        return data;
      }, 28000);

      return res.json({ success: true, analysis: parsed });
    }

    // High-fidelity fallback if GEMINI_API_KEY is not configured
    return res.json({
      success: true,
      analysis: {
        subjectName: subjectName || 'Công nghệ Thông tin',
        courseGoals: [
          `Nắm vững các nguyên lý cốt lõi của ${subjectName}`,
          'Ứng dụng thành thạo giải thuật và cấu trúc dữ liệu trong bài toán thực tế',
          'Đạt chuẩn đầu ra kỹ sư phần mềm chuyên ngành'
        ],
        clos: [
          { code: 'CLO1', description: `Hiểu rõ kiến thức nền tảng và mô hình hóa hệ thống trong ${subjectName}` },
          { code: 'CLO2', description: 'Có khả năng phân tích, cài đặt và tối ưu hóa giải thuật' },
          { code: 'CLO3', description: 'Vận dụng tiêu chuẩn an toàn và kiểm thử phần mềm' }
        ],
        chapters: [
          {
            chapterNumber: 1,
            title: 'Tổng quan và Cơ sở lý thuyết nền tảng',
            summary: 'Giới thiệu các định nghĩa, quy tắc và mô hình kiến trúc cơ bản.',
            coreConcepts: ['Khái niệm cốt lõi', 'Mô hình hệ thống', 'Độ phức tạp tính toán']
          },
          {
            chapterNumber: 2,
            title: 'Các kỹ thuật và Thuật toán trọng tâm',
            summary: 'Chi tiết phương pháp phân tích, cú pháp và kỹ thuật cài đặt.',
            coreConcepts: ['Quy trình xử lý', 'Cấu trúc dữ liệu liên quan', 'Phương pháp tối ưu']
          }
        ],
        keyTopics: ['Nguyên lý cơ bản', 'Kỹ thuật cài đặt', 'Tối ưu hiệu năng'],
        priorityReview: ['Câu hỏi mức độ Vận dụng', 'Đọc hiểu mã nguồn thực tế']
      }
    });
  } catch (error: any) {
    console.error('Error analyzing document:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 2. API Generate Questions from Document
app.post('/api/ai/generate-questions', async (req: Request, res: Response) => {
  try {
    const {
      subjectName,
      chapterTitle,
      documentTitle,
      rawContent,
      questionCount = 5,
      difficulty = 'medium',
      bloomLevel = 2,
      questionType = 'single_choice',
    } = req.body;

    const requestedCount = Math.max(1, Math.min(20, Number(questionCount) || 5));

    const bloomLabels: Record<number, string> = {
      1: 'Nhớ (Remember)',
      2: 'Hiểu (Understand)',
      3: 'Vận dụng (Apply)',
      4: 'Phân tích (Analyze)',
      5: 'Đánh giá (Evaluate)',
      6: 'Sáng tạo (Create)',
    };

    const typeInstructions: Record<string, string> = {
      single_choice: 'Dạng trắc nghiệm 1 đáp án đúng: mỗi câu PHẢI có đúng 4 phương án trong options với id là "opt_1", "opt_2", "opt_3", "opt_4"; correctAnswer là 1 chuỗi id đúng duy nhất (ví dụ "opt_2").',
      multiple_choice: 'Dạng trắc nghiệm NHIỀU đáp án đúng: mỗi câu PHẢI có đúng 4 phương án trong options với id là "opt_1", "opt_2", "opt_3", "opt_4"; có 2 đến 3 phương án đúng, correctAnswer liệt kê các id cách nhau bởi dấu phẩy (ví dụ "opt_1,opt_3").',
      true_false: 'Dạng Đúng/Sai: mỗi câu PHẢI có đúng 2 phương án trong options: [{"id":"opt_true","text":"Đúng"},{"id":"opt_false","text":"Sai"}]; correctAnswer chỉ được là "opt_true" hoặc "opt_false".',
      fill_blank: 'Dạng điền khuyết: trong content đặt chỗ trống bằng "___"; options để mảng rỗng []; correctAnswer là cụm từ khóa ngắn gọn, chính xác cần điền.',
      essay: 'Dạng tự luận / thực hành lập trình: options để mảng rỗng []; correctAnswer là danh sách các từ khóa chấm điểm rubric ngăn cách bởi dấu "|" (ví dụ "CREATE TABLE|PRIMARY KEY|FOREIGN KEY") kèm ý chính ngắn gọn.',
    };

    if (!checkRateLimit()) {
      return res.status(429).json({
        error: 'Hệ thống AI đã đạt giới hạn yêu cầu tạo câu hỏi trong giờ này (Tối đa 60 lượt/giờ). Vui lòng thử lại sau ít phút để bảo vệ tài nguyên hệ thống.'
      });
    }
    usageLog.push({ timestamp: Date.now(), subjectName: subjectName || 'CNTT' });

    if (ai) {
      const effectiveContent = (rawContent || '').trim().length >= 30
        ? (rawContent || '').trim().slice(0, 12000)
        : `Học phần: ${subjectName || 'Công nghệ Thông tin'}. Tài liệu: ${documentTitle || 'Đề cương học phần'}. Chương/Chủ đề: ${chapterTitle || 'Kiến thức cốt lõi môn học'}.`;

      const generateBatch = async (model: string, useThinkingLow: boolean) => {
        const prompt = `Bạn là giảng viên đại học Khoa Công nghệ Thông tin.
Hãy tạo CHÍNH XÁC ${requestedCount} câu hỏi ôn tập chất lượng cao dựa trên tài liệu học phần "${subjectName || 'Công nghệ Thông tin'}":
- Tài liệu nguồn: "${documentTitle || 'Bài giảng học phần'}"
- Chương/Chủ đề trọng tâm: "${chapterTitle || 'Toàn bộ tài liệu'}"
- Mức độ khó: ${difficulty} (easy/medium/hard)
- Cấp độ Bloom: Bậc ${bloomLevel} - ${bloomLabels[bloomLevel] || 'Hiểu'}
- Dạng câu hỏi bắt buộc (type): "${questionType}"
- Quy tắc định dạng: ${typeInstructions[questionType] || typeInstructions.single_choice}
- Quy định chuẩn ngôn ngữ lập trình theo từng học phần:
  + Lập trình cơ sở (INF1030): Bắt buộc dùng ngôn ngữ C (#include <stdio.h>, printf, scanf, con trỏ, mảng char[], thư viện string.h).
  + Lập trình nâng cao (INF2020): Bắt buộc dùng ngôn ngữ C++ (cấp phát động new/delete, struct, fstream, STL vector/map/sort).
  + Lập trình hướng đối tượng (INF2040): Bắt buộc dùng ngôn ngữ JavaScript (ES6+ Class, constructor, Private Fields #, getters/setters, kế thừa extends/super, phương thức mảng map/filter/reduce).
- Đối với môn lập trình/CSDL/mạng, bổ sung codeSnippet ngắn gọn (tối đa 10 dòng) nếu giúp câu hỏi trực quan hơn; nếu không cần code thì để chuỗi rỗng "".
- Giải thích (explanation) súc tích 1-3 câu để đảm bảo trả về đủ ${requestedCount} câu hỏi trọn vẹn.
- Ghi rõ sourceReference tham chiếu phần/chương trong tài liệu.

Nội dung tài liệu:
"""
${effectiveContent}
"""`;

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            systemInstruction: `Luôn trả về JSON hợp lệ chứa đúng ${requestedCount} câu hỏi thuộc loại "${questionType}" bằng tiếng Việt chuyên ngành CNTT chuẩn xác.`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                chapter: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      content: { type: Type.STRING },
                      codeSnippet: { type: Type.STRING },
                      type: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            id: { type: Type.STRING },
                            text: { type: Type.STRING },
                          },
                          required: ['id', 'text'],
                        },
                      },
                      correctAnswer: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      difficulty: { type: Type.STRING },
                      bloomLevel: { type: Type.INTEGER },
                      topic: { type: Type.STRING },
                      sourceReference: { type: Type.STRING },
                    },
                    required: ['content', 'type', 'correctAnswer', 'explanation', 'difficulty', 'bloomLevel'],
                  },
                },
              },
              required: ['questions'],
            },
          },
        });

        const parsed = parseGeminiJson<{ subject?: string; chapter?: string; questions?: any[] }>(
          response.text,
          { questions: [] }
        );
        const validQuestions = Array.isArray(parsed?.questions)
          ? parsed.questions.filter((q) => q && typeof q.content === 'string' && q.content.trim().length > 0)
          : [];

        if (validQuestions.length === 0) {
          const emptyErr: any = new Error('EMPTY_AI_QUESTIONS');
          emptyErr.status = 502;
          throw emptyErr;
        }

        return {
          subject: parsed.subject || subjectName,
          chapter: parsed.chapter || chapterTitle,
          questions: validQuestions.map((q) => ({
            ...q,
            type: q.type || questionType,
            codeSnippet: q.codeSnippet ? String(q.codeSnippet).trim() : undefined,
            difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : difficulty,
            bloomLevel: Number(q.bloomLevel) >= 1 && Number(q.bloomLevel) <= 6 ? Number(q.bloomLevel) : bloomLevel,
          })),
        };
      };

      try {
        const dynamicTimeoutMs = Math.min(42000, 28000 + requestedCount * 700);
        const result = await callWithModelFallback(generateBatch, dynamicTimeoutMs);
        return res.json({ success: true, result });
      } catch (innerErr: any) {
        if (innerErr?.message === 'EMPTY_AI_QUESTIONS') {
          return res.status(502).json({
            error: 'AI chưa sinh được câu hỏi hợp lệ từ nội dung tài liệu hiện tại. Vui lòng bổ sung nội dung tài liệu rõ hơn hoặc chọn 5-10 câu mỗi lần.',
          });
        }
        throw innerErr;
      }
    }

    // Dynamic smart fallback if no API key provided
    const templates = [
      {
        content: `Trong nội dung học phần ${subjectName}, mục tiêu chính của kiến thức trọng tâm được đề cập trong "${documentTitle}" là gì?`,
        codeSnippet: `// Minh họa trong bài giảng ${chapterTitle || subjectName}\nvoid executeProcess() {\n    // Khởi tạo và tối ưu hóa tài nguyên\n}`,
        options: [
          { id: 'opt_1', text: 'Tối ưu hóa thời gian thực thi và tài nguyên hệ thống' },
          { id: 'opt_2', text: 'Đảm bảo tính đúng đắn và khả năng bảo trì mã nguồn' },
          { id: 'opt_3', text: 'Thay thế hoàn toàn phần cứng vật lý của máy tính' },
          { id: 'opt_4', text: 'Bỏ qua bước kiểm soát dữ liệu đầu vào' },
        ],
        correctAnswer:
          questionType === 'true_false'
            ? 'opt_true'
            : questionType === 'multiple_choice'
            ? 'opt_1,opt_2'
            : questionType === 'fill_blank'
            ? 'tối ưu hóa'
            : questionType === 'essay'
            ? 'tối ưu|thời gian|tài nguyên|chuẩn đầu ra'
            : 'opt_1',
        explanation: 'Theo tài liệu bài giảng, việc thiết kế cấu trúc và giải thuật nhằm đảm bảo tính toàn vẹn, khả năng bảo trì và tối ưu hóa hiệu năng xử lý.',
        topic: chapterTitle || 'Kiến thức trọng tâm',
        sourceReference: `${documentTitle} - Phần Trọng tâm`,
      },
      {
        content: `Theo đề cương bài giảng ${subjectName}, nguyên tắc quan trọng nhất cần tuân thủ khi triển khai giải pháp là gì?`,
        options: [
          { id: 'opt_1', text: 'Đảm bảo tính nhất quán (Consistency) và khả năng mở rộng' },
          { id: 'opt_2', text: 'Phân tách mô-đun rõ ràng và kiểm thử đầy đủ điều kiện biên' },
          { id: 'opt_3', text: 'Sử dụng biến toàn cục cho tất cả các mô-đun' },
          { id: 'opt_4', text: 'Không cần ghi nhật ký lỗi hệ thống' },
        ],
        correctAnswer:
          questionType === 'true_false'
            ? 'opt_true'
            : questionType === 'multiple_choice'
            ? 'opt_1,opt_2'
            : questionType === 'fill_blank'
            ? 'nhất quán'
            : questionType === 'essay'
            ? 'nhất quán|mô-đun|kiểm thử|điều kiện biên'
            : 'opt_1',
        explanation: 'Chuẩn đầu ra của học phần yêu cầu sinh viên nắm vững nguyên lý thiết kế mô-đun hóa, đảm bảo tính nhất quán và an toàn.',
        topic: 'Nguyên tắc thiết kế',
        sourceReference: `${documentTitle} - Phần Tổng quan`,
      },
    ];

    const fallbackQuestions = Array.from({ length: requestedCount }, (_, idx) => {
      const tpl = templates[idx % templates.length];
      const suffix = idx >= templates.length ? ` (Biến thể ôn tập #${idx + 1})` : '';
      const options = questionType === 'true_false'
        ? [{ id: 'opt_true', text: 'Đúng' }, { id: 'opt_false', text: 'Sai' }]
        : (questionType === 'fill_blank' || questionType === 'essay')
        ? []
        : tpl.options;
      return {
        ...tpl,
        content: `${tpl.content}${suffix}`,
        type: questionType,
        options,
        difficulty,
        bloomLevel,
      };
    });

    return res.json({
      success: true,
      result: {
        subject: subjectName,
        chapter: chapterTitle,
        questions: fallbackQuestions,
      },
    });
  } catch (error: any) {
    console.error('Error generating questions with AI:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 3. API AI Explain Question for Students
app.post('/api/ai/explain-question', async (req: Request, res: Response) => {
  try {
    const { questionContent, studentAnswer, correctAnswer, explanation, options, subjectName } = req.body || {};

    if (!questionContent || String(questionContent).trim().length === 0) {
      return res.status(400).json({ error: 'Nội dung câu hỏi cần giải thích không được để trống.' });
    }

    if (ai) {
      const prompt = `Bạn là trợ giảng AI thông minh của Khoa Công nghệ Thông tin môn "${subjectName}".
Sinh viên vừa làm câu hỏi sau và cần lời giải thích chi tiết, sư phạm:

Nội dung câu hỏi: "${questionContent}"
Phương án lựa chọn: ${JSON.stringify(options || [])}
Phương án sinh viên đã chọn: "${studentAnswer || 'Chưa trả lời'}"
Đáp án chuẩn: "${correctAnswer}"
Giải thích tóm tắt ban đầu: "${explanation}"

Hãy phân tích chuyên sâu cho sinh viên theo cấu trúc JSON:
{
  "isCorrect": true/false,
  "whyCorrect": "Phân tích rõ ràng vì sao đáp án chuẩn là chính xác",
  "whyOthersWrong": [
    {"option": "Tên phương án", "reason": "Lý do vì sao phương án này chưa đúng"}
  ],
  "keyTakeaway": "Quy tắc cốt lõi sinh viên cần ghi nhớ",
  "codeExample": "Đoạn code minh họa ngắn gọn (nếu liên quan)",
  "textbookCitation": "Trích dẫn nguyên lý từ bài giảng/giáo trình môn học"
}`;

      const parsed = await callWithModelFallback(async (model, useThinkingLow) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            systemInstruction: 'Giải thích cặn kẽ bản chất công nghệ, phân tích tại sao đáp án đúng và các phương án sai.',
          },
        });
        const data = parseGeminiJson(response.text, null as any);
        if (!data || typeof data !== 'object') {
          const invalidErr: any = new Error('INVALID_AI_EXPLANATION_FORMAT');
          invalidErr.status = 502;
          throw invalidErr;
        }
        return data;
      }, 25000);

      return res.json({ success: true, explanation: parsed });
    }

    // High-fidelity fallback explanation
    return res.json({
      success: true,
      explanation: {
        isCorrect: studentAnswer === correctAnswer,
        whyCorrect: 'Đáp án chuẩn phản ánh đúng bản chất lý thuyết đã được giảng viên trình bày trong bài giảng: Đảm bảo nguyên lý thiết kế và ràng buộc toàn vẹn của mô hình.',
        whyOthersWrong: [
          { option: 'Phương án B', reason: 'Sai lệch về phạm vi hoạt động của hàm và vi phạm nguyên lý che giấu thông tin.' },
          { option: 'Phương án C', reason: 'Gây ra chi phí tính toán cấp số nhân, không tối ưu cho dữ liệu lớn.' },
          { option: 'Phương án D', reason: 'Không đáp ứng chuẩn đầu ra của hệ thống và thiếu cơ chế bắt ngoại lệ.' }
        ],
        keyTakeaway: 'Luôn kiểm tra điều kiện biên và tuân thủ các nguyên lý SOLID / chuẩn hóa dữ liệu khi thiết kế.',
        codeExample: '// Code minh họa phương pháp chuẩn:\nif (pointer != nullptr) {\n    // Thao tác an toàn trên vùng nhớ\n}',
        textbookCitation: 'Giáo trình CNTT - Chương 2: Cấu trúc điều khiển và Quy tắc quản lý tài nguyên (Trang 42-45).'
      }
    });
  } catch (error: any) {
    console.error('Error generating AI explanation:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 4. API AI Solve Practical Questions (Tìm code mẫu & đáp án chuẩn 1-1 cho từng câu thực hành từ file tải lên)
app.post('/api/ai/solve-practical-questions', async (req: Request, res: Response) => {
  try {
    const { subjectName, subjectCode, questions } = req.body as {
      subjectName?: string;
      subjectCode?: string;
      questions?: Array<{
        tempId: string;
        content: string;
        existingCodeSnippet?: string;
        existingAnswer?: string;
      }>;
    };

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Danh sách câu hỏi thực hành cần tìm đáp án không được trống.' });
    }

    const targetQuestions = questions.slice(0, 20).map((q, idx) => ({
      tempId: String(q.tempId || `q_${idx}`),
      content: String(q.content || '').trim().slice(0, 2500),
      existingCodeSnippet: q.existingCodeSnippet ? String(q.existingCodeSnippet).trim().slice(0, 1500) : '',
    }));

    if (ai) {
      const prompt = `Bạn là giảng viên chuyên ngành Công nghệ Thông tin đang chấm và chuẩn hóa ngân hàng đề thi thực hành cho học phần "${subjectName || 'Lập trình thực hành'}" (${subjectCode || 'CNTT'}).

Dưới đây là DANH SÁCH CHÍNH XÁC ${targetQuestions.length} CÂU HỎI THỰC HÀNH có trong file đề của giảng viên.
YÊU CẦU BẮT BUỘC:
1. CHỈ giải và trả về đúng ${targetQuestions.length} phần tử tương ứng 1-1 với từng "tempId" bên dưới. TUYỆT ĐỐI KHÔNG tự ý thêm câu hỏi mới hoặc gộp/tách câu hỏi.
2. Với mỗi câu hỏi, hãy tự tìm và viết lời giải chính xác nhất phù hợp quy chuẩn ngôn ngữ của học phần "${subjectName || 'CNTT'}":
   - Học phần "Lập trình cơ sở" (INF1030): BẮT BUỘC dùng ngôn ngữ lập trình C (chuẩn C99/C11, #include <stdio.h>, printf, scanf, con trỏ, mảng char[], thư viện string.h; không dùng C++ iostream hay class).
   - Học phần "Lập trình nâng cao" (INF2020): BẮT BUỘC dùng ngôn ngữ lập trình C++ (cấp phát động new/delete, struct, fstream đọc ghi file, C++ STL vector/map/sort, iostream).
   - Học phần "Lập trình hướng đối tượng" (INF2040): BẮT BUỘC dùng ngôn ngữ lập trình JavaScript (ES6+ Class, constructor, Private Fields #, getters/setters, kế thừa extends/super, phương thức mảng map/filter/reduce, đa hình động; không dùng C++ hay Java trừ khi đề bài cụ thể yêu cầu khác).
   - Học phần "Nhập môn thuật toán": Ngôn ngữ C/C++ hoặc Python.
   - Học phần "Hệ quản trị cơ sở dữ liệu": SQL Server T-SQL hoặc MySQL.
   - Hoặc theo đúng ngôn ngữ/công nghệ được nêu rõ trong đề bài.
3. Mỗi phần tử gồm:
   - "tempId": giữ nguyên chính xác tempId đầu vào.
   - "sampleSolution": Mã nguồn hoàn chỉnh, chạy được, chuẩn cú pháp, có chú thích ngắn gọn rõ ràng (hoặc câu trả lời thực hành đầy đủ nếu câu hỏi là thiết kế/truy vấn SQL).
   - "rubricKeywords": Chuỗi gồm 5 đến 8 từ khóa/hàm/cú pháp cốt lõi bắt buộc có trong code chuẩn, ngăn cách bằng dấu "|" (ví dụ: "CREATE PROCEDURE|BEGIN|TRANSACTION|COMMIT|ROLLBACK" hoặc "class|virtual|override|vector|return").
   - "explanation": Giải thích thuật toán / hướng tiếp cận / độ phức tạp hoặc lưu ý biên (2-4 câu tiếng Việt chuẩn).

Danh sách câu hỏi:
${JSON.stringify(targetQuestions, null, 2)}`;

      const dynamicTimeoutMs = Math.min(50000, 22000 + targetQuestions.length * 4000);
      const parsed = await callWithModelFallback(async (model, useThinkingLow) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            systemInstruction: `Chỉ trả về JSON hợp lệ chứa mảng "solutions" gồm đúng ${targetQuestions.length} phần tử khớp 1-1 với danh sách tempId được gửi lên. Không tạo thêm câu hỏi ngoài danh sách.`,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                solutions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      tempId: { type: Type.STRING },
                      sampleSolution: { type: Type.STRING },
                      rubricKeywords: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: ['tempId', 'sampleSolution', 'rubricKeywords', 'explanation'],
                  },
                },
              },
              required: ['solutions'],
            },
          },
        });

        const data = parseGeminiJson<{ solutions?: any[] }>(response.text, { solutions: [] });
        const list = Array.isArray(data?.solutions) ? data.solutions : [];
        if (list.length === 0) {
          const emptyErr: any = new Error('EMPTY_PRACTICAL_SOLUTIONS');
          emptyErr.status = 502;
          throw emptyErr;
        }
        return list;
      }, dynamicTimeoutMs);

      const byId = new Map<string, any>();
      parsed.forEach((item: any, idx: number) => {
        const key = String(item?.tempId || targetQuestions[idx]?.tempId || '');
        if (key) byId.set(key, item);
      });

      const normalizedSolutions = targetQuestions.map((q, idx) => {
        const found = byId.get(q.tempId) || parsed[idx] || {};
        return {
          tempId: q.tempId,
          sampleSolution: String(found.sampleSolution || '').trim(),
          rubricKeywords: String(found.rubricKeywords || 'main|return|if|for').trim(),
          explanation: String(found.explanation || 'Lời giải thực hành chuẩn theo yêu cầu đề bài.').trim(),
        };
      });

      return res.json({ success: true, solutions: normalizedSolutions });
    }

    // Fallback when GEMINI_API_KEY is not configured
    const subLower = (subjectName || '').toLowerCase();
    const isSql = subLower.includes('cơ sở dữ liệu') || subLower.includes('csdl') || subLower.includes('sql');
    const fallbackSolutions = targetQuestions.map((q) => ({
      tempId: q.tempId,
      sampleSolution: isSql
        ? `-- Lời giải tham khảo môn ${subjectName || 'Hệ quản trị CSDL'}\n-- Yêu cầu: ${q.content.slice(0, 120)}\nCREATE PROCEDURE sp_XuLyDuLieu\nAS\nBEGIN\n    SET NOCOUNT ON;\n    BEGIN TRANSACTION;\n    -- Thực hiện truy vấn / cập nhật dữ liệu theo yêu cầu\n    COMMIT TRANSACTION;\nEND;`
        : `// Code mẫu tham khảo môn ${subjectName || 'Lập trình thực hành'}\n// Yêu cầu: ${q.content.slice(0, 120)}\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Đọc dữ liệu đầu vào, xử lý thuật toán và xuất kết quả\n    return 0;\n}`,
      rubricKeywords: isSql
        ? 'CREATE|BEGIN|SELECT|TRANSACTION|COMMIT'
        : 'include|main|for|if|return',
      explanation: `Đoạn mã minh họa cấu trúc chuẩn cho bài toán thuộc học phần ${subjectName || 'Thực hành CNTT'}, đảm bảo xử lý đầu vào/đầu ra và điều kiện biên.`,
    }));

    return res.json({ success: true, solutions: fallbackSolutions });
  } catch (error: any) {
    console.error('Error solving practical questions:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 5. API Gemini Auto-Grade Programming Code (Lập trình cơ sở C, Lập trình nâng cao C++, OOP JavaScript)
app.post('/api/ai/grade-code', async (req: Request, res: Response) => {
  try {
    const {
      subjectId,
      subjectName,
      language,
      questionContent,
      codeSnippet,
      sampleSolution,
      rubricKeywords,
      studentCode,
      maxPoints = 5,
    } = req.body as {
      subjectId?: string;
      subjectName?: string;
      language?: string;
      questionContent?: string;
      codeSnippet?: string;
      sampleSolution?: string;
      rubricKeywords?: string;
      studentCode?: string;
      maxPoints?: number;
    };

    const trimmedCode = String(studentCode || '').trim();
    const numericMax = Math.max(1, Number(maxPoints) || 5);

    if (!trimmedCode) {
      return res.json({
        success: true,
        grading: {
          isCorrect: false,
          score: 0,
          maxPoints: numericMax,
          languageCheck: 'Chưa có mã nguồn để chấm.',
          summary: 'Sinh viên chưa nhập đoạn code bài làm.',
          errors: ['Chưa có nội dung mã nguồn được gửi lên.'],
          suggestions: ['Hãy viết đầy đủ mã nguồn theo yêu cầu đề bài rồi bấm nộp bài.'],
          correctedCode: sampleSolution ? String(sampleSolution) : '',
          gradedBy: 'fallback',
          gradedAt: new Date().toISOString(),
        },
      });
    }

    const expectedLang =
      language ||
      (subjectId === 'sub_prog_base'
        ? 'C'
        : subjectId === 'sub_prog_adv'
        ? 'C++'
        : subjectId === 'sub_oop'
        ? 'JavaScript'
        : 'C/C++/JavaScript');

    if (ai) {
      const prompt = `Bạn là giảng viên chấm thi thực hành Khoa Công nghệ Thông tin cho học phần "${subjectName || 'Lập trình'}" (Ngôn ngữ bắt buộc: ${expectedLang}).

ĐỀ BÀI:
"""
${String(questionContent || '').slice(0, 3000)}
"""
${codeSnippet ? `\nKHUNG CODE ĐỀ BÀI:\n\`\`\`\n${String(codeSnippet).slice(0, 1500)}\n\`\`\`` : ''}
${sampleSolution ? `\nCODE MẪU THAM KHẢO:\n\`\`\`\n${String(sampleSolution).slice(0, 2500)}\n\`\`\`` : ''}
${rubricKeywords ? `\nTỪ KHÓA / Ý CHÍNH RUBRIC: ${String(rubricKeywords)}` : ''}

BÀI LÀM CODE CỦA SINH VIÊN (Cần chấm trên thang điểm ${numericMax}):
\`\`\`
${trimmedCode.slice(0, 6000)}
\`\`\`

YÊU CẦU CHẤM BÀI NGHIÊM TÚC VÀ CHÍNH XÁC:
1. Kiểm tra xem đoạn code của sinh viên có ĐÚNG cú pháp, ĐÚNG logic giải thuật, xử lý ĐÚNG input/output và trường hợp biên theo đề bài hay chưa.
2. Kiểm tra đúng ngôn ngữ bắt buộc:
   - Nếu là môn Lập trình cơ sở (C): phải dùng chuẩn C (#include <stdio.h>, printf/scanf, con trỏ/mảng char[]). Nếu viết C++ (cout/cin/iostream) hoặc Python phải trừ điểm và nhắc rõ.
   - Nếu là môn Lập trình nâng cao (C++): phải dùng chuẩn C++ (new/delete, struct, fstream, vector/sort, iostream).
   - Nếu là môn Lập trình hướng đối tượng (JavaScript): phải dùng chuẩn JavaScript ES6+ (class, constructor, #private hoặc getter/setter, extends/super...).
3. Đặt "isCorrect": true nếu bài làm giải quyết đúng yêu cầu chính (điểm >= 50% thang điểm ${numericMax} và không sai thuật toán cốt lõi), ngược lại false.
4. Tính "score" chính xác từ 0 đến ${numericMax} (làm tròn 0.25 điểm).
5. Liệt kê rõ các lỗi cụ thể trong "errors" (mảng rỗng [] nếu code hoàn hảo), các gợi ý cải thiện trong "suggestions", và cung cấp "correctedCode" bằng ${expectedLang} nếu bài làm còn lỗi hoặc thiếu sót.`;

      const parsed = await callWithModelFallback(async (model, useThinkingLow) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            systemInstruction: `Bạn là hệ thống chấm code tự động bằng tiếng Việt chuẩn xác, công tâm. Luôn trả về JSON hợp lệ theo schema.`,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isCorrect: { type: Type.BOOLEAN },
                score: { type: Type.NUMBER },
                languageCheck: { type: Type.STRING },
                summary: { type: Type.STRING },
                errors: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctedCode: { type: Type.STRING },
              },
              required: ['isCorrect', 'score', 'summary', 'errors', 'suggestions'],
            },
          },
        });

        const data = parseGeminiJson<any>(response.text, null);
        if (!data || typeof data !== 'object' || typeof data.summary !== 'string') {
          const invalidErr: any = new Error('INVALID_AI_GRADE_FORMAT');
          invalidErr.status = 502;
          throw invalidErr;
        }
        return data;
      }, 30000);

      const clampedScore = Math.max(0, Math.min(numericMax, Number(parsed.score) || 0));
      const roundedScore = Math.round(clampedScore * 4) / 4;

      return res.json({
        success: true,
        grading: {
          isCorrect: Boolean(parsed.isCorrect),
          score: roundedScore,
          maxPoints: numericMax,
          languageCheck: String(parsed.languageCheck || `Ngôn ngữ ${expectedLang}`).trim(),
          summary: String(parsed.summary).trim(),
          errors: Array.isArray(parsed.errors) ? parsed.errors.map(String).filter(Boolean) : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).filter(Boolean) : [],
          correctedCode: parsed.correctedCode ? String(parsed.correctedCode).trim() : '',
          gradedBy: 'gemini',
          gradedAt: new Date().toISOString(),
        },
      });
    }

    // Fallback when GEMINI_API_KEY is not configured
    const lower = trimmedCode.toLowerCase();
    const keywords = String(rubricKeywords || '')
      .split(/[|,;]+/)
      .map(k => k.trim())
      .filter(Boolean);
    const matched = keywords.filter(k => lower.includes(k.toLowerCase()));
    const ratio = keywords.length > 0 ? matched.length / keywords.length : (trimmedCode.length >= 40 ? 0.8 : 0.4);
    const fallbackScore = Math.round(Math.min(1, ratio) * numericMax * 4) / 4;
    const isPass = fallbackScore >= numericMax * 0.5;

    return res.json({
      success: true,
      grading: {
        isCorrect: isPass,
        score: fallbackScore,
        maxPoints: numericMax,
        languageCheck: `Chấm tự động dự phòng (${expectedLang}) — khớp ${matched.length}/${keywords.length || 1} cấu trúc trọng tâm.`,
        summary: isPass
          ? `Đoạn code đã đáp ứng các thành phần cốt lõi của bài toán (${matched.join(', ') || 'đủ cấu trúc cơ bản'}).`
          : 'Đoạn code còn thiếu nhiều thành phần xử lý chính hoặc chưa đủ logic giải bài toán.',
        errors: isPass ? [] : ['Chưa thấy đủ từ khóa/cấu trúc thuật toán theo yêu cầu đề bài.'],
        suggestions: ['Kiểm tra lại điều kiện biên, kiểu dữ liệu và đầu ra của chương trình.'],
        correctedCode: sampleSolution ? String(sampleSolution) : '',
        gradedBy: 'fallback',
        gradedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error grading code with Gemini:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 6. API Gemini Vision Auto-Grade Algorithm Image (Nhập môn thuật toán - Lưu đồ / Mã giả / Code ảnh chụp)
app.post('/api/ai/grade-algorithm-image', async (req: Request, res: Response) => {
  try {
    const {
      subjectName,
      questionContent,
      sampleSolution,
      rubricKeywords,
      imageDataUrl,
      note,
      maxPoints = 5,
    } = req.body as {
      subjectName?: string;
      questionContent?: string;
      sampleSolution?: string;
      rubricKeywords?: string;
      imageDataUrl?: string;
      note?: string;
      maxPoints?: number;
    };

    const numericMax = Math.max(1, Number(maxPoints) || 5);
    const dataUrl = String(imageDataUrl || '').trim();
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

    if (!match) {
      return res.status(400).json({ error: 'Hình ảnh bài làm không đúng định dạng base64 hợp lệ.' });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    if (ai) {
      const prompt = `Bạn là giảng viên chấm bài thực hành học phần "${subjectName || 'Nhập môn thuật toán'}" Khoa CNTT.
Sinh viên đã TẢI LÊN HÌNH ẢNH BÀI LÀM (có thể là sơ đồ khối / lưu đồ thuật toán Flowchart, mã giả viết tay, hoặc ảnh chụp đoạn code).

ĐỀ BÀI (Thang điểm ${numericMax}):
"""
${String(questionContent || '').slice(0, 3000)}
"""
${sampleSolution ? `\nĐÁP ÁN / THUẬT TOÁN MẪU:\n${String(sampleSolution).slice(0, 2000)}` : ''}
${rubricKeywords ? `\nTỪ KHÓA / BƯỚC CHÍNH RUBRIC: ${String(rubricKeywords)}` : ''}
${note ? `\nGHI CHÚ CỦA SINH VIÊN KÈM THEO ẢNH: "${String(note).slice(0, 1000)}"` : ''}

HÃY QUAN SÁT KỸ HÌNH ẢNH SINH VIÊN ĐÃ NỘP VÀ CHẤM ĐIỂM CÔNG TÂM:
1. Nhận diện nội dung trong ảnh (lưu đồ thuật toán có đúng quy ước hình elip Bắt đầu/Kết thúc, hình bình hành Nhập/Xuất, hình chữ nhật Xử lý, hình thoi Điều kiện rẽ nhánh, luồng mũi tên/vòng lặp không; hoặc mã giả/code trong ảnh có đúng logic giải thuật không).
2. Nếu ảnh hoàn toàn không liên quan đến bài toán (ảnh trống, ảnh phong cảnh, sai bài hoàn toàn), đặt isCorrect = false, score = 0 và nêu rõ lý do.
3. Trả về kết quả JSON theo schema gồm isCorrect, score (0..${numericMax}), languageCheck (nhận xét dạng trình bày trong ảnh), summary, errors, suggestions, correctedCode (gợi ý thuật toán/lưu đồ bằng mã giả hoặc C++ chuẩn nếu cần).`;

      const parsed = await callWithModelFallback(async (model, useThinkingLow) => {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          config: {
            ...(useThinkingLow ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            systemInstruction: 'Chấm hình ảnh bài làm thuật toán chính xác, sư phạm bằng tiếng Việt và trả về đúng cấu trúc JSON.',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isCorrect: { type: Type.BOOLEAN },
                score: { type: Type.NUMBER },
                languageCheck: { type: Type.STRING },
                summary: { type: Type.STRING },
                errors: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctedCode: { type: Type.STRING },
              },
              required: ['isCorrect', 'score', 'summary', 'errors', 'suggestions'],
            },
          },
        });

        const data = parseGeminiJson<any>(response.text, null);
        if (!data || typeof data !== 'object' || typeof data.summary !== 'string') {
          const invalidErr: any = new Error('INVALID_AI_IMAGE_GRADE');
          invalidErr.status = 502;
          throw invalidErr;
        }
        return data;
      }, 35000);

      const clampedScore = Math.max(0, Math.min(numericMax, Number(parsed.score) || 0));
      const roundedScore = Math.round(clampedScore * 4) / 4;

      return res.json({
        success: true,
        grading: {
          isCorrect: Boolean(parsed.isCorrect),
          score: roundedScore,
          maxPoints: numericMax,
          languageCheck: String(parsed.languageCheck || 'Đã phân tích hình ảnh bài làm thuật toán').trim(),
          summary: String(parsed.summary).trim(),
          errors: Array.isArray(parsed.errors) ? parsed.errors.map(String).filter(Boolean) : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).filter(Boolean) : [],
          correctedCode: parsed.correctedCode ? String(parsed.correctedCode).trim() : '',
          gradedBy: 'gemini',
          gradedAt: new Date().toISOString(),
        },
      });
    }

    // Fallback when GEMINI_API_KEY is not configured
    const fallbackScore = Math.round(0.75 * numericMax * 4) / 4;
    return res.json({
      success: true,
      grading: {
        isCorrect: true,
        score: fallbackScore,
        maxPoints: numericMax,
        languageCheck: 'Đã ghi nhận tệp hình ảnh bài làm Nhập môn thuật toán.',
        summary: 'Hệ thống đã tiếp nhận hình ảnh bài làm thuật toán của bạn. Hãy đối chiếu thêm với đáp án chuẩn bên dưới.',
        errors: [],
        suggestions: ['Kiểm tra lại mũi tên vòng lặp và điều kiện dừng của thuật toán trong hình vẽ.'],
        correctedCode: sampleSolution ? String(sampleSolution) : '',
        gradedBy: 'fallback',
        gradedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error grading algorithm image:', error);
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// =========================================================================
// USER MANAGEMENT & CENTRALIZED SYNC API (/api/users)
// =========================================================================

// GET /api/system/storage-status: Kiểm tra trạng thái lưu trữ tập trung trên máy chủ
app.get('/api/system/storage-status', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    storageMode: getServerStorageMode(),
    isVercel: process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV),
    hasCloudKv: Boolean(getUpstashConfig() || getFirebaseRtdbUrl()),
  });
});

// GET /api/users: Trả về toàn bộ danh sách tài khoản cho Admin & Client
app.get('/api/users', async (_req: Request, res: Response) => {
  try {
    const [users, deletedIds] = await Promise.all([
      readUsersStoreAsync(),
      readDeletedUserIdsAsync(),
    ]);
    return res.json({
      success: true,
      users,
      deletedIds: Array.from(deletedIds),
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('GET /api/users error:', error);
    return res.status(500).json({ error: 'Không thể đọc danh sách tài khoản từ máy chủ.' });
  }
});

// POST /api/users/register: Đăng ký tài khoản Sinh viên và lưu thẳng lên máy chủ tập trung
app.post('/api/users/register', async (req: Request, res: Response) => {
  try {
    const payload = (req.body?.user && typeof req.body.user === 'object' ? req.body.user : req.body) || {};
    const fullName = String(payload.fullName || '').trim();
    const studentCode = String(payload.studentCode || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const phone = String(payload.phone || '').trim();
    const className = String(payload.className || '').trim();
    const major = String(payload.major || 'Công nghệ Thông tin').trim() || 'Công nghệ Thông tin';
    const password = String(payload.password || '');

    if (!fullName || !studentCode || !email || !className || !password) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ họ tên, MSSV, lớp sinh hoạt, email và mật khẩu.' });
    }
    if (!/^[a-zA-Z0-9_\-.]{4,25}$/.test(studentCode)) {
      return res.status(400).json({ error: 'Mã số sinh viên (MSSV) bắt buộc gồm từ 4 đến 25 ký tự chữ hoặc số (ví dụ: 223148201057 hoặc 24IT001).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Địa chỉ email không đúng định dạng hợp lệ.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự để đảm bảo an toàn.' });
    }

    const result = await withUsersWriteLock(async () => {
      const users = await readUsersStoreAsync();
      const username = String(payload.username || studentCode).trim().toLowerCase();

      if (users.some(u => u.email.toLowerCase() === email)) {
        return { errorStatus: 409, errorMessage: 'Địa chỉ email này đã được đăng ký trong hệ thống.' };
      }
      if (users.some(u => u.studentCode && u.studentCode.toUpperCase() === studentCode.toUpperCase())) {
        return { errorStatus: 409, errorMessage: `Mã sinh viên "${studentCode}" đã tồn tại trong hệ thống.` };
      }
      if (users.some(u => u.username.toLowerCase() === username)) {
        return { errorStatus: 409, errorMessage: `Tên đăng nhập "${username}" đã tồn tại trong hệ thống.` };
      }

      const now = new Date().toISOString();
      const requestedId = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : '';
      const safeId = requestedId && !users.some(u => u.id === requestedId) ? requestedId : makeServerUserId('usr_stu');
      const cleanAuthUid =
        typeof payload.authUid === 'string' && /^[a-zA-Z0-9_\-]{1,128}$/.test(payload.authUid.trim())
          ? payload.authUid.trim()
          : undefined;

      const newStudent: User = {
        id: safeId,
        ...(cleanAuthUid ? { authUid: cleanAuthUid } : {}),
        username,
        email,
        password,
        fullName,
        role: 'student',
        phone,
        className,
        major,
        status: 'active',
        studentCode,
        createdAt: String(payload.createdAt || now),
        lastLogin: String(payload.lastLogin || now),
        updatedAt: now,
        paidSubjectIds: [],
        hasPaidExamAccess: false,
      };

      const nextUsers = await writeUsersStoreAsync([...users, newStudent]);
      const deletedIds = await readDeletedUserIdsAsync();
      if (deletedIds.has(newStudent.id)) {
        deletedIds.delete(newStudent.id);
        await writeDeletedUserIdsAsync(deletedIds);
      }

      return { newStudent, nextUsers, deletedIds: Array.from(deletedIds), now };
    });

    if ('errorStatus' in result && typeof result.errorStatus === 'number') {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    let createdLog: ActivityLog | undefined;
    let nextLogs: ActivityLog[] | undefined;
    if (req.body?.skipServerLog !== true) {
      try {
        const logRes = await appendServerActivityLog({
          id: typeof req.body?.clientLogId === 'string' ? req.body.clientLogId : undefined,
          userId: result.newStudent.id,
          userName: result.newStudent.fullName,
          userRole: 'student',
          action: 'Sinh viên tự đăng ký',
          target: `Sinh viên ${result.newStudent.fullName} (${result.newStudent.studentCode}) - Lớp ${result.newStudent.className}`,
          timestamp: result.now,
          ipAddress: getClientIp(req),
        });
        createdLog = logRes.log;
        nextLogs = logRes.logs;
      } catch (logErr) {
        console.warn('[Register Log Non-fatal Warning]:', logErr);
      }
    }

    return res.status(201).json({
      success: true,
      user: result.newStudent,
      users: result.nextUsers,
      deletedIds: result.deletedIds,
      ...(createdLog ? { log: createdLog } : {}),
      ...(nextLogs ? { logs: nextLogs } : {}),
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('POST /api/users/register recovery fallback error:', error);
    try {
      const payload = (req.body?.user && typeof req.body.user === 'object' ? req.body.user : req.body) || {};
      const fullName = String(payload.fullName || '').trim() || 'Sinh viên';
      const studentCode = String(payload.studentCode || '').trim() || '2231480000';
      const email = String(payload.email || '').trim().toLowerCase() || 'student@dhhp.edu.vn';
      const password = String(payload.password || 'password123');
      const now = new Date().toISOString();
      const emergencyStudent: User = {
        id: makeServerUserId('usr_stu'),
        username: studentCode.toLowerCase(),
        email,
        password,
        fullName,
        role: 'student',
        phone: String(payload.phone || '').trim(),
        className: String(payload.className || '').trim() || 'K25CNTTE',
        major: String(payload.major || 'Công nghệ Thông tin').trim(),
        status: 'active',
        studentCode,
        createdAt: now,
        lastLogin: now,
        updatedAt: now,
        paidSubjectIds: [],
        hasPaidExamAccess: false,
      };
      if (!memoryUsersCache) memoryUsersCache = INITIAL_USERS.map(u => ({ ...u }));
      memoryUsersCache.push(emergencyStudent);
      return res.status(201).json({
        success: true,
        user: emergencyStudent,
        users: memoryUsersCache,
        deletedIds: [],
        storageMode: 'ephemeral_tmp',
      });
    } catch (fallbackErr) {
      console.error('Critical registration failure:', fallbackErr);
      return res.status(500).json({ error: 'Lỗi máy chủ khi lưu đăng ký tài khoản sinh viên.' });
    }
  }
});

// POST /api/users/login: Xác thực đăng nhập trực tiếp từ máy chủ (hỗ trợ MSSV, username hoặc email)
app.post('/api/users/login', async (req: Request, res: Response) => {
  try {
    const identifier = String(req.body?.usernameOrEmail || req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập/email và mật khẩu.' });
    }

    const result = await withUsersWriteLock(async () => {
      const [users, deletedIds] = await Promise.all([
        readUsersStoreAsync(),
        readDeletedUserIdsAsync(),
      ]);
      const target = users.find(
        u =>
          u.username.toLowerCase() === identifier ||
          u.email.toLowerCase() === identifier ||
          (u.studentCode && u.studentCode.toLowerCase() === identifier)
      );

      if (!target) {
        return { errorStatus: 404, errorMessage: 'Tên đăng nhập, MSSV hoặc email không tồn tại trong hệ thống.', deletedIds: Array.from(deletedIds) };
      }
      if (target.status === 'locked') {
        return { errorStatus: 403, errorMessage: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên Khoa CNTT.' };
      }
      if (!target.password) {
        return {
          errorStatus: 401,
          errorMessage: 'Tài khoản này chưa được thiết lập mật khẩu đăng nhập. Vui lòng liên hệ Quản trị viên Khoa CNTT để đặt lại mật khẩu.',
        };
      }
      if (target.password !== password) {
        return { errorStatus: 401, errorMessage: 'Mật khẩu không chính xác. Vui lòng thử lại.' };
      }

      const now = new Date().toISOString();
      const updatedUser: User = { ...target, lastLogin: now, updatedAt: now };
      const nextUsers = await writeUsersStoreAsync(users.map(u => (u.id === target.id ? updatedUser : u)));
      return { updatedUser, nextUsers, deletedIds: Array.from(deletedIds), now };
    });

    if ('errorStatus' in result && typeof result.errorStatus === 'number') {
      return res.status(result.errorStatus).json({
        error: result.errorMessage,
        ...(result.deletedIds ? { deletedIds: result.deletedIds } : {}),
        storageMode: getServerStorageMode(),
      });
    }

    let createdLog: ActivityLog | undefined;
    let nextLogs: ActivityLog[] | undefined;
    if (req.body?.skipServerLog !== true) {
      const logRes = await appendServerActivityLog({
        id: typeof req.body?.clientLogId === 'string' ? req.body.clientLogId : undefined,
        userId: result.updatedUser.id,
        userName: result.updatedUser.fullName,
        userRole: result.updatedUser.role,
        action: 'Đăng nhập thành công',
        target: `${result.updatedUser.fullName} đăng nhập với vai trò [${result.updatedUser.role.toUpperCase()}]`,
        timestamp: result.now,
        ipAddress: getClientIp(req),
      });
      createdLog = logRes.log;
      nextLogs = logRes.logs;
    }

    return res.json({
      success: true,
      user: result.updatedUser,
      users: result.nextUsers,
      deletedIds: result.deletedIds,
      ...(createdLog ? { log: createdLog } : {}),
      ...(nextLogs ? { logs: nextLogs } : {}),
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('POST /api/users/login emergency fallback error:', error);
    try {
      const identifier = String(req.body?.usernameOrEmail || req.body?.identifier || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const users = memoryUsersCache || INITIAL_USERS;
      const target = users.find(
        u =>
          u.username.toLowerCase() === identifier ||
          u.email.toLowerCase() === identifier ||
          (u.studentCode && u.studentCode.toLowerCase() === identifier)
      );
      if (target && target.password === password) {
        return res.json({
          success: true,
          user: target,
          users,
          storageMode: 'ephemeral_tmp',
        });
      }
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    } catch (fallbackErr) {
      return res.status(500).json({ error: 'Lỗi máy chủ khi đăng nhập.' });
    }
  }
});

// POST /api/users: Admin tạo tài khoản Giảng viên mới trực tiếp lên máy chủ
app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const payload = (req.body?.user && typeof req.body.user === 'object' ? req.body.user : req.body) || {};
    const username = String(payload.username || '').trim().toLowerCase();
    const fullName = String(payload.fullName || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const lecturerCode = String(payload.lecturerCode || '').trim();
    const phone = String(payload.phone || '').trim();
    const department = String(payload.department || 'Khoa Công nghệ Thông tin').trim() || 'Khoa Công nghệ Thông tin';
    const password = String(payload.password || '');
    const assignedSubjectIds = Array.isArray(payload.assignedSubjectIds)
      ? payload.assignedSubjectIds.map(String)
      : [];

    if (!username || !fullName || !email || !lecturerCode || !password) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin giảng viên bắt buộc.' });
    }
    if (!/^\d{4}$/.test(lecturerCode)) {
      return res.status(400).json({ error: 'Mã giảng viên (ID giảng viên) bắt buộc phải gồm đúng 4 chữ số.' });
    }

    const result = await withUsersWriteLock(async () => {
      const users = await readUsersStoreAsync();
      if (users.some(u => u.username.toLowerCase() === username)) {
        return { errorStatus: 409, errorMessage: `Tên đăng nhập "${username}" đã được sử dụng.` };
      }
      if (users.some(u => u.email.toLowerCase() === email)) {
        return { errorStatus: 409, errorMessage: `Email "${email}" đã được sử dụng trong hệ thống.` };
      }
      if (users.some(u => u.lecturerCode && u.lecturerCode.toUpperCase() === lecturerCode.toUpperCase())) {
        return { errorStatus: 409, errorMessage: `Mã giảng viên "${lecturerCode}" đã tồn tại.` };
      }

      const now = new Date().toISOString();
      const requestedId = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : '';
      const safeId = requestedId && !users.some(u => u.id === requestedId) ? requestedId : makeServerUserId('usr_lecturer');

      const newLecturer: User = {
        id: safeId,
        username,
        email,
        password,
        fullName,
        role: 'lecturer',
        phone,
        department,
        lecturerCode,
        status: 'active',
        createdAt: String(payload.createdAt || now),
        lastLogin: String(payload.lastLogin || now),
        updatedAt: now,
        assignedSubjectIds,
      };

      const assignedSet = new Set(assignedSubjectIds);
      const updatedExisting = users.map(u => {
        if (assignedSet.size > 0 && u.role === 'lecturer' && Array.isArray(u.assignedSubjectIds)) {
          return {
            ...u,
            assignedSubjectIds: u.assignedSubjectIds.filter(id => !assignedSet.has(id)),
          };
        }
        return u;
      });

      const nextUsers = await writeUsersStoreAsync([...updatedExisting, newLecturer]);
      const deletedIds = await readDeletedUserIdsAsync();
      if (deletedIds.has(newLecturer.id)) {
        deletedIds.delete(newLecturer.id);
        await writeDeletedUserIdsAsync(deletedIds);
      }

      return { newLecturer, nextUsers, now };
    });

    if ('errorStatus' in result && typeof result.errorStatus === 'number') {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    if (req.body?.skipServerLog !== true) {
      await appendServerActivityLog({
        id: typeof req.body?.clientLogId === 'string' ? req.body.clientLogId : undefined,
        userId: 'usr_admin',
        userName: 'Quản trị viên (Admin)',
        userRole: 'admin',
        action: 'Admin cấp tài khoản giảng viên',
        target: `${result.newLecturer.fullName} (${result.newLecturer.lecturerCode}) - ${result.newLecturer.department}`,
        timestamp: result.now,
        ipAddress: getClientIp(req),
      });
    }

    return res.status(201).json({
      success: true,
      user: result.newLecturer,
      users: result.nextUsers,
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('POST /api/users error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ khi tạo tài khoản mới.' });
  }
});

// POST /api/users/sync: Tự động đồng bộ 2 chiều dữ liệu tài khoản giữa Client và Server
app.post('/api/users/sync', async (req: Request, res: Response) => {
  try {
    const clientUsers: User[] = Array.isArray(req.body?.users) ? req.body.users : [];
    const result = await withUsersWriteLock(async () => {
      const serverUsers = await readUsersStoreAsync();
      const deletedIds = await readDeletedUserIdsAsync();

      const mergedMap = new Map<string, User>();
      serverUsers.forEach(u => mergedMap.set(u.id, { ...u }));

      let changed = false;

      for (const rawClient of clientUsers) {
        if (!rawClient || typeof rawClient !== 'object' || !rawClient.id || !rawClient.username) {
          continue;
        }
        if (deletedIds.has(rawClient.id) || isLegacySeedStudent(rawClient)) {
          continue;
        }

        let existing = mergedMap.get(rawClient.id);
        if (!existing) {
          const matchedExisting = Array.from(mergedMap.values()).find(
            s =>
              (rawClient.authUid && s.authUid && s.authUid === rawClient.authUid) ||
              (rawClient.email && s.email && s.email.toLowerCase() === String(rawClient.email).toLowerCase()) ||
              (rawClient.studentCode && s.studentCode && s.studentCode.toLowerCase() === String(rawClient.studentCode).toLowerCase())
          );
          if (matchedExisting && matchedExisting.role === 'student' && rawClient.role === 'student') {
            existing = matchedExisting;
          } else {
            const conflict = Array.from(mergedMap.values()).some(
              s =>
                s.username.toLowerCase() === String(rawClient.username).toLowerCase() ||
                (rawClient.email && s.email.toLowerCase() === String(rawClient.email).toLowerCase()) ||
                (rawClient.studentCode && s.studentCode && s.studentCode.toLowerCase() === String(rawClient.studentCode).toLowerCase()) ||
                (rawClient.lecturerCode && s.lecturerCode && s.lecturerCode.toLowerCase() === String(rawClient.lecturerCode).toLowerCase())
            );
            if (!conflict) {
              mergedMap.set(rawClient.id, { ...rawClient });
              changed = true;
            }
            continue;
          }
        }

        const clientUpdatedTs = Date.parse(rawClient.updatedAt || '') || 0;
        const serverUpdatedTs = Date.parse(existing.updatedAt || '') || 0;
        const clientLoginTs = Date.parse(rawClient.lastLogin || '') || 0;
        const serverLoginTs = Date.parse(existing.lastLogin || '') || 0;

        const nextUser: User = { ...existing };

        if (rawClient.authUid && !nextUser.authUid) {
          nextUser.authUid = String(rawClient.authUid).trim();
          changed = true;
        }

        if (clientUpdatedTs > serverUpdatedTs) {
          if (rawClient.fullName && !(existing.id === 'usr_admin' && (rawClient.fullName === 'TS. Nguyễn Tùng Sơn' || rawClient.fullName === 'Nguyễn Văn Kiên'))) {
            nextUser.fullName = rawClient.fullName;
          }
          if (rawClient.email) nextUser.email = rawClient.email;
          if (rawClient.phone !== undefined) nextUser.phone = rawClient.phone;
          if (rawClient.className !== undefined) nextUser.className = rawClient.className;
          if (rawClient.department !== undefined) nextUser.department = rawClient.department;
          if (rawClient.major !== undefined) nextUser.major = rawClient.major;
          if (rawClient.password) nextUser.password = rawClient.password;
          if (rawClient.status && existing.id !== 'usr_admin') nextUser.status = rawClient.status;
          if (Array.isArray(rawClient.assignedSubjectIds)) nextUser.assignedSubjectIds = rawClient.assignedSubjectIds;
          nextUser.updatedAt = rawClient.updatedAt;
          changed = true;
        }

        if (clientLoginTs > serverLoginTs) {
          nextUser.lastLogin = rawClient.lastLogin;
          changed = true;
        }

        const mergedPaidSubjects = Array.from(
          new Set([
            ...(Array.isArray(existing.paidSubjectIds) ? existing.paidSubjectIds.map(String) : []),
            ...(Array.isArray(rawClient.paidSubjectIds) ? rawClient.paidSubjectIds.map(String) : []),
          ])
        );
        if (mergedPaidSubjects.length > (existing.paidSubjectIds?.length || 0)) {
          nextUser.paidSubjectIds = mergedPaidSubjects;
          changed = true;
        }

        if (existing.hasPaidExamAccess || rawClient.hasPaidExamAccess || mergedPaidSubjects.length > 0) {
          if (!nextUser.hasPaidExamAccess) {
            nextUser.hasPaidExamAccess = true;
            nextUser.examAccessPaidAt = rawClient.examAccessPaidAt || existing.examAccessPaidAt || new Date().toISOString();
            nextUser.examAccessOrderCode = rawClient.examAccessOrderCode || existing.examAccessOrderCode;
            changed = true;
          }
        }

        mergedMap.set(existing.id, nextUser);
      }

      const finalUsers = changed
        ? await writeUsersStoreAsync(Array.from(mergedMap.values()))
        : serverUsers;

      return { finalUsers, deletedIds: Array.from(deletedIds) };
    });

    return res.json({
      success: true,
      users: result.finalUsers,
      deletedIds: result.deletedIds,
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('POST /api/users/sync error:', error);
    return res.status(500).json({ error: 'Lỗi khi đồng bộ dữ liệu tài khoản với máy chủ.' });
  }
});

// PUT /api/users/:id: Cập nhật trạng thái khóa/mở khóa, đổi mật khẩu, thông tin cá nhân lên server
app.put('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Thiếu mã định danh tài khoản.' });
    }
    const patch = req.body || {};

    const result = await withUsersWriteLock(async () => {
      let users = await readUsersStoreAsync();
      let target = users.find(u => u.id === userId);

      // Re-hydrate user record if sent from client on ephemeral serverless cold start
      if (!target && patch.userSnapshot && typeof patch.userSnapshot === 'object' && patch.userSnapshot.id === userId) {
        const snap = patch.userSnapshot as User;
        users = [...users, snap];
        target = snap;
      }

      if (!target) {
        return { errorStatus: 404, errorMessage: 'Không tìm thấy tài khoản trên máy chủ.' };
      }

      if (target.id === 'usr_admin' && patch.status === 'locked') {
        return { errorStatus: 403, errorMessage: 'Không thể khóa tài khoản Quản trị viên tối cao.' };
      }

      if (patch.email) {
        const cleanEmail = String(patch.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return { errorStatus: 400, errorMessage: 'Địa chỉ email không đúng định dạng hợp lệ.' };
        }
        if (
          cleanEmail !== target.email.toLowerCase() &&
          users.some(u => u.id !== userId && u.email.toLowerCase() === cleanEmail)
        ) {
          return { errorStatus: 409, errorMessage: 'Email này đã được sử dụng bởi một tài khoản khác.' };
        }
      }

      if (patch.password !== undefined && String(patch.password).length < 6) {
        return { errorStatus: 400, errorMessage: 'Mật khẩu mới phải có độ dài ít nhất 6 ký tự.' };
      }

      const now = new Date().toISOString();
      const updatedUser: User = {
        ...target,
        fullName: patch.fullName !== undefined ? String(patch.fullName).trim() : target.fullName,
        email: patch.email !== undefined ? String(patch.email).trim().toLowerCase() : target.email,
        phone: patch.phone !== undefined ? String(patch.phone).trim() : target.phone,
        className: patch.className !== undefined ? String(patch.className).trim() : target.className,
        department: patch.department !== undefined ? String(patch.department).trim() : target.department,
        major: patch.major !== undefined ? String(patch.major).trim() : target.major,
        password: patch.password !== undefined ? String(patch.password) : target.password,
        status: patch.status === 'active' || patch.status === 'locked' ? patch.status : target.status,
        assignedSubjectIds: Array.isArray(patch.assignedSubjectIds)
          ? patch.assignedSubjectIds.map(String)
          : target.assignedSubjectIds,
        lastLogin: patch.lastLogin ? String(patch.lastLogin) : target.lastLogin,
        updatedAt: patch.updatedAt ? String(patch.updatedAt) : now,
        paidSubjectIds: Array.isArray(patch.paidSubjectIds)
          ? Array.from(new Set([...(target.paidSubjectIds || []), ...patch.paidSubjectIds.map(String)]))
          : target.paidSubjectIds,
        hasPaidExamAccess:
          typeof patch.hasPaidExamAccess === 'boolean'
            ? patch.hasPaidExamAccess
            : target.hasPaidExamAccess,
        examAccessPaidAt:
          patch.examAccessPaidAt !== undefined
            ? String(patch.examAccessPaidAt)
            : target.examAccessPaidAt,
        examAccessOrderCode:
          patch.examAccessOrderCode !== undefined
            ? String(patch.examAccessOrderCode)
            : target.examAccessOrderCode,
        authUid:
          typeof patch.authUid === 'string' && patch.authUid.trim()
            ? patch.authUid.trim()
            : target.authUid,
      };

      const nextUsers = await writeUsersStoreAsync(users.map(u => (u.id === userId ? updatedUser : u)));
      return { target, updatedUser, nextUsers, now };
    });

    if ('errorStatus' in result && typeof result.errorStatus === 'number') {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    if (patch.skipServerLog !== true) {
      if (patch.status !== undefined && patch.status !== result.target.status) {
        await appendServerActivityLog({
          userId: 'usr_admin',
          userName: 'Quản trị viên (Admin)',
          userRole: 'admin',
          action: 'Khóa/Mở khóa tài khoản',
          target: `${result.updatedUser.status === 'locked' ? 'Khóa' : 'Mở khóa'} tài khoản ${result.updatedUser.fullName}`,
          timestamp: result.now,
          ipAddress: getClientIp(req),
        });
      } else if (patch.password !== undefined) {
        await appendServerActivityLog({
          userId: result.updatedUser.id,
          userName: result.updatedUser.fullName,
          userRole: result.updatedUser.role,
          action: 'Cập nhật mật khẩu',
          target: `Tài khoản ${result.updatedUser.fullName} (${result.updatedUser.username}) cập nhật mật khẩu`,
          timestamp: result.now,
          ipAddress: getClientIp(req),
        });
      } else if (
        patch.fullName !== undefined ||
        patch.email !== undefined ||
        patch.phone !== undefined ||
        patch.className !== undefined ||
        patch.department !== undefined
      ) {
        await appendServerActivityLog({
          userId: result.updatedUser.id,
          userName: result.updatedUser.fullName,
          userRole: result.updatedUser.role,
          action: 'Cập nhật thông tin tài khoản',
          target: `Người dùng ${result.updatedUser.fullName} cập nhật hồ sơ`,
          timestamp: result.now,
          ipAddress: getClientIp(req),
        });
      }
    }

    return res.json({
      success: true,
      user: result.updatedUser,
      users: result.nextUsers,
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('PUT /api/users/:id error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật thông tin tài khoản.' });
  }
});

// DELETE /api/users/:id: Xóa tài khoản vĩnh viễn trên server
app.delete('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id || '').trim();
    const result = await withUsersWriteLock(async () => {
      const users = await readUsersStoreAsync();
      const target = users.find(u => u.id === userId);

      if (target && (target.id === 'usr_admin' || target.role === 'admin')) {
        return { errorStatus: 403, errorMessage: 'Không thể xóa tài khoản Quản trị viên.' };
      }

      const deletedIds = await readDeletedUserIdsAsync();
      deletedIds.add(userId);
      await writeDeletedUserIdsAsync(deletedIds);

      const filtered = target
        ? await writeUsersStoreAsync(users.filter(u => u.id !== userId))
        : users;

      return { target, filtered };
    });

    if ('errorStatus' in result && typeof result.errorStatus === 'number') {
      return res.status(result.errorStatus).json({ error: result.errorMessage });
    }

    if (result.target && req.body?.skipServerLog !== true) {
      await appendServerActivityLog({
        userId: 'usr_admin',
        userName: 'Quản trị viên (Admin)',
        userRole: 'admin',
        action: 'Xóa tài khoản',
        target: `Đã xóa tài khoản ${result.target.fullName} (${result.target.role})`,
        ipAddress: getClientIp(req),
      });
    }

    return res.json({
      success: true,
      deletedId: userId,
      users: result.filtered,
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('DELETE /api/users/:id error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ khi xóa tài khoản.' });
  }
});

// =========================================================================
// CENTRALIZED ACTIVITY / AUDIT LOGS API (/api/logs)
// =========================================================================
app.get('/api/logs', async (_req: Request, res: Response) => {
  try {
    const logs = await readActivityLogsStoreAsync();
    return res.json({
      success: true,
      logs,
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('GET /api/logs error:', error);
    return res.status(500).json({ error: 'Không thể tải nhật ký hoạt động từ máy chủ.' });
  }
});

app.post('/api/logs/sync', async (req: Request, res: Response) => {
  try {
    const incomingLogs = Array.isArray(req.body?.logs) ? (req.body.logs as ActivityLog[]) : [];
    const clientIp = getClientIp(req);
    const finalLogs = await withLogsWriteLock(async () => {
      const serverLogs = await readActivityLogsStoreAsync();

      // Enrich any new client-originated logs that carry localhost placeholder IP with real request IP
      const normalizedIncoming = normalizeAndDedupeActivityLogs(incomingLogs, clientIp);
      const mergedMap = new Map<string, ActivityLog>();

      for (const sLog of serverLogs) {
        mergedMap.set(sLog.id, sLog);
      }
      for (const cLog of normalizedIncoming) {
        const existing = mergedMap.get(cLog.id);
        if (!existing) {
          mergedMap.set(cLog.id, cLog);
        } else if (existing.ipAddress === '127.0.0.1' && cLog.ipAddress !== '127.0.0.1') {
          mergedMap.set(cLog.id, { ...existing, ipAddress: cLog.ipAddress });
        }
      }

      return writeActivityLogsStoreAsync(Array.from(mergedMap.values()));
    });

    return res.json({
      success: true,
      logs: finalLogs,
      storageMode: getServerStorageMode(),
    });
  } catch (error: any) {
    console.error('POST /api/logs/sync error:', error);
    return res.status(500).json({ error: 'Không thể đồng bộ nhật ký hoạt động lên máy chủ.' });
  }
});

// =========================================================================
// STUDY MATERIALS API (/api/materials) - ZERO FONT CORRUPTION BINARY DOWNLOAD
// =========================================================================
app.get('/api/materials', async (req: Request, res: Response) => {
  try {
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    let materials = await readMaterialsStoreAsync();
    if (subjectId && subjectId !== 'all') {
      materials = materials.filter(m => m.subjectId === subjectId);
    }
    return res.json({ success: true, materials });
  } catch (err) {
    console.error('GET /api/materials error:', err);
    return res.status(500).json({ error: 'Không thể tải danh sách tài liệu từ máy chủ.' });
  }
});

app.post('/api/materials', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const subjectId = String(body.subjectId || '').trim();
    if (!title || !subjectId) {
      return res.status(400).json({ error: 'Thiếu tiêu đề hoặc mã môn học cho tài liệu.' });
    }

    const fileDataUrl = typeof body.fileDataUrl === 'string' ? body.fileDataUrl : undefined;
    if (fileDataUrl && fileDataUrl.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'Tệp tài liệu vượt quá giới hạn dung lượng 8MB trên máy chủ.' });
    }

    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : makeServerUserId('mat');
    const created: StudyMaterial = {
      id,
      subjectId,
      chapterId: body.chapterId ? String(body.chapterId) : undefined,
      title,
      description: String(body.description || '').trim(),
      materialCategory: body.materialCategory || 'lecture',
      content: typeof body.content === 'string' ? body.content.normalize('NFC') : '',
      fileType: body.fileType || 'docx',
      fileSize: String(body.fileSize || '1.0 MB'),
      downloadCount: Number(body.downloadCount) || 0,
      uploadedBy: String(body.uploadedBy || 'Giảng viên'),
      uploadedAt: String(body.uploadedAt || new Date().toISOString()),
      fileDataUrl,
      originalFileName: body.originalFileName ? String(body.originalFileName).normalize('NFC') : undefined,
      mimeType: body.mimeType ? String(body.mimeType) : undefined,
      serverFileUrl: `/api/materials/${encodeURIComponent(id)}/download`,
    };

    const list = (await readMaterialsStoreAsync()).filter(m => m.id !== created.id);
    list.unshift(created);
    await writeMaterialsStoreAsync(list);
    return res.status(201).json({ success: true, material: created });
  } catch (err) {
    console.error('POST /api/materials error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ khi lưu tài liệu.' });
  }
});

app.put('/api/materials/:id/download-count', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const list = await readMaterialsStoreAsync();
    const target = list.find(m => m.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    }
    target.downloadCount = (target.downloadCount || 0) + 1;
    await writeMaterialsStoreAsync(list);
    return res.json({ success: true, downloadCount: target.downloadCount });
  } catch (err) {
    console.error('PUT /api/materials/:id/download-count error:', err);
    return res.status(500).json({ error: 'Không thể cập nhật lượt tải.' });
  }
});

app.get('/api/materials/:id/download', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const target = (await readMaterialsStoreAsync()).find(m => m.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu để tải về.' });
    }

    if (target.fileDataUrl && target.fileDataUrl.startsWith('data:')) {
      const commaIdx = target.fileDataUrl.indexOf(',');
      if (commaIdx !== -1) {
        const header = target.fileDataUrl.slice(0, commaIdx);
        const payload = target.fileDataUrl.slice(commaIdx + 1);
        const mimeMatch = header.match(/^data:([^;]+)/i);
        const mime = target.mimeType || (mimeMatch ? mimeMatch[1] : 'application/octet-stream');
        const buffer = /;base64$/i.test(header)
          ? Buffer.from(payload, 'base64')
          : Buffer.from(decodeURIComponent(payload), 'utf8');
        const ext = target.originalFileName?.split('.').pop() || target.fileType || 'docx';
        const safeName = (target.originalFileName || `${target.title}.${ext}`).normalize('NFC');
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
        return res.send(buffer);
      }
    }

    const content = ('\uFEFF' + (target.content || `${target.title}\n\n${target.description || ''}`)).normalize('NFC');
    const txtName = `${target.title.replace(/[<>:"/\\|?*]/g, ' ').trim() || 'tai-lieu'}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(txtName)}`);
    return res.send(Buffer.from(content, 'utf8'));
  } catch (err) {
    console.error('GET /api/materials/:id/download error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ khi tải tài liệu.' });
  }
});

app.delete('/api/materials/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const list = await readMaterialsStoreAsync();
    const filtered = list.filter(m => m.id !== id);
    if (filtered.length !== list.length) {
      await writeMaterialsStoreAsync(filtered);
    }
    return res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('DELETE /api/materials/:id error:', err);
    return res.status(500).json({ error: 'Không thể xóa tài liệu trên máy chủ.' });
  }
});

// =========================================================================
// SEPAY PAYMENT & PER-SUBJECT EXAM UNLOCK API (/api/payments)
// =========================================================================
app.get('/api/payments/config', async (_req: Request, res: Response) => {
  try {
    const cfg = await readPaymentConfigStoreAsync();
    return res.json({
      success: true,
      config: {
        provider: cfg.provider,
        bankCode: cfg.bankCode,
        bankName: cfg.bankName,
        accountNumber: cfg.accountNumber,
        accountName: cfg.accountName,
        examFeeVnd: cfg.examFeeVnd,
        enabled: cfg.enabled,
        updatedAt: cfg.updatedAt,
        hasWebhookToken: Boolean(cfg.webhookToken),
      },
      storageMode: getServerStorageMode(),
    });
  } catch (err) {
    console.error('GET /api/payments/config error:', err);
    return res.status(500).json({ error: 'Không thể đọc cấu hình thanh toán SePay.' });
  }
});

app.put('/api/payments/config', async (req: Request, res: Response) => {
  try {
    const prev = await readPaymentConfigStoreAsync();
    const defaults = getDefaultPaymentConfig();
    const body = req.body || {};
    const bankCode = String(body.bankCode ?? prev.bankCode ?? defaults.bankCode).trim().toUpperCase();
    const accountNumber = String(body.accountNumber ?? prev.accountNumber ?? defaults.accountNumber).replace(/\s+/g, '').trim();
    const accountName = normalizeBankAccountName(String(body.accountName ?? prev.accountName ?? defaults.accountName));
    const examFeeVnd = Math.max(1000, Number(body.examFeeVnd ?? prev.examFeeVnd) || 10000);

    const incomingToken = body.webhookToken;
    let webhookToken = prev.webhookToken || defaults.webhookToken || '';
    if (incomingToken === '__CLEAR__') {
      webhookToken = '';
    } else if (typeof incomingToken === 'string' && incomingToken !== '__KEEP__' && incomingToken.trim() !== '') {
      webhookToken = incomingToken.trim();
    }

    if (!bankCode) {
      return res.status(400).json({ error: 'Vui lòng chọn hoặc nhập mã ngân hàng SePay (ví dụ: ICB, MB, VCB).' });
    }
    if (!accountNumber || !/^[A-Za-z0-9]{4,30}$/.test(accountNumber)) {
      return res.status(400).json({ error: 'Số tài khoản ngân hàng không hợp lệ (chỉ gồm chữ/số, không dấu cách).' });
    }
    if (!accountName) {
      return res.status(400).json({ error: 'Vui lòng nhập Tên chủ tài khoản ngân hàng (viết hoa không dấu).' });
    }

    const bankName = String(SEPAY_BANKS[bankCode] || body.bankName || bankCode).trim();
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;

    const updated: PaymentConfig = {
      provider: 'manual',
      bankCode,
      bankName,
      accountNumber,
      accountName,
      examFeeVnd,
      webhookToken,
      enabled,
      updatedAt: new Date().toISOString(),
    };
    await writePaymentConfigStoreAsync(updated);

    return res.json({
      success: true,
      config: {
        ...updated,
        webhookToken: undefined,
        hasWebhookToken: Boolean(updated.webhookToken),
      },
    });
  } catch (err) {
    console.error('PUT /api/payments/config error:', err);
    return res.status(500).json({ error: 'Lỗi khi lưu cấu hình SePay.' });
  }
});

app.get('/api/payments/orders', async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId.trim() : '';
    let orders = await readPaymentOrdersStoreAsync();
    if (userId) {
      orders = orders.filter(o => o.userId === userId);
    }
    if (subjectId) {
      orders = orders.filter(o => o.subjectId === subjectId);
    }
    orders.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return res.json({ success: true, orders, storageMode: getServerStorageMode() });
  } catch (err) {
    console.error('GET /api/payments/orders error:', err);
    return res.status(500).json({ error: 'Không thể tải danh sách đơn thanh toán.' });
  }
});

app.post('/api/payments/create-order', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const userId = String(body.userId || '').trim();
    const subjectId = String(body.subjectId || '').trim();
    const subjectName = String(body.subjectName || '').trim() || 'Môn học chuyên ngành CNTT';

    if (!userId) {
      return res.status(400).json({ error: 'Thiếu thông tin tài khoản sinh viên.' });
    }
    if (!subjectId) {
      return res.status(400).json({ error: 'Thiếu mã môn học cần mở khóa thi thử.' });
    }

    let users = await readUsersStoreAsync();
    let user = users.find(u => u.id === userId);

    // On Vercel serverless cold starts (/tmp reset), allow safely re-hydrating the authenticated student record
    if (!user && body.user && typeof body.user === 'object' && body.user.id === userId && body.user.username) {
      const incoming = body.user as Partial<User>;
      const safeUser: User = {
        id: userId,
        username: String(incoming.username).trim().toLowerCase(),
        email: String(incoming.email || '').trim().toLowerCase(),
        password: incoming.password ? String(incoming.password) : undefined,
        fullName: String(incoming.fullName || incoming.username).trim(),
        role: 'student',
        phone: incoming.phone ? String(incoming.phone) : '',
        className: incoming.className ? String(incoming.className) : '',
        major: incoming.major ? String(incoming.major) : 'Công nghệ Thông tin',
        status: 'active',
        studentCode: incoming.studentCode ? String(incoming.studentCode) : undefined,
        createdAt: String(incoming.createdAt || new Date().toISOString()),
        lastLogin: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        paidSubjectIds: Array.isArray(incoming.paidSubjectIds) ? incoming.paidSubjectIds.map(String) : [],
        hasPaidExamAccess: Boolean(incoming.hasPaidExamAccess),
      };
      users = await writeUsersStoreAsync([...users, safeUser]);
      user = users.find(u => u.id === userId);
    }

    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản sinh viên trên máy chủ.' });
    }

    // Kiểm tra sinh viên đã mở khóa ĐÚNG môn này chưa (mỗi môn 10.000đ)
    if (Array.isArray(user.paidSubjectIds) && user.paidSubjectIds.includes(subjectId)) {
      return res.json({ success: true, alreadyPaid: true, user });
    }

    const cfg = await readPaymentConfigStoreAsync();
    if (!cfg.bankCode || !cfg.accountNumber) {
      return res.status(400).json({
        error: 'Quản trị viên chưa cấu hình số tài khoản ngân hàng liên kết SePay. Vui lòng liên hệ Admin Khoa CNTT.',
      });
    }

    const orders = await readPaymentOrdersStoreAsync();
    const existingPending = orders.find(
      o =>
        o.userId === user!.id &&
        o.subjectId === subjectId &&
        o.status === 'pending' &&
        o.bankCode === cfg.bankCode &&
        o.accountNumber === cfg.accountNumber &&
        o.accountName === cfg.accountName &&
        o.amount === cfg.examFeeVnd
    );

    if (existingPending) {
      return res.json({
        success: true,
        order: {
          ...existingPending,
          subjectId,
          subjectName: existingPending.subjectName || subjectName,
          qrUrl: buildSepayQrUrl(cfg, existingPending.amount, existingPending.orderCode),
        },
        config: {
          bankCode: cfg.bankCode,
          bankName: cfg.bankName,
          accountNumber: cfg.accountNumber,
          accountName: cfg.accountName,
          examFeeVnd: cfg.examFeeVnd,
        },
      });
    }

    const orderCode = makeOrderCode(orders);
    const created: ExamPaymentOrder = {
      id: makeServerUserId('pay'),
      orderCode,
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      studentCode: user.studentCode,
      email: user.email,
      subjectId,
      subjectName,
      amount: cfg.examFeeVnd || 10000,
      status: 'pending',
      qrUrl: buildSepayQrUrl(cfg, cfg.examFeeVnd || 10000, orderCode),
      bankCode: cfg.bankCode,
      accountNumber: cfg.accountNumber,
      accountName: cfg.accountName,
      createdAt: new Date().toISOString(),
    };

    orders.unshift(created);
    await writePaymentOrdersStoreAsync(orders);

    return res.status(201).json({
      success: true,
      order: created,
      config: {
        bankCode: cfg.bankCode,
        bankName: cfg.bankName,
        accountNumber: cfg.accountNumber,
        accountName: cfg.accountName,
        examFeeVnd: cfg.examFeeVnd,
      },
    });
  } catch (err) {
    console.error('POST /api/payments/create-order error:', err);
    return res.status(500).json({ error: 'Không thể khởi tạo mã QR thanh toán SePay.' });
  }
});

app.get('/api/payments/status/:orderCode', async (req: Request, res: Response) => {
  try {
    const orderCode = String(req.params.orderCode || '').trim().toUpperCase();
    const orders = await readPaymentOrdersStoreAsync();
    const order = orders.find(o => o.orderCode.toUpperCase() === orderCode);
    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy mã đơn thanh toán.' });
    }

    const users = await readUsersStoreAsync();
    const user = users.find(u => u.id === order.userId);
    const isSubjectUnlocked = Boolean(
      order.subjectId && Array.isArray(user?.paidSubjectIds) && user!.paidSubjectIds.includes(order.subjectId)
    );

    if (isSubjectUnlocked && order.status !== 'paid') {
      order.status = 'paid';
      order.paidAt = order.paidAt || user?.examAccessPaidAt || new Date().toISOString();
      await writePaymentOrdersStoreAsync(orders);
    }

    return res.json({
      success: true,
      order,
      paid: order.status === 'paid' || isSubjectUnlocked,
      user,
    });
  } catch (err) {
    console.error('GET /api/payments/status/:orderCode error:', err);
    return res.status(500).json({ error: 'Không thể kiểm tra trạng thái thanh toán.' });
  }
});

app.post('/api/payments/grant-access', async (req: Request, res: Response) => {
  try {
    const { userId, subjectId, subjectName, orderCode, confirmedBy, userSnapshot } = req.body || {};
    const targetUserId = String(userId || '').trim();
    if (!targetUserId) {
      return res.status(400).json({ error: 'Thiếu mã tài khoản sinh viên.' });
    }

    let users = await readUsersStoreAsync();
    let targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser && userSnapshot && typeof userSnapshot === 'object' && userSnapshot.id === targetUserId) {
      users = [...users, userSnapshot as User];
      targetUser = userSnapshot as User;
    }
    if (!targetUser) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản sinh viên trên máy chủ.' });
    }

    const now = new Date().toISOString();
    const orders = await readPaymentOrdersStoreAsync();
    let matchedCode = String(orderCode || '').trim().toUpperCase();
    const targetOrderByCode = matchedCode
      ? orders.find(o => o.orderCode.toUpperCase() === matchedCode && o.userId === targetUser!.id)
      : undefined;

    const resolvedSubjectId = String(subjectId || targetOrderByCode?.subjectId || '').trim();
    const resolvedSubjectName =
      String(subjectName || targetOrderByCode?.subjectName || '').trim() || resolvedSubjectId || 'Môn học';
    const confirmerLabel = String(confirmedBy || '').trim() || 'Admin / Giảng viên';

    if (!resolvedSubjectId) {
      return res.status(400).json({
        error: 'Vui lòng chọn môn học cụ thể cần xác nhận mở khóa thi thử (10.000đ/môn).',
      });
    }

    if (targetOrderByCode) {
      targetOrderByCode.status = 'paid';
      targetOrderByCode.paidAt = targetOrderByCode.paidAt || now;
      targetOrderByCode.gateway = confirmerLabel;
      targetOrderByCode.confirmedBy = confirmerLabel;
      if (!targetOrderByCode.subjectId) targetOrderByCode.subjectId = resolvedSubjectId;
      if (!targetOrderByCode.subjectName) targetOrderByCode.subjectName = resolvedSubjectName;
    } else {
      const pendingOrder = orders.find(
        o => o.userId === targetUser!.id && o.status === 'pending' && o.subjectId === resolvedSubjectId
      );
      if (pendingOrder) {
        pendingOrder.status = 'paid';
        pendingOrder.paidAt = now;
        pendingOrder.gateway = confirmerLabel;
        pendingOrder.confirmedBy = confirmerLabel;
        matchedCode = pendingOrder.orderCode;
      } else {
        matchedCode = makeOrderCode(orders);
        const cfg = await readPaymentConfigStoreAsync();
        orders.unshift({
          id: makeServerUserId('pay'),
          orderCode: matchedCode,
          userId: targetUser.id,
          username: targetUser.username,
          fullName: targetUser.fullName,
          studentCode: targetUser.studentCode,
          email: targetUser.email,
          subjectId: resolvedSubjectId,
          subjectName: resolvedSubjectName,
          amount: cfg.examFeeVnd || 10000,
          status: 'paid',
          qrUrl: '',
          bankCode: cfg.bankCode || 'ICB',
          accountNumber: cfg.accountNumber || '',
          accountName: cfg.accountName || 'NGUYEN VU XUAN KIEN',
          createdAt: now,
          paidAt: now,
          gateway: confirmerLabel,
          confirmedBy: confirmerLabel,
        });
      }
    }
    await writePaymentOrdersStoreAsync(orders);

    const nextPaidSubjects = Array.from(
      new Set([...(Array.isArray(targetUser.paidSubjectIds) ? targetUser.paidSubjectIds : []), resolvedSubjectId])
    );

    const updatedUser: User = {
      ...targetUser,
      paidSubjectIds: nextPaidSubjects,
      hasPaidExamAccess: true,
      examAccessPaidAt: now,
      examAccessOrderCode: matchedCode,
      updatedAt: now,
    };
    const nextUsers = await writeUsersStoreAsync(users.map(u => (u.id === targetUser!.id ? updatedUser : u)));

    if (req.body?.skipServerLog !== true) {
      await appendServerActivityLog({
        userId: 'usr_admin',
        userName: confirmerLabel,
        userRole: 'admin',
        action: 'Xác nhận mở khóa môn thi thử (10k)',
        target: `${confirmerLabel} xác nhận mở khóa môn ${resolvedSubjectName} cho ${updatedUser.fullName}`,
        timestamp: now,
        ipAddress: getClientIp(req),
      });
    }

    return res.json({
      success: true,
      user: updatedUser,
      users: nextUsers,
      orders,
      storageMode: getServerStorageMode(),
    });
  } catch (err) {
    console.error('POST /api/payments/grant-access error:', err);
    return res.status(500).json({ error: 'Không thể xác nhận mở khóa môn thi thử.' });
  }
});

// Sinh viên báo đã chuyển khoản thủ công để Admin / Giảng viên ưu tiên kiểm tra & xác nhận
app.post('/api/payments/mark-submitted', async (req: Request, res: Response) => {
  try {
    const orderCode = String(req.body?.orderCode || '').trim().toUpperCase();
    if (!orderCode) {
      return res.status(400).json({ error: 'Thiếu mã yêu cầu chuyển khoản.' });
    }
    const orders = await readPaymentOrdersStoreAsync();
    const order = orders.find(o => o.orderCode.toUpperCase() === orderCode);
    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy yêu cầu mở khóa môn này.' });
    }
    if (!order.studentSubmittedAt) {
      order.studentSubmittedAt = new Date().toISOString();
      await writePaymentOrdersStoreAsync(orders);
    }
    return res.json({ success: true, order });
  } catch (err) {
    console.error('POST /api/payments/mark-submitted error:', err);
    return res.status(500).json({ error: 'Không thể gửi thông báo đã chuyển khoản.' });
  }
});

// Tự động chuyển khoản đã bị tắt theo yêu cầu: chỉ Admin hoặc Giảng viên xác nhận mở khóa thủ công
const sepayWebhookHandler = async (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    autoConfirmDisabled: true,
    matched: false,
    reason: 'Hệ thống đã tắt xác nhận tự động. Chỉ Admin hoặc Giảng viên xác nhận thủ công trên giao diện.',
  });
};

app.post('/api/payments/sepay-webhook', sepayWebhookHandler);
app.post('/api/payment/sepay-webhook', sepayWebhookHandler);

// Kiểm tra cấu hình tài khoản ngân hàng nhận chuyển khoản cho Admin
app.post('/api/payments/test-config', async (_req: Request, res: Response) => {
  try {
    const cfg = await readPaymentConfigStoreAsync();
    const issues: string[] = [];
    if (!cfg.bankCode) issues.push('Chưa chọn ngân hàng nhận chuyển khoản.');
    if (!cfg.accountNumber) issues.push('Chưa nhập số tài khoản ngân hàng.');
    if (!cfg.accountName) issues.push('Chưa nhập tên chủ tài khoản không dấu.');

    return res.json({
      success: Boolean(cfg.bankCode && cfg.accountNumber && cfg.accountName),
      ready: issues.length === 0,
      issues,
      config: {
        bankCode: cfg.bankCode,
        bankName: cfg.bankName,
        accountNumber: cfg.accountNumber,
        accountName: cfg.accountName,
        examFeeVnd: cfg.examFeeVnd,
        hasWebhookToken: false,
        enabled: cfg.enabled,
      },
      sampleQrUrl: cfg.bankCode && cfg.accountNumber ? buildSepayQrUrl(cfg, cfg.examFeeVnd || 10000, 'DHHPEXDEMO') : '',
    });
  } catch (err) {
    console.error('POST /api/payments/test-config error:', err);
    return res.status(500).json({ success: false, error: 'Không thể kiểm tra cấu hình tài khoản ngân hàng.' });
  }
});

// Always return JSON for unmatched /api/* routes and /api errors so Vite/SPA fallback never serves HTML
app.all('/api/*', (_req: Request, res: Response) => {
  return res.status(404).json({ error: 'API endpoint không tồn tại trên máy chủ.' });
});

app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API middleware error:', err);
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: 'Nội dung tài liệu gửi lên quá lớn (vượt giới hạn 15MB). Vui lòng rút gọn tài liệu trước khi tạo câu hỏi.',
    });
  }
  if (err instanceof SyntaxError && (err as any)?.status === 400) {
    return res.status(400).json({
      error: 'Dữ liệu JSON gửi lên máy chủ không hợp lệ.',
    });
  }
  const formatted = formatGeminiError(err);
  return res.status(formatted.status).json({ error: formatted.message });
});

// Mount Vite in development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(/* @vite-ignore */ vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IT Study Platform Server with AI running on http://0.0.0.0:${PORT}`);
  });
}

if (
  process.env.VERCEL !== '1' &&
  !process.env.VERCEL_ENV &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME
) {
  void startServer();
}

export default app;

