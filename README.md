# Zelosify Recruit — Vendor & Hiring Manager Contract Management Module

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=flat&logo=nodedotjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat&logo=prisma&logoColor=white)
![Keycloak](https://img.shields.io/badge/Keycloak-IAM-4D4D4D?style=flat&logo=keycloak&logoColor=white)
![AWS S3](https://img.shields.io/badge/AWS_S3-Storage-FF9900?style=flat&logo=amazons3&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.x-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Redux](https://img.shields.io/badge/Redux_Toolkit-2.x-764ABC?style=flat&logo=redux&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue?style=flat)

A full-stack, multi-tenant recruitment platform that streamlines vendor candidate submission, AI-powered resume evaluation, and hiring manager decision workflows — all within a secure, role-based architecture.

---

## Table of Contents

1. [Problem Statement / Objective](#problem-statement--objective)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [System Architecture / Workflow](#system-architecture--workflow)
5. [Installation & Setup](#installation--setup)
6. [Usage](#usage)
7. [Screenshots / Demo](#screenshots--demo)
8. [API Integration](#api-integration)
9. [Folder Structure](#folder-structure)
10. [Future Enhancements / Roadmap](#future-enhancements--roadmap)
11. [Contributing](#contributing)
12. [License](#license)
13. [Author / Contact](#author--contact)

---

## Problem Statement / Objective

Enterprise recruitment processes frequently suffer from fragmented tooling: vendors submit candidate CVs through email or disconnected portals, hiring managers evaluate profiles manually, and no centralised audit trail exists. This results in slow time-to-hire, inconsistent candidate assessment, and poor visibility across procurement teams.

**Zelosify Recruit** solves this by providing a unified, multi-tenant SaaS platform where:

- IT vendors submit candidate profiles (PDF resumes) against open job requirements.
- An LLM-powered scoring engine (Groq + tool-calling agents) automatically evaluates and ranks candidates against job criteria.
- Hiring managers review AI-generated recommendations, shortlist or reject profiles, and track the full hiring lifecycle.
- All actions are gated by fine-grained role-based access control (RBAC) with Keycloak SSO.

---

## Features

### Vendor Portal
- Browse and filter active job openings scoped to the vendor's tenant.
- Bulk resume upload (PDF, up to 10 files per submission) with duplicate detection via SHA-256 file hashing.
- Soft-delete uploaded profiles before final submission.
- Secure, time-limited S3 pre-signed URLs for resume preview.

### AI-Powered Recommendation Engine
- Autonomous **agentic pipeline** orchestrated by `agentOrchestrator.ts`:
  - **Resume Parsing Tool** — extracts structured data from raw PDF text.
  - **Feature Extraction Tool** — isolates skills, experience, education, and domain expertise.
  - **Skill Normalisation Tool** — maps raw skill strings to canonical technology vocabulary.
  - **Deterministic Matching Tool** — computes weighted overlap between candidate skills and job requirements.
  - **Scoring Engine Tool** — produces a composite recommendation score with confidence and breakdown.
- Backed by **Groq** LLM tool-calling client for fast, low-latency inference.
- Stores `recommendationScore`, `matchedSkills`, `missingSkills`, `tokenUsage`, and P95 latency metadata per execution.
- Retry mechanism for failed recommendation runs.

### Hiring Manager Dashboard
- View all openings assigned to the hiring manager.
- Per-opening candidate list with recommendation scores, matched/missing skills, and AI rationale.
- One-click shortlist or reject actions with full audit timestamps.
- Resume viewer via pre-signed S3 URLs.
- Manual retry trigger for stalled AI evaluations.

### Security & Identity
- **Keycloak** OpenID Connect SSO with session management.
- JWT verification and refresh token rotation.
- TOTP-based two-factor authentication (`otplib` + QR code generation).
- Role-based route guards on both server (Express middleware) and client (Next.js middleware).

### Multi-Tenancy
- All data (openings, profiles, users) is scoped to a `tenantId`.
- Tenant isolation enforced at the database query level via Prisma.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 15, React 19 | App shell, SSR/CSR, routing |
| **UI Library** | Tailwind CSS 3, shadcn/ui (Radix UI) | Component primitives and styling |
| **State Management** | Redux Toolkit 2, React Redux | Global client state |
| **Animations** | Framer Motion | UI transitions |
| **Charts** | Recharts | Analytics dashboards |
| **Backend** | Node.js 22, Express 4, TypeScript 5 | REST API server |
| **ORM** | Prisma 6 | Type-safe PostgreSQL access |
| **Database** | PostgreSQL 15 | Relational data store |
| **Authentication** | Keycloak 26, JWT, TOTP | SSO, session, 2FA |
| **File Storage** | AWS S3, `@aws-sdk/client-s3` | Resume storage and pre-signed URLs |
| **AI / LLM** | Groq (tool-calling) | Resume scoring agent |
| **PDF Processing** | `pdf-parse`, `pdf-extraction` | Resume text extraction |
| **File Upload** | Multer 2 | Multipart form handling |
| **Containerisation** | Docker Compose | Local PostgreSQL + Keycloak services |
| **Testing** | Vitest, Supertest | Unit and integration tests |
| **Build** | TypeScript compiler (`tsc`), ESLint | Compilation and linting |

---

## System Architecture / Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Client                      │
│    Next.js 15  ─  Redux Toolkit  ─  Axios  ─  Tailwind CSS  │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (REST)
┌────────────────────────────▼────────────────────────────────┐
│                    Express REST API (Port 5000)              │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ Auth Routes  │  │ Vendor Routes │  │  Hiring Manager  │  │
│  │  /api/v1/auth│  │/api/v1/vendor │  │    Routes        │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │            │
│  ┌──────▼──────────────────▼────────────────────▼─────────┐  │
│  │           Middleware Layer                              │  │
│  │   authenticateUser (JWT/Keycloak) → authorizeRole      │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │          Service Layer / Business Logic                 │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │          AI Recommendation Engine               │   │  │
│  │  │  agentOrchestrator → Groq LLM → toolRegistry   │   │  │
│  │  │  (resume parsing → feature extraction →        │   │  │
│  │  │   skill normalisation → scoring)               │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │  Prisma ORM  →  PostgreSQL 15  (multi-tenant schemas)   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
           │ S3 API                        │ OIDC / Sessions
┌──────────▼──────────┐         ┌──────────▼──────────┐
│     AWS S3 Bucket   │         │   Keycloak (Port     │
│  (Resume Storage)   │         │   8080) — SSO / IAM  │
└─────────────────────┘         └─────────────────────┘
```

**End-to-end hiring workflow:**

1. **Admin** creates a job opening and assigns a hiring manager.
2. **IT Vendor** browses open roles, uploads candidate PDFs.
3. Backend stores files in S3, queues AI recommendation jobs.
4. **Recommendation Engine** parses resumes, runs Groq agent, persists scores.
5. **Hiring Manager** reviews scored candidates, shortlists or rejects.
6. All state changes are timestamped and stored for audit.

---

## Installation & Setup

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 22 |
| npm | ≥ 9 |
| Docker & Docker Compose | Latest stable |
| PostgreSQL | 15 (via Docker) |
| AWS Account | S3 bucket required |
| Keycloak Realm | Pre-configured realm exported |

### 1. Clone the Repository

```bash
git clone https://github.com/SBK-07/Vendor-Hiring-Manager-Contract-Management-Module.git
cd Vendor-Hiring-Manager-Contract-Management-Module
```

### 2. Start Infrastructure Services (PostgreSQL + Keycloak)

```bash
cd Zelosify-Backend/Server
docker compose up -d
```

Wait for both containers to report healthy (check with `docker compose ps`). Keycloak admin UI is available at `http://localhost:8080/auth`.

### 3. Backend Setup

```bash
cd Zelosify-Backend/Server

# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env — see Environment Variables section below

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev
```

Backend runs on **http://localhost:5000**.

### 4. Frontend Setup

```bash
cd Zelosify-Frontend

# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env.local
# Edit .env.local

# Start development server
npm run dev
```

Frontend runs on **http://localhost:5173** (port 5173 is set explicitly in `package.json` via `next dev -p 5173` and is allow-listed in the backend CORS configuration).

### Environment Variables

**Backend (`Zelosify-Backend/Server/.env`)**

```env
# Database
DATABASE_URL=postgresql://postgres:testrun@localhost:5445/zelosify_recruit_test

# Server
PORT=5000
SESSION_SECRET=your-session-secret

# Keycloak
KEYCLOAK_URL=http://localhost:8080/auth
KEYCLOAK_REALM=your-realm
KEYCLOAK_CLIENT_ID=your-client-id
KEYCLOAK_CLIENT_SECRET=your-client-secret

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=your-region
AWS_S3_BUCKET=your-bucket-name

# AI / LLM
GROQ_API_KEY=your-groq-api-key
```

**Frontend (`Zelosify-Frontend/.env.local`)**

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

---

## Usage

### Running Tests

```bash
# Backend tests
cd Zelosify-Backend/Server
npm test

# Backend tests with UI
npm run test:ui
```

### Building for Production

```bash
# Backend
cd Zelosify-Backend/Server
npm run build         # Generates Prisma client + compiles TypeScript
npm run prisma:deploy # Run migrations against production DB
npm start

# Frontend
cd Zelosify-Frontend
npm run build
npm start
```

### Role-Based Access

| Role | Portal Access |
|---|---|
| `ADMIN` | Full system administration |
| `HIRING_MANAGER` | View openings, review/shortlist/reject profiles |
| `IT_VENDOR` | Browse openings, upload candidate profiles |
| `VENDOR_MANAGER` | Manage vendor resource requests |
| `BUSINESS_USER` | Business-facing views |
| `BUSINESS_APPROVER` | Approval workflows |
| `FINANCE_MANAGER` | Financial oversight |
| `PROCUREMENT_MANAGER` | Procurement management |
| `RESOURCE_MANAGER` | Resource planning |

---

## Screenshots / Demo

> Screenshots and a live demo are not yet published. Contributions and deployment links are welcome — see [Contributing](#contributing).

---

## API Integration

All API endpoints are versioned under `/api/v1/`. Authentication is enforced via JWT Bearer tokens issued by Keycloak.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Initiate Keycloak login |
| `POST` | `/api/v1/auth/logout` | Terminate session |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/totp/setup` | Generate TOTP secret + QR code |
| `POST` | `/api/v1/auth/totp/verify` | Verify TOTP code |

### Hiring Manager

| Method | Endpoint | Auth Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/hiring-manager/openings` | `HIRING_MANAGER` | List assigned openings |
| `GET` | `/api/v1/hiring-manager/openings/:id/profiles` | `HIRING_MANAGER` | Get candidate profiles for an opening |
| `GET` | `/api/v1/hiring-manager/profiles/:id/resume-url` | `HIRING_MANAGER` | Get pre-signed resume download URL |
| `POST` | `/api/v1/hiring-manager/profiles/:id/shortlist` | `HIRING_MANAGER` | Shortlist a candidate profile |
| `POST` | `/api/v1/hiring-manager/profiles/:id/reject` | `HIRING_MANAGER` | Reject a candidate profile |
| `POST` | `/api/v1/hiring-manager/profiles/:id/retry` | `HIRING_MANAGER` | Retry AI recommendation for a profile |

### Vendor

| Method | Endpoint | Auth Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/vendor/openings` | `IT_VENDOR` | List available job openings |
| `GET` | `/api/v1/vendor/openings/:id` | `IT_VENDOR` | Get opening details |
| `POST` | `/api/v1/vendor/openings/:id/check-duplicate` | `IT_VENDOR` | Check for duplicate resume upload |
| `POST` | `/api/v1/vendor/openings/:id/profiles/upload` | `IT_VENDOR` | Upload candidate PDFs (max 10) |
| `PATCH` | `/api/v1/vendor/openings/profiles/:profileId/soft-delete` | `IT_VENDOR` | Soft-delete an uploaded profile |
| `GET` | `/api/v1/vendor/openings/:id/profiles/:profileId/view` | `IT_VENDOR` | Preview uploaded resume |
| `GET` | `/api/v1/vendor/requests` | `VENDOR_MANAGER` | Fetch vendor resource requests |

### AWS / Storage

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/aws/presigned-url` | Generate S3 pre-signed URL |

### Public

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/public/...` | Unauthenticated informational endpoints |

---

## Folder Structure

```
Vendor-Hiring-Manager-Contract-Management-Module/
├── Zelosify-Backend/
│   └── Server/
│       ├── prisma/
│       │   ├── schema.prisma          # Database models (User, Tenant, Opening, hiringProfile)
│       │   └── migrations/            # Prisma migration history
│       ├── src/
│       │   ├── config/
│       │   │   ├── keycloak/          # Keycloak session and OIDC configuration
│       │   │   └── multer/            # File upload configuration
│       │   ├── controllers/
│       │   │   ├── auth/              # Authentication controllers
│       │   │   ├── hiring/            # Hiring manager controllers
│       │   │   ├── vendor/            # Vendor controllers
│       │   │   └── controllers.ts     # Aggregated controller exports
│       │   ├── middlewares/
│       │   │   └── auth/              # JWT auth + role authorisation middleware
│       │   ├── routers/
│       │   │   ├── auth/              # Auth routes
│       │   │   ├── aws/               # AWS/S3 routes
│       │   │   ├── hiring/            # Hiring manager routes
│       │   │   ├── public/            # Public (unauthenticated) routes
│       │   │   └── vendor/            # Vendor routes
│       │   ├── services/
│       │   │   ├── hiring/
│       │   │   │   └── recommendation/
│       │   │   │       ├── agentOrchestrator.ts   # Agentic pipeline entry point
│       │   │   │       ├── recommendationService.ts
│       │   │   │       ├── toolRegistry.ts
│       │   │   │       ├── schemaValidator.ts
│       │   │   │       ├── llm/
│       │   │   │       │   └── groqToolCallingClient.ts  # Groq LLM client
│       │   │   │       └── tools/
│       │   │   │           ├── resumeParsingTool.ts
│       │   │   │           ├── featureExtractionTool.ts
│       │   │   │           ├── skillNormalizationTool.ts
│       │   │   │           ├── deterministicMatchingTool.ts
│       │   │   │           └── scoringEngineTool.ts
│       │   │   └── storage/
│       │   │       ├── aws/           # S3 storage implementation
│       │   │       ├── storageFactory.ts
│       │   │       └── storageService.ts
│       │   ├── helpers/               # Shared utility helpers
│       │   ├── models/                # Additional data model definitions
│       │   ├── scripts/               # Utility / seed scripts
│       │   ├── types/                 # TypeScript type definitions
│       │   ├── utils/                 # Prisma connection, misc utilities
│       │   └── index.ts               # Express server entry point
│       ├── tests/                     # Vitest integration tests
│       ├── docker-compose.yml         # PostgreSQL + Keycloak local stack
│       ├── tsconfig.json
│       └── package.json
│
└── Zelosify-Frontend/
    ├── public/                        # Static assets
    └── src/
        ├── app/
        │   ├── (Landing)/             # Unauthenticated landing & auth pages
        │   └── (UserDashBoard)/
        │       ├── hiring-manager/    # Hiring manager views (openings, profiles)
        │       ├── vendor/            # Vendor views (openings, payments)
        │       ├── business-user/     # Business user views
        │       └── user/              # Common user views
        ├── components/                # Shared UI components (shadcn/ui based)
        ├── hooks/                     # Custom React hooks
        ├── lib/                       # Utility libraries (e.g., cn helper)
        ├── middleware.js              # Next.js route-level auth middleware
        ├── pages/                     # Next.js pages (API routes if any)
        ├── redux/                     # Redux Toolkit slices and store
        ├── styles/                    # Global CSS / Tailwind base styles
        └── utils/                     # Frontend utility functions
```

---

## Future Enhancements / Roadmap

| Priority | Enhancement |
|---|---|
| 🔴 High | End-to-end contract lifecycle management (draft → sign → archive) |
| 🔴 High | Real-time notifications (WebSocket / SSE) for profile status updates |
| 🟡 Medium | Analytics dashboard with hire-rate and time-to-shortlist metrics |
| 🟡 Medium | Candidate self-service portal (profile submission without vendor intermediary) |
| 🟡 Medium | LLM provider abstraction layer (OpenAI / Anthropic fallback from Groq) |
| 🟢 Low | Mobile-responsive PWA shell |
| 🟢 Low | Export openings and shortlisted profiles to PDF/CSV |
| 🟢 Low | Configurable scoring rubrics per opening |
| 🟢 Low | CI/CD pipeline with GitHub Actions |

---

## Contributing

Contributions are welcome. Please follow the steps below:

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Implement** your changes, following the existing TypeScript and ESLint conventions.

3. **Test** your changes:
   ```bash
   cd Zelosify-Backend/Server && npm test
   ```

4. **Commit** using conventional commits:
   ```bash
   git commit -m "feat: add contract lifecycle management"
   ```

5. **Push** and open a pull request against `main`.

### Code Style

- Backend: TypeScript strict mode, ESM modules, Prisma for all DB access.
- Frontend: Next.js App Router conventions, Tailwind CSS utility classes, Redux Toolkit for shared state.
- No direct SQL queries — use Prisma client exclusively.
- All routes must pass through `authenticateUser` and `authorizeRole` middleware.

---

## License

This project is licensed under the **ISC License**. See the [LICENSE](LICENSE) file for details.

---

## Author / Contact

**SBK-07**

- GitHub: [@SBK-07](https://github.com/SBK-07)

---

*Built as a production-oriented prototype demonstrating full-stack engineering, AI-augmented workflows, multi-tenant SaaS architecture, and enterprise-grade identity management.*
