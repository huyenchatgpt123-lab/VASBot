# VATask - Việt Anh School

Hệ thống quản lý công việc và tài liệu nội bộ dành cho **Trung tâm Việt Anh**.

VATask hỗ trợ upload kế hoạch/tài liệu, trích xuất công việc, phân công theo tổ/bộ môn, theo dõi tiến độ và góp ý nội bộ.

## Tính năng

- **Authentication**: Đăng nhập JWT, phân quyền Admin / BGH / Tổ trưởng / Giáo viên
- **Quản lý công việc**: Kế hoạch từ tài liệu, việc phát sinh, deadline, trạng thái
- **Tài liệu**: Upload PDF/Word, lọc theo tổ, tháng, năm học
- **Trích xuất công việc**: GPT đọc tài liệu và gợi ý phân công
- **Feedback**: Góp ý người dùng, Admin xử lý phản hồi
- **Dashboard Admin**: Thống kê hoạt động, chi phí OpenAI

## Công nghệ

| Layer | Stack |
|-------|-------|
| Frontend | React, Vite, TypeScript, TailwindCSS |
| Backend | Python, FastAPI, SQLAlchemy |
| Database | PostgreSQL |
| Vector DB | FAISS |
| AI | OpenAI (trích xuất công việc, embedding tài liệu) |

## Yêu cầu

- Docker & Docker Compose
- OpenAI API Key

## Cài đặt nhanh

### 1. Clone và cấu hình

```bash
cd VASBot
cp .env.example .env
```

Mở file `.env` và thêm OpenAI API Key:

```
OPENAI_API_KEY=sk-your-actual-api-key
```

### 2. Chạy với Docker

```bash
docker compose up --build
```

Hoặc (Docker Compose v1):

```bash
docker-compose up --build
```

### 3. Truy cập

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

### 4. Tài khoản mặc định

| Email | Mật khẩu | Vai trò |
|-------|----------|---------|
| admin@vietanh.edu.vn | admin123 | Admin |

> Đăng ký công khai đã tắt. Admin tạo tài khoản qua trang **Người dùng** hoặc import Excel.

## Cấu trúc dự án

```
VASBot/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Cấu hình
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models/              # Database models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── repositories/        # Repository pattern
│   │   ├── services/            # Business logic
│   │   ├── routers/             # API endpoints
│   │   └── utils/               # Auth, chunking, PDF
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                 # API client
│   │   ├── components/          # UI components
│   │   ├── context/             # Auth context
│   │   ├── pages/               # Page components
│   │   └── types/               # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## API Endpoints (tóm tắt)

### Authentication
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/login` | Đăng nhập |
| POST | `/register` | Đã tắt (403) |
| GET | `/me` | Thông tin user |

### Documents & Tasks
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/documents/upload` | Upload tài liệu |
| GET | `/documents` | Danh sách tài liệu |
| GET/POST/PATCH/DELETE | `/tasks/...` | Quản lý công việc |

### Admin
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/admin/dashboard` | Thống kê dashboard |
| GET/POST/DELETE | `/admin/users/...` | Quản lý người dùng |

## Chạy local (không Docker)

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Cấu hình DATABASE_URL và OPENAI_API_KEY trong .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Database

Cần PostgreSQL chạy local với cấu hình trong `.env`.

## License

Dành cho nội bộ Trung tâm Việt Anh.
