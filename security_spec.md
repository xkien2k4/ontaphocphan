# Firestore Security Architecture & Test Specification

## Phase 0: Core Data Invariants
1. **Master Deny Safety Net:** No collection is readable or writable unless explicitly matched and permitted.
2. **Email Verification Mandatory:** Unverified accounts (`request.auth.token.email_verified != true`) and unauthenticated clients cannot read or write any collection.
3. **Admin Escalation Prevention:** A student self-registering into `/users/{userId}` can ONLY create `role == 'student'`, `status == 'active'`, `hasPaidExamAccess == false`, `paidSubjectIds == []`, and `userId == request.auth.uid` with `authUid == request.auth.uid`.
4. **PII Isolation & Query Enforcement:** `/users/{userId}` contains `email`, `phone`, `studentCode`. Non-admin users can only `get` their own document (`isOwner` / `authUid == request.auth.uid`) and `list` only when constrained to `resource.data.authUid == request.auth.uid`. Only the bootstrapped verified Admin (`nguyenvxkien@gmail.com` with `email_verified == true`) can `list` all users without `get()`/`exists()` inside `allow list`.
5. **Payment Order State Integrity:** Students can only create `payment_orders` with `status == 'pending'`, `authUid == request.auth.uid`, and `amount >= 1000`. Once an order reaches terminal state `'paid'` or `'cancelled'`, non-admin users are locked out from any further update. Only Admin can transition `status` to `'paid'` or set `confirmedBy`.
6. **Temporal Integrity & Path Hardening:** Document IDs must match `^[a-zA-Z0-9_-]+$` (`<= 128` chars) and all `createdAt` / `updatedAt` / `deletedAt` timestamps must strictly equal `request.time`.

## Phase 1: The "Dirty Dozen" Attack Payloads (Must All Yield PERMISSION_DENIED)
1. **Unauthenticated PII Read:** Unauthenticated `get(/users/usr_admin)` or `list(/users)`.
2. **Unverified Admin Email Spoof:** Auth token `{ email: 'nguyenvxkien@gmail.com', email_verified: false }` attempting `list(/users)` or writing `/admins/fakeUid`.
3. **Self-Assigned Admin Role on Registration:** Signed-in verified student (`uid: 'stu_123'`) creates `/users/stu_123` with `{ role: 'admin', ... }`.
4. **Free Mock Exam Bypass on Registration:** Signed-in verified student creates `/users/stu_123` with `{ hasPaidExamAccess: true, paidSubjectIds: ['sub_dsa'] }`.
5. **Identity Spoofing on User Create:** Signed-in verified student (`uid: 'stu_123'`) creates `/users/other_uid` or sets `authUid: 'victim_uid'`.
6. **Shadow Field Injection on User Create:** Verified student includes ghost field `{ isSuperAdmin: true }` in `/users/stu_123`.
7. **Privilege Escalation Update (Update-Gap):** Verified student updates their own `/users/stu_123` with `{ role: 'lecturer' }` or `{ paidSubjectIds: ['sub_dsa'] }` or `{ status: 'active' }` tampering.
8. **Immortal Field Tampering:** Verified student updates their own `/users/stu_123` modifying `createdAt` or `id`.
9. **Spoofed Client Timestamp:** Create `/users/stu_123` with hardcoded `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time`.
10. **Cross-User PII Snooping:** Verified student (`uid: 'stu_123'`) calls `get(/users/stu_456)` or `list(/users)` without matching `authUid`.
11. **Self-Approved Payment Bypass:** Verified student creates or updates `/payment_orders/ord_1` setting `status: 'paid'` and `confirmedBy: 'self'`.
12. **Path / Resource Exhaustion Poisoning:** Creating `/users/${'a'.repeat(500)}` or passing a 50KB `fullName` string or `paidSubjectIds` array exceeding size bounds.
13. **Audit Log Forgery / Tampering:** Non-admin users attempting `list(/activity_logs)`, updating an existing `/activity_logs/{id}`, or creating a log entry impersonating `userRole: 'admin'` or another `authUid`.
