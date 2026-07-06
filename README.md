# VABot - AI Knowledge Assistant

Hệ thống AI tra cứu tài liệu nội bộ dành cho **Trung tâm Việt Anh**.

VABot cho phép upload tài liệu PDF, tìm kiếm ngữ nghĩa và chat với AI dựa trên nội dung tài liệu (RAG).

## Tính năng

- **Authentication**: Đăng nhập/đăng ký với JWT, phân quyền Admin/User
- **Upload PDF**: Admin upload tài liệu, tự động extract text, chunking, embedding
- **Vector Search**: FAISS + OpenAI text-embedding-3-small
- **RAG Chat**: GPT-4o-mini trả lời dựa trên tài liệu với nguồn tham khảo
- **Lịch sử chat**: Lưu toàn bộ cuộc trò chuyện
- **Dashboard Admin**: Thống kê tài liệu, người dùng, hoạt động, chi phí OpenAI

## Công nghệ

| Layer | Stack |
|-------|-------|
| Frontend | React, Vite, TypeScript, TailwindCSS |
| Backend | Python, FastAPI, SQLAlchemy |
| Database | PostgreSQL |
| Vector DB | FAISS |
| AI | OpenAI GPT-4o-mini, text-embedding-3-small |

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

## API Endpoints

### Authentication
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/login` | Đăng nhập |
| POST | `/register` | Đăng ký |
| GET | `/me` | Thông tin user |

### Documents
| Method | Endpoint | Mô tả | Quyền |
|--------|----------|-------|-------|
| POST | `/documents/upload` | Upload PDF | Admin |
| GET | `/documents` | Danh sách tài liệu | All |
| DELETE | `/documents/{id}` | Xóa tài liệu | Admin |

### Search & Chat
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/search?query=` | Tìm kiếm ngữ nghĩa |
| POST | `/chat` | Chat với AI (RAG) |
| GET | `/conversations` | Lịch sử chat |
| GET | `/conversations/{id}` | Chi tiết cuộc trò chuyện |
| DELETE | `/conversations/{id}` | Xóa cuộc trò chuyện |

### Admin
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/admin/dashboard` | Thống kê dashboard |
| GET | `/admin/users` | Danh sách người dùng |
| POST | `/admin/users` | Tạo người dùng |
| DELETE | `/admin/users/{id}` | Xóa người dùng |

## Phân quyền

| Chức năng | Admin | User |
|-----------|-------|------|
| Upload tài liệu | ✅ | ❌ |
| Xóa tài liệu | ✅ | ❌ |
| Xem tài liệu | ✅ | ✅ |
| Chat AI | ✅ | ✅ |
| Tìm kiếm | ✅ | ✅ |
| Dashboard | ✅ | ❌ |
| Quản lý user | ✅ | ❌ |

## Luồng xử lý RAG

```
PDF Upload
    ↓
Extract Text (PyMuPDF)
    ↓
Chunking (600 chars, overlap 100)
    ↓
Embedding (text-embedding-3-small)
    ↓
FAISS Index
    ↓
User Question
    ↓
Semantic Search (Top 5)
    ↓
GPT-4o-mini + Context
    ↓
Answer + Sources
```

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
