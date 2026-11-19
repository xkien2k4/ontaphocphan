# HỆ THỐNG ÔN TẬP & KHẢO THÍ TRỰC TUYẾN KHOA CÔNG NGHỆ THÔNG TIN
### Trường Đại Học Hải Phòng — IT Study Platform

Nền tảng ôn luyện kiến thức, quản lý học phần, đồ án chuyên ngành và thi thử trực tuyến (theo đề cương học phần) dành cho sinh viên và giảng viên **Khoa Công nghệ Thông tin – Trường Đại học Hải Phòng**.

- **Mã nguồn tổng hợp:** https://github.com/xkien2k4/
- **Tác giả & Quản trị hệ thống:** Nguyễn Vũ Xuân Kiên · SĐT / Zalo: `0334613184` · Email: `nguyenvxkien@gmail.com`

---

## MỤC LỤC
1. [Tổng quan Chức năng Chi tiết của Hệ thống](#-tổng-quan-chức-năng-chi-tiết-của-hệ-thống)
2. [Kiến trúc Thư mục, Cơ sở dữ liệu & Hệ thống API](#-kiến-trúc-thư-mục-cơ-sở-dữ-liệu--hệ-thống-api)
3. [Hướng dẫn Cài đặt & Chạy ở Máy cục bộ (Localhost)](#-hướng-dẫn-cài-đặt--chạy-ở-máy-cục-bộ-localhost)
4. [Hướng dẫn Kết nối Firebase Authentication & Cloud Firestore](#-hướng-dẫn-kết-nối-firebase-authentication--cloud-firestore)
5. [Hướng dẫn Upload Source lên Vercel & Đồng bộ Đa thiết bị (Không lỗi)](#-hướng-dẫn-upload-source-lên-vercel--đồng-bộ-đa-thiết-bị-không-lỗi)
6. [Kiểm tra Đồng bộ Thực tế từ Điện thoại / Tab Ẩn danh](#-kiểm-tra-đồng-bộ-thực-tế-từ-điện-thoại--tab-ẩn-danh)
7. [Xử lý Các lỗi Thường gặp khi Deploy](#-xử-lý-các-lỗi-thường-gặp-khi-deploy)
8. [Danh sách Tài khoản Mặc định (Admin & 36 Giảng viên)](#-danh-sách-tài-khoản-mặc-định-admin--36-giảng-viên)
9. [Danh mục 26 Học phần Mặc định](#-danh-mục-26-học-phần-mặc-định)

---

## 🎯 TỔNG QUAN CHỨC NĂNG CHI TIẾT CỦA HỆ THỐNG

Hệ thống được phân quyền chặt chẽ theo **3 vai trò (RBAC)**: `student` (Sinh viên), `lecturer` (Giảng viên) và `admin` (Quản trị viên).

### 1. Chức năng dành cho Sinh viên (`student`)
- **Đăng ký & Đăng nhập tập trung đa thiết bị:**
  - Sinh viên tự đăng ký bằng Họ tên, MSSV, Lớp sinh hoạt, Ngành học, Email và Mật khẩu trực tiếp trên hệ thống; tài khoản được lưu ngay lên cơ sở dữ liệu máy chủ (`POST /api/users/register`) kèm nhật ký bảo mật và tự động xuất hiện trong **Trung tâm Quản trị Hệ thống → Quản lý Tài khoản**.
  - Đăng nhập linh hoạt bằng **MSSV, Tên đăng nhập hoặc Email** + Mật khẩu (`POST /api/users/login`) trên mọi thiết bị và trình duyệt (kể cả tab ẩn danh).
- **Ôn tập theo Chương & Tài liệu (Miễn phí 100%):**
  - Xem danh sách toàn bộ 26 môn học (Lý thuyết, Thực hành, Đồ án).
  - Vào phòng ôn tập trắc nghiệm tùy chỉnh theo môn, chương, mức độ (Dễ / Trung bình / Khó) và số câu hỏi; có chế độ xem đáp án + giải thích ngay lập tức.
  - Tải về đề cương học phần, slide/tài liệu `.docx` / `.txt` chuẩn UTF-8 không lỗi font.
  - Đăng ký đề tài Đồ án học phần và nộp link báo cáo/mã nguồn cho giảng viên phụ trách.
- **Hệ thống Thi thử (Đề cương học phần — 10.000đ/môn):**
  - Toàn bộ đề thi thử mặc định bị khóa theo từng môn học để kiểm soát quyền truy cập.
  - Sinh viên chọn môn cần thi thử → mở QR chuyển khoản **10.000đ** (VietinBank `10387719154` – `NGUYEN VU XUAN KIEN`) kèm mã đơn tự động (`DHHPEX...`) → bấm báo đã chuyển khoản → **Admin hoặc Giảng viên** xác nhận mở khóa vĩnh viễn đúng môn đó.
  - Hỗ trợ làm bài thi trắc nghiệm có đồng hồ đếm ngược, tự động nộp bài, xem lại chi tiết câu đúng/sai và **thi Thực hành** (chấm code C / C++ / JavaScript / SQL hoặc nhận diện lưu đồ thuật toán bằng ảnh chụp).
- **Phân tích kết quả học tập & Hồ sơ cá nhân:**
  - Xem lịch sử các lần thi thử, điểm trung bình, điểm mạnh/yếu từng môn.
  - Tự cập nhật họ tên, số điện thoại, lớp sinh hoạt và đổi mật khẩu trong **Hồ sơ cá nhân**.

### 2. Chức năng dành cho Giảng viên (`lecturer`)
- Truy cập **Cổng Giảng viên (Lecturer Portal)** với quyền quản lý đúng các môn học mình được Admin phân công:
  - **Quản lý Ngân hàng câu hỏi:** Thêm/sửa/xóa câu hỏi trắc nghiệm và câu hỏi thực hành; nhập hàng loạt câu hỏi từ file **Word (`.docx`)** hoặc **Excel (`.xlsx`)**.
  - **Trợ lý AI Soạn câu hỏi & Phân tích Đề cương (Google Gemini):** Tải đề cương học phần lên để AI trích xuất CLO, nội dung chương và sinh tự động câu hỏi trắc nghiệm theo 6 bậc Bloom; giảng viên duyệt từng câu trước khi đưa vào ngân hàng đề.
  - **Quản lý Đề thi thử & Thống kê điểm:** Tạo/công bố đề thi từ ngân hàng câu hỏi, cấu hình thời gian làm bài và số lần thi tối đa, theo dõi bảng điểm sinh viên.
  - **Quản lý Tài liệu & Đồ án:** Tải đề cương/bài giảng lên server, tạo danh mục đề tài đồ án và duyệt đăng ký đồ án của sinh viên.
  - **Xác nhận mở khóa thi thử (10k/môn):** Giảng viên có quyền xác nhận mở khóa môn thi thử cho sinh viên thuộc môn mình phụ trách.

### 3. Chức năng dành cho Quản trị viên (`admin`)
Truy cập **Trung tâm Quản trị Hệ thống (`admin_portal`)** gồm 5 phân hệ:
1. **Quản lý Tài khoản (`Quản lý Tài khoản`):**
   - Xem toàn bộ tài khoản Sinh viên, Giảng viên, Admin; tìm kiếm nhanh theo tên, MSSV, mã GV, email; lọc theo vai trò.
   - Tạo tài khoản Sinh viên / Giảng viên mới, chỉnh sửa thông tin, **Khóa / Mở khóa** tài khoản, đặt lại mật khẩu, xóa tài khoản (có tombstone `deleted_users` chống đồng bộ lại tài khoản đã xóa).
   - **Kết nối Google Firebase Admin (`nguyenvxkien@gmail.com`)** để nhận sinh viên đăng ký từ điện thoại/tab ẩn danh theo **thời gian thực (`onSnapshot`)**, và nút **Đồng bộ 2 chiều ngay** giữa Client ↔ Server API ↔ Cloud Firestore.
2. **Phân công Giảng viên:** Gán hoặc gỡ quyền phụ trách học phần cho 36+ giảng viên Khoa CNTT.
3. **Quản lý Môn học:** Thêm mới, chỉnh sửa, xóa học phần (Lý thuyết, Thực hành, Đồ án), cập nhật mã học phần `INF...`, số tín chỉ, học kỳ.
4. **Thu phí & Mở khóa Môn (10k):** Cấu hình thông tin ngân hàng nhận chuyển khoản, mức lệ phí mặc định, xác nhận mở khóa thủ công theo đơn chuyển khoản hoặc mở khóa nhanh cho sinh viên theo từng môn.
5. **Nhật ký Hoạt động (Audit Logs):** Theo dõi thời gian thực toàn bộ lịch sử đăng ký, đăng nhập (kèm địa chỉ IP thật), cấp tài khoản, khóa/mở khóa, đổi mật khẩu, xác nhận mở khóa môn và duyệt câu hỏi AI — đồng bộ tự động qua `/api/logs` và Firestore `/activity_logs`.

---

## 🗂️ KIẾN TRÚC THƯ MỤC, CƠ SỞ DỮ LIỆU & HỆ THỐNG API

### Cấu trúc thư mục dự án
```text
├── api/
│   └── index.ts                      # Entry point Vercel Serverless Function (export Express app)
├── data/                             # Kho lưu JSON tập trung khi chạy Local / VPS (được include vào Vercel)
│   ├── users.json                    # Tài khoản Admin + 36 Giảng viên mặc định + Sinh viên đăng ký
│   ├── activity-logs.json            # Nhật ký hoạt động & bảo mật hệ thống tập trung
│   ├── deleted-users.json            # Danh sách ID đã xóa chống hồi phục nhầm khi sync
│   ├── materials.json                # Danh sách đề cương & tài liệu học phần
│   ├── payment-config.json           # Cấu hình tài khoản ngân hàng thu phí mở khóa
│   └── payment-orders.json           # Lịch sử đơn yêu cầu mở khóa môn thi thử
├── src/
│   ├── firebase.ts                   # Khởi tạo Firebase App, Auth, Firestore + Serializer & Error Handler
│   ├── services/
│   │   ├── firestoreUserService.ts   # CRUD & onSnapshot real-time cho /users, /admins, /deleted_users, /activity_logs
│   │   └── storageService.ts         # Đồng bộ 2 chiều Client <-> Express Server <-> Cloud Firestore
│   ├── components/
│   │   ├── admin/AdminDashboard.tsx  # Trung tâm Quản trị Hệ thống
│   │   ├── lecturer/                 # Cổng Giảng viên & nhập đề Word/Excel + AI
│   │   ├── auth/                     # Modal Đăng nhập/Đăng ký Sinh viên (MSSV + Mật khẩu) & Hồ sơ
│   │   ├── exams/, practice/, subjects/, materials/, analytics/, payment/, home/, common/
│   ├── data/mockData.ts              # Dữ liệu khởi tạo 26 học phần, chương, câu hỏi & 36 giảng viên
│   └── App.tsx                       # Điều phối routing, RBAC & luồng real-time listeners
├── server.ts                         # Máy chủ Express (API + Vite Dev / Static Production + Upstash/RTDB/Disk)
├── firebase-applet-config.json       # Cấu hình Firebase Project & Named Firestore Database ID
├── firebase-blueprint.json           # Schema chuẩn cho các collection trên Cloud Firestore
├── firestore.rules                   # Luật bảo mật Firestore đã kiểm chuẩn ESLint Security Rules
├── security_spec.md                  # Đặc tả mô hình đe dọa & kiểm thử bảo mật Firestore
├── vercel.json                       # Cấu hình build Vercel, rewrite /api/* và includeFiles data/**
├── .env.example                      # Mẫu biến môi trường cho Local & Vercel
└── package.json
```

### Danh sách API Tập trung (`server.ts`)
| Method | Endpoint | Chức năng |
| :--- | :--- | :--- |
| `GET` | `/api/system/storage-status` | Kiểm tra chế độ lưu trữ server (`persistent_cloud`, `persistent_disk` hoặc `ephemeral_tmp`) |
| `GET` | `/api/users` | Lấy danh sách toàn bộ tài khoản cho Admin & đồng bộ |
| `POST` | `/api/users/register` | Lưu tài khoản sinh viên mới đăng ký (kèm tạo bản ghi Audit Log & IP thật) |
| `POST` | `/api/users/login` | Xác thực đăng nhập trực tiếp từ cơ sở dữ liệu server & ghi Audit Log |
| `POST` | `/api/users/sync` | Đồng bộ 2 chiều tài khoản giữa Client / Firestore và Server |
| `POST` | `/api/users` | Admin tạo tài khoản Giảng viên mới trên server |
| `PUT` | `/api/users/:id` | Cập nhật hồ sơ, đổi mật khẩu, khóa/mở khóa tài khoản lên server |
| `DELETE` | `/api/users/:id` | Xóa tài khoản vĩnh viễn và ghi nhận vào `deleted-users` |
| `GET` | `/api/logs` | Trả về toàn bộ **Nhật ký Hoạt động** tập trung từ server |
| `POST` | `/api/logs/sync` | Đồng bộ 2 chiều nhật ký đăng ký, đăng nhập & bảo mật giữa Client / Firestore / Server |
| `GET/POST/DELETE` | `/api/materials` | Quản lý & tải về đề cương/tài liệu học phần chuẩn UTF-8 |
| `GET/PUT/POST` | `/api/payments/*` | Quản lý cấu hình ngân hàng, tạo đơn mở khóa 10k/môn và xác nhận mở khóa thủ công |
| `POST` | `/api/ai/*` | Phân tích đề cương, sinh câu hỏi Bloom, giải thích đáp án, chấm code & ảnh lưu đồ thuật toán bằng Gemini |

---

## 💻 HƯỚNG DẪN CÀI ĐẶT & CHẠY Ở MÁY CỤC BỘ (LOCALHOST)

### Bước 1: Yêu cầu môi trường
- **Node.js:** `>= 20.0.0` (khuyến nghị **Node.js 22 LTS** hoặc **24 LTS**)
- **npm:** `>= 10.0.0`
- **Git:** đã cài đặt trên máy

### Bước 2: Tải mã nguồn & Cài đặt thư viện
```bash
git clone https://github.com/xkien2k4/<ten-repo-cua-ban>.git
cd <ten-repo-cua-ban>
npm install
```
> Nếu gặp cảnh báo peer dependency trên môi trường cũ, chạy `npm install` với Node 22/24 và npm 10+ là cài sạch hoàn toàn vì `esbuild` và `firebase` đã được khai báo tương thích chuẩn trong `package.json`.

### Bước 3: Cấu hình file `.env`
Sao chép mẫu `.env.example` thành `.env`:
```bash
cp .env.example .env
```
Mở `.env` và điền các giá trị cần thiết:
```env
# (Tùy chọn) API Key Gemini từ Google AI Studio (dùng cho tính năng AI tạo câu hỏi & chấm bài)
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
GEMINI_MODEL="gemini-2.5-flash"

# URL chạy ở máy cục bộ
APP_URL="http://localhost:3000"
```
> **Lưu ý khi chạy Localhost:** Express tự động đọc/ghi dữ liệu bền vững vào thư mục **`data/*.json`** (`data/users.json`, `data/activity-logs.json`, `data/materials.json`, `data/payment-orders.json`), không cần cài thêm database bên ngoài.

### Bước 4: Khởi chạy Development Server
```bash
npm run dev
```
Mở trình duyệt truy cập: **`http://localhost:3000`**

### Bước 5: Kiểm tra TypeScript, Đóng gói Build & Chạy Production ở Local
```bash
# 1. Kiểm tra kiểu TypeScript toàn bộ dự án
npm run lint

# 2. Kiểm tra bảo mật Firestore Rules (tùy chọn)
npx eslint firestore.rules

# 3. Đóng gói Frontend (dist/) và Server (dist/server.js)
npm run build

# 4. Khởi chạy bản Production tại cổng 3000
npm start
```

---

## 🔥 HƯỚNG DẪN KẾT NỐI FIREBASE AUTHENTICATION & CLOUD FIRESTORE

Hệ thống đã tích hợp sẵn **Firebase SDK** (`firebase@13.4.0`), cấu hình kết nối tại `firebase-applet-config.json` và luật bảo mật tại `firestore.rules`.

### 1. Thông số Firebase đang cấu hình trong dự án
- **Project ID:** `sacred-store-hf6jr`
- **Auth Domain:** `sacred-store-hf6jr.firebaseapp.com`
- **Firestore Database ID (Named DB):** `ai-studio-itstudyplatformk-6959814b-2dc7-4f5f-ae3a-f7074fd010fa`
- **Email Quản trị viên tối cao (Bootstrapped Admin):** `nguyenvxkien@gmail.com`

### 2. Kiến trúc 5 Collection trên Cloud Firestore (`firebase-blueprint.json` & `firestore.rules`)
| Collection | Mục đích | Quyền truy cập bảo mật (`firestore.rules`) |
| :--- | :--- | :--- |
| `/users/{userId}` | Hồ sơ tài khoản sinh viên, giảng viên, admin | Sinh viên chỉ đọc/tạo/sửa doc của chính `request.auth.uid` (chỉ `role: 'student'`, không tự mở khóa thi); chỉ Admin `nguyenvxkien@gmail.com` (đã xác thực email Google) được `list` toàn bộ và cập nhật/xóa |
| `/admins/{adminId}` | Bảng tra cứu quyền Admin theo UID | Chỉ cho phép Admin gốc khởi tạo tài liệu của chính mình |
| `/deleted_users/{deletedId}` | Lưu ID tài khoản đã bị Admin xóa | Chỉ Admin được đọc/ghi để ngăn tài khoản bị xóa đồng bộ ngược trở lại |
| `/payment_orders/{orderId}` | Đơn yêu cầu mở khóa thi thử 10.000đ/môn | Sinh viên chỉ tạo đơn `pending` cho chính mình; chỉ Admin xác nhận đổi trạng thái sang `paid` |
| `/activity_logs/{logId}` | **Nhật ký Hoạt động & Bảo mật** | Bất biến (`allow update: if false`). Sinh viên Google chỉ được tạo log `userRole == 'student'` khớp `authUid`; chỉ Admin `nguyenvxkien@gmail.com` được đọc danh sách toàn hệ thống |

### 3. Checklist thiết lập trên Firebase Console (nếu bạn tự tạo hoặc dùng lại project)
1. Mở [Firebase Console](https://console.firebase.google.com/) → chọn project `sacred-store-hf6jr` (hoặc project Firebase mới của bạn).
2. **Bật Google Sign-In:**
   - Vào **Build → Authentication → Sign-in method** → bật **Google** → chọn email hỗ trợ → **Save**.
3. **Kiểm tra Cloud Firestore:**
   - Vào **Build → Firestore Database** → đảm bảo database `ai-studio-itstudyplatformk-6959814b-2dc7-4f5f-ae3a-f7074fd010fa` đã được tạo (hoặc nếu dùng project Firebase riêng của bạn, cập nhật file `firebase-applet-config.json` tương ứng và đặt `firestoreDatabaseId` thành `"(default)"` nếu dùng DB mặc định).
   - Dán nội dung file `firestore.rules` vào mục **Firestore Database → Rules** và bấm **Publish** (nếu tạo project Firebase mới).
4. **Thêm Authorized Domains (Bắt buộc khi chạy Vercel / tên miền riêng):**
   - Vào **Authentication → Settings → Authorized domains** → bấm **Add domain**.
   - Thêm domain Vercel của bạn (ví dụ `it-study-dhhp.vercel.app`) và tên miền riêng (nếu có). Lưu ý luôn giữ lại `localhost` để test ở máy cá nhân.
5. **Đổi Email Admin (nếu muốn dùng Gmail khác làm Admin):**
   - Cập nhật đồng bộ ở 2 nơi: `BOOTSTRAPPED_ADMIN_EMAIL` trong `src/firebase.ts` và hàm `isBootstrappedAdmin()` trong `firestore.rules` (sau đó Publish lại Rules).

---

## ☁️ HƯỚNG DẪN UPLOAD SOURCE LÊN VERCEL & ĐỒNG BỘ ĐA THIẾT BỊ (KHÔNG LỖI)

### Tại sao cần kết hợp Firebase Firestore + Upstash Redis trên Vercel?
Trên **Vercel Serverless**, hệ thống tệp `data/users.json` và `data/activity-logs.json` chỉ có quyền **đọc (read-only)** lúc runtime (ghi tạm vào `/tmp` sẽ mất khi Serverless Function ngủ/khởi động lại). Do đó hệ thống hỗ trợ **2 cơ chế lưu trữ đám mây song song**:
1. **Lớp 1 — Upstash Redis REST API (Khuyên dùng miễn phí 100% trên Vercel):** Lưu trữ vĩnh viễn 100% toàn bộ tài khoản sinh viên đăng ký từ điện thoại/tab ẩn danh qua form MSSV + Mật khẩu, nhật ký hoạt động (kèm IP thật) và đơn mở khóa môn thi trên Vercel Serverless.
2. **Lớp 2 — Firebase Cloud Firestore (Tích hợp sẵn qua `firebase-applet-config.json`):** Cho phép Quản trị viên kết nối Google Admin (`nguyenvxkien@gmail.com`) tại **Trung tâm Quản trị Hệ thống** để sao lưu và đồng bộ 2 chiều thời gian thực (`onSnapshot`) toàn bộ tài khoản & nhật ký hoạt động lên Cloud Firestore.

---

### Quy trình Upload & Deploy lên Vercel (5 bước chuẩn)

#### Bước 1: Kiểm tra build ở Local trước khi đẩy code
Chạy 2 lệnh sau để chắc chắn không có lỗi TypeScript hoặc đóng gói:
```bash
npm run lint
npm run build
```
Nếu cả 2 lệnh thoát thành công (không báo lỗi đỏ), mã nguồn sẵn sàng lên Vercel.

#### Bước 2: Đẩy mã nguồn lên GitHub
```bash
git add .
git commit -m "Ready for Vercel deployment with Firebase Firestore & Audit Logs"
git push origin main
```
> **Kiểm tra nhanh trên GitHub:** Đảm bảo repository có các file quan trọng: `package.json`, `package-lock.json`, `vercel.json`, `api/index.ts`, `server.ts`, `firebase-applet-config.json`, `data/users.json`, `data/materials.json`. (File `.env` cá nhân đã nằm trong `.gitignore` nên không bị lộ lên GitHub).

#### Bước 3: Import và Deploy Project trên Vercel
1. Truy cập [https://vercel.com](https://vercel.com) và đăng nhập bằng GitHub.
2. Bấm **Add New... → Project** → chọn repository vừa đẩy → bấm **Import**.
3. Tại mục **Build and Output Settings** (Vercel tự đọc từ `vercel.json`):
   - **Framework Preset:** `Vite` (hoặc giữ nguyên `Other` — `vercel.json` đã khai báo đầy đủ)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Mở **Project Settings → General → Node.js Version** chọn **22.x** hoặc **24.x** (khuyến nghị `24.x`).
5. Bấm **Deploy** và đợi khoảng 1–2 phút để Vercel cấp domain chính thức (dạng `https://ten-du-an.vercel.app`).

#### Bước 4: Cấu hình Domain Vercel vào Firebase Authentication
1. Copy tên miền Vercel vừa nhận (chỉ lấy phần host, ví dụ `ten-du-an.vercel.app`, không có `https://`).
2. Vào [Firebase Console](https://console.firebase.google.com/) → project `sacred-store-hf6jr` → **Authentication → Settings → Authorized domains** → **Add domain** → dán tên miền và bấm **Add**.

#### Bước 5: Gắn Upstash Redis & Biến môi trường trên Vercel
1. Tại Project trên Vercel Dashboard → chọn tab **Storage** → **Create Database** → chọn **Upstash for Redis**.
2. Chọn gói **Free** và Region **Singapore (`ap-southeast-1`)** (gần Việt Nam nhất, độ trễ thấp) → bấm **Connect Project**.
   - Vercel sẽ tự động nạp 2 biến môi trường `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN` vào dự án.
3. Vào **Settings → Environment Variables**, kiểm tra và bổ sung các biến sau (áp dụng cho **Production / Preview / Development**):

| Tên biến | Giá trị | Bắt buộc? |
| :--- | :--- | :--- |
| `UPSTASH_REDIS_REST_URL` | Tự động điền khi Connect Upstash Redis | **Bắt buộc** nếu dùng form MSSV/Mật khẩu |
| `UPSTASH_REDIS_REST_TOKEN` | Tự động điền khi Connect Upstash Redis | **Bắt buộc** nếu dùng form MSSV/Mật khẩu |
| `APP_URL` | `https://ten-du-an.vercel.app` | Khuyến nghị |
| `APP_DOMAIN` | `https://ten-du-an.vercel.app` | Khuyến nghị |
| `GEMINI_API_KEY` | Key lấy từ [Google AI Studio](https://aistudio.google.com/) | Cần nếu bật tính năng AI |
| `GEMINI_MODEL` | `gemini-2.5-flash` (hoặc `gemini-3.8-flash`) | Tùy chọn |

4. Vào tab **Deployments** → bấm biểu tượng `⋯` ở bản deploy mới nhất → chọn **Redeploy** để Vercel nạp toàn bộ biến môi trường vừa cấu hình.

---

## ✅ KIỂM TRA ĐỒNG BỘ THỰC TẾ TỪ ĐIỆN THOẠI / TAB ẨN DANH

1. **Kiểm tra trạng thái lưu trữ Backend Vercel:**
   Mở trình duyệt truy cập: `https://<ten-mien-vercel>/api/system/storage-status`
   - Nếu gắn Upstash Redis thành công, kết quả trả về:
     ```json
     { "success": true, "storageMode": "persistent_cloud", "isVercel": true, "hasCloudKv": true }
     ```
2. **Test đăng ký / đăng nhập từ Điện thoại hoặc Tab Ẩn danh:**
   - Mở website bằng trình duyệt điện thoại hoặc tab ẩn danh → bấm **Đăng ký / Đăng nhập** → chọn tab **Đăng ký tài khoản**.
   - Nhập Họ tên, MSSV, Lớp sinh hoạt, Email, Mật khẩu → bấm **Đăng ký tài khoản Sinh viên**. Dữ liệu được đẩy ngay qua `POST /api/users/register` lên máy chủ trung tâm (Local `data/users.json` hoặc Vercel Upstash Redis) kèm địa chỉ IP thiết bị.
   - Đăng xuất hoặc mở một trình duyệt khác → đăng nhập lại bằng MSSV/Email và mật khẩu vừa tạo (`POST /api/users/login`).
3. **Xem trên Trung tâm Quản trị Hệ thống (Máy tính Admin):**
   - Đăng nhập Admin (`admin` / `admin123`) → vào **Trung tâm Quản trị Hệ thống**.
   - Bấm **Kết nối Google Firebase Admin** (tùy chọn, dùng Gmail `nguyenvxkien@gmail.com`) để bật sao lưu và đồng bộ 2 chiều lên Cloud Firestore.
   - Kiểm tra đồng thời cả 2 tab:
     - **Quản lý Tài khoản:** Tài khoản sinh viên mới đăng ký xuất hiện ngay ở đầu danh sách Sinh viên (kèm MSSV, Lớp, Email, thời gian đăng nhập và nút Sửa/Khóa/Mở/Xóa).
     - **Nhật ký Hoạt động:** Hiển thị đầy đủ sự kiện `"Sinh viên tự đăng ký"` và `"Đăng nhập thành công"` kèm thời gian chính xác và địa chỉ IP thiết bị.

---

## 🛠️ XỬ LÝ CÁC LỖI THƯỜNG GẶP KHI DEPLOY

| Hiện tượng / Lỗi | Nguyên nhân | Cách khắc phục triệt để |
| :--- | :--- | :--- |
| `Firebase: Error (auth/unauthorized-domain)` khi Admin bấm Kết nối Google Firebase | Tên miền Vercel chưa được khai báo trên Firebase | Vào Firebase Console → **Authentication → Settings → Authorized domains** → thêm domain `.vercel.app` |
| Sinh viên đăng ký trên điện thoại/tab ẩn danh nhưng Admin trên máy tính không thấy | Chưa gắn Upstash Redis trên Vercel (`storageMode` đang là `ephemeral_tmp`) | Tạo **Upstash for Redis** trong tab **Storage** của Vercel → **Connect Project** → **Redeploy** |
| Đăng nhập Google Admin báo không có quyền đọc Firestore | Chọn nhầm tài khoản Google không phải `nguyenvxkien@gmail.com` | Đăng xuất Google và chọn đúng Gmail Quản trị đã cấu hình trong `firestore.rules` |
| Lỗi `404` khi F5 ở các đường dẫn hoặc gọi `/api/*` | Thiếu file `vercel.json` hoặc `api/index.ts` | Đảm bảo giữ nguyên `vercel.json` (`rewrites` + `includeFiles: "data/**"`) và `api/index.ts` |
| Chức năng AI báo lỗi thiếu khóa API | Chưa cấu hình `GEMINI_API_KEY` | Thêm `GEMINI_API_KEY` trong `.env` (local) hoặc **Vercel → Settings → Environment Variables** rồi **Redeploy** |

---

## 🔑 DANH SÁCH TÀI KHOẢN MẶC ĐỊNH (ADMIN & 36 GIẢNG VIÊN)

### 1. Quản trị viên Hệ thống (Admin)
| Họ và tên | Tên đăng nhập | Mật khẩu mặc định | Email nội bộ | Email Firebase Admin |
| :--- | :--- | :--- | :--- | :--- |
| **Nguyễn Vũ Xuân Kiên** | `admin` | `admin123` | `admin@dhhp.edu.vn` | `nguyenvxkien@gmail.com` |

> **Khuyến nghị bảo mật:** Ngay sau khi deploy lên Vercel, hãy đăng nhập tài khoản `admin` và đổi mật khẩu mạnh hơn tại **Trung tâm Quản trị Hệ thống → Quản lý Tài khoản**.

### 2. Danh sách 36 Giảng viên Khoa CNTT (Mật khẩu khởi tạo: `gv123456`)
| STT | Mã GV | Họ và tên | Tên đăng nhập | Học phần phân công mặc định |
| :---: | :---: | :--- | :--- | :--- |
| 1 | `0001` | ThS. Đào Ngọc Tú | `gv_daongoctu` | `INF3120`, `INF3160`, `INF3180` |
| 2 | `0002` | ThS. Hoàng Văn Lâm | `gv_hoangvanlam` | `INF1030`, `INF3110`, `INF3150` |
| 3 | `0003` | ThS. Quách Duy Thành | `gv_quachduythanh` | `INF1001`, `INF3140` |
| 4 | `0004` | ThS. Đào Việt Anh | `gv_daovietanh` | `INF3050`, `INF3170`, `INF3190`, `INF3200` |
| 5 | `0005` | ThS. Nguyễn Hà An | `gv_nguyenhaan` | `INF3130`, `INF3210` |
| 6 | `0006` | ThS. Phạm Thị Thùy Ni | `gv_phamthithuyni` | `INF3220` |
| 7 | `0007` | ThS. Hoàng Trần Hiếu | `gv_hoangtranhieu` | `INF2050` |
| 8 | `0008` | ThS. Trần Quốc Tuấn | `gv_tranquoctuan` | `INF1020` |
| 9 | `0009` | ThS. Nguyễn Thị Hồng Mai | `gv_nguyenthihongmai` | `INF3080` |
| 10 | `0010` | ThS. Nguyễn Mạnh Hùng | `gv_nguyenmanhhung` | `INF2010` |
| 11 | `0011` | ThS. Vũ Thị Sơn | `gv_vuthison` | `INF2030` |
| 12 | `0012` | ThS. Nguyễn Văn Quang | `gv_nguyenvanquang` | `INF2020` |
| 13 | `0013` | ThS. Nguyễn Thị Lanh | `gv_nguyenthilanh` | `INF1010` |
| 14 | `0014` | ThS. Lê Ngọc Minh | `gv_lengocminh` | `INF2040` |
| 15 | `0015` | ThS. Bùi Thị Hương | `gv_buithihuong` | `INF2060` |
| 16 | `0016` | ThS. Đỗ Quỳnh Anh | `gv_doquynhanh` | *(Phân công qua Admin)* |
| 17 | `0017` | ThS. Lê Thị Phương Anh | `gv_lethiphuonganh` | *(Phân công qua Admin)* |
| 18 | `0018` | ThS. Đào Thị Hưng | `gv_daothihung` | *(Phân công qua Admin)* |
| 19 | `0019` | **TS. Đào Thị Hường** | `gv_daothihuong` | *(Phân công qua Admin)* |
| 20 | `0020` | ThS. Trần Quang Huy | `gv_tranquanghuy` | *(Phân công qua Admin)* |
| 21 | `0021` | **CN. Thái Thu Huyền** | `gv_thaithuhuyen` | *(Phân công qua Admin)* |
| 22 | `0022` | ThS. Trương Văn Khải | `gv_truongvankhai` | *(Phân công qua Admin)* |
| 23 | `0023` | ThS. Nguyễn Ngọc Khương | `gv_nguyenngockhuong` | *(Phân công qua Admin)* |
| 24 | `0024` | ThS. Hà Khánh Lâm | `gv_hakhanhlam` | *(Phân công qua Admin)* |
| 25 | `0025` | **TS. Phạm Nghĩa Luân** | `gv_phamnghialuan` | *(Phân công qua Admin)* |
| 26 | `0026` | **TS. Lê Đăng Nguyên** | `gv_ledangnguyen` | *(Phân công qua Admin)* |
| 27 | `0027` | **PGS.TS. Lê Đắc Nhường** | `gv_ledacnhuong` | *(Phân công qua Admin)* |
| 28 | `0028` | ThS. Ngô Đăng Quang | `gv_ngodangquang` | *(Phân công qua Admin)* |
| 29 | `0029` | **TS. Nguyễn Văn Quyền** | `gv_nguyenvanquyen` | *(Phân công qua Admin)* |
| 30 | `0030` | ThS. Bùi Thị Thúy Quỳnh | `gv_buithithuyquynh` | *(Phân công qua Admin)* |
| 31 | `0031` | ThS. Bùi Văn Tâm | `gv_buivantam` | *(Phân công qua Admin)* |
| 32 | `0032` | ThS. Phạm Thị Thịnh | `gv_phamthithinh` | *(Phân công qua Admin)* |
| 33 | `0033` | ThS. Nguyễn Thị Thuý | `gv_nguyenthithuy` | *(Phân công qua Admin)* |
| 34 | `0034` | ThS. Trần Biên Thùy | `gv_tranbienthuy` | *(Phân công qua Admin)* |
| 35 | `0035` | ThS. Đỗ Thị Thanh Toàn | `gv_dothithanhtoan` | *(Phân công qua Admin)* |
| 36 | `0036` | ThS. Trần Việt | `gv_tranviet` | *(Phân công qua Admin)* |

> Sinh viên không có tài khoản mẫu cố định — toàn bộ sinh viên chủ động đăng ký trực tiếp trên giao diện để danh sách tài khoản trên **Trung tâm Quản trị Hệ thống** luôn sạch và thực tế.

---

## 📚 DANH MỤC 26 HỌC PHẦN MẶC ĐỊNH

### 1. Học phần Lý thuyết & Trắc nghiệm (10 môn)
1. **Cấu trúc dữ liệu và giải thuật** (`INF2030` · 4 TC)
2. **Tổ chức và kiến trúc máy tính** (`INF2010` · 3 TC)
3. **Tổng quan Công nghệ thông tin và định hướng nghề nghiệp** (`INF1001` · 2 TC)
4. **Mạng máy tính và hệ thống mở** (`INF3080` · 3 TC)
5. **Lắp ráp và cài đặt máy tính** (`INF1020` · 2 TC)
6. **Nhập môn hệ cơ sở dữ liệu** (`INF2050` · 3 TC)
7. **Nhập môn trí tuệ nhân tạo** (`INF3050` · 3 TC)
8. **SEO Web** (`INF3220` · 3 TC)
9. **Công nghệ số trong kỷ nguyên mới** (`INF3230` · 3 TC)
10. **Du lịch điện tử** (`INF3240` · 3 TC)

### 2. Học phần Thực hành (5 môn)
1. **Nhập môn thuật toán** (`INF1010` · 3 TC)
2. **Lập trình cơ sở** (`INF1030` · 3 TC — Ngôn ngữ C)
3. **Lập trình nâng cao** (`INF2020` · 3 TC — Ngôn ngữ C++)
4. **Lập trình hướng đối tượng** (`INF2040` · 3 TC — Ngôn ngữ JavaScript)
5. **Hệ quản trị cơ sở dữ liệu** (`INF2060` · 3 TC — SQL Server / MySQL)

### 3. Đồ án Học phần Chuyên ngành (11 môn)
- `INF3110` Đồ họa và xử lý ảnh · `INF3120` Lập trình PHP · `INF3130` Lập trình Python · `INF3140` Phân tích thiết kế các HTTT · `INF3150` Môi trường lập trình trực quan · `INF3160` Phát triển ứng dụng di động · `INF3170` Thiết kế và phát triển ứng dụng Web · `INF3180` Kỹ nghệ phần mềm · `INF3190` Quản trị mạng · `INF3200` An toàn và bảo mật thông tin · `INF3210` Các hệ thống thông minh.

---

## 📩 LIÊN HỆ HỖ TRỢ
- **Phụ trách kỹ thuật & Quản trị:** Nguyễn Vũ Xuân Kiên
- **SĐT / Zalo:** `0334613184`
- **Email:** `nguyenvxkien@gmail.com` / `admin@dhhp.edu.vn`
- **Trang tổng hợp mã nguồn:** https://github.com/xkien2k4/

UPSTASH_REDIS_REST_URL="https://wise-sole-207385.upstash.io"
UPSTASH_REDIS_REST_TOKEN="ggAAAAAAAyoZAAIgcDLaRKDhRidNnd6R76tM9F3JYBHpCVo8j4gL2BxoHorMLQ"