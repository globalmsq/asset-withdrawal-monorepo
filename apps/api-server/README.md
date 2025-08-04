# API Server

## 개요

API Server는 자산 출금 시스템의 주요 진입점으로, RESTful API를 통해 클라이언트 애플리케이션과 통신합니다. 인증, 출금 요청 관리, 상태 조회 등의 핵심 기능을 제공합니다.

## 주요 기능

- JWT 기반 사용자 인증 및 권한 관리
- 출금 요청 생성 및 검증
- 트랜잭션 상태 실시간 조회
- 웹훅을 통한 상태 변경 알림
- API 속도 제한 및 보안

## 기술 스택

- **프레임워크**: Express.js with TypeScript
- **인증**: JWT (jsonwebtoken)
- **검증**: express-validator
- **문서화**: Swagger/OpenAPI 3.0
- **로깅**: Winston
- **모니터링**: Prometheus metrics

## API 엔드포인트

### 인증

```
POST   /api/v1/auth/login          # 로그인
POST   /api/v1/auth/refresh        # 토큰 갱신
POST   /api/v1/auth/logout         # 로그아웃
```

### 출금 관리

```
POST   /api/v1/withdrawals         # 출금 요청 생성
GET    /api/v1/withdrawals/:id     # 특정 출금 조회
GET    /api/v1/withdrawals         # 출금 목록 조회
POST   /api/v1/withdrawals/batch   # 일괄 출금 요청
```

### 상태 및 모니터링

```
GET    /health                     # 헬스 체크
GET    /metrics                    # Prometheus 메트릭
GET    /api/v1/status              # 시스템 상태
```

## 프로젝트 구조

```
apps/api-server/
├── src/
│   ├── controllers/       # 요청 핸들러
│   ├── middlewares/       # Express 미들웨어
│   ├── routes/           # 라우트 정의
│   ├── services/         # 비즈니스 로직
│   ├── validators/       # 입력 검증
│   └── app.ts           # Express 앱 설정
├── tests/               # 테스트 파일
├── .env.example        # 환경 변수 예시
└── README.md          # 이 파일
```

## 환경 변수

```bash
# 서버 설정
PORT=3000
NODE_ENV=development

# 데이터베이스
DATABASE_URL=mysql://user:pass@localhost:3306/withdrawal

# JWT 설정
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379

# 속도 제한
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100

# AWS SQS
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
WITHDRAWAL_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue
```

## 개발 가이드

### 로컬 실행

```bash
# 개발 서버 실행
npm run dev:api

# 프로덕션 빌드
npm run build:api

# 테스트 실행
npm run test:api
```

### API 문서

개발 서버 실행 후 다음 URL에서 Swagger UI를 확인할 수 있습니다:

```
http://localhost:3000/api-docs
```

### 인증 플로우

1. `/api/v1/auth/login`으로 로그인 요청
2. 응답으로 받은 `accessToken`을 헤더에 포함:
   ```
   Authorization: Bearer <token>
   ```
3. 토큰 만료 시 `/api/v1/auth/refresh`로 갱신

### 출금 요청 예시

```bash
curl -X POST http://localhost:3000/api/v1/withdrawals \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "100.0",
    "tokenAddress": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "destinationAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f1234"
  }'
```

## 에러 처리

모든 에러는 일관된 형식으로 반환됩니다:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "잔액이 부족합니다",
    "details": {
      "required": "100.0",
      "available": "50.0"
    }
  }
}
```

### 에러 코드

- `UNAUTHORIZED`: 인증 실패
- `FORBIDDEN`: 권한 없음
- `VALIDATION_ERROR`: 입력 검증 실패
- `INSUFFICIENT_BALANCE`: 잔액 부족
- `RATE_LIMIT_EXCEEDED`: 속도 제한 초과
- `INTERNAL_ERROR`: 서버 내부 오류

## 보안 고려사항

- 모든 엔드포인트는 HTTPS를 통해서만 접근 가능
- API 키는 환경 변수로 관리
- SQL 인젝션 방지를 위해 Prisma ORM 사용
- XSS 방지를 위한 입력 살균
- CORS 설정으로 허용된 출처만 접근 가능

## 모니터링

### 헬스 체크

```bash
curl http://localhost:3000/health
```

### Prometheus 메트릭

- `http_request_duration_seconds`: HTTP 요청 처리 시간
- `http_requests_total`: 총 HTTP 요청 수
- `withdrawal_requests_total`: 출금 요청 수
- `authentication_attempts_total`: 인증 시도 수

## 문제 해결

### 일반적인 문제

1. **"Cannot connect to database"**
   - MySQL 서버가 실행 중인지 확인
   - DATABASE_URL이 올바른지 확인

2. **"JWT secret not set"**
   - .env 파일에 JWT_SECRET 설정 확인

3. **"Rate limit exceeded"**
   - 클라이언트의 요청 빈도 조절
   - 필요시 RATE_LIMIT_MAX 값 조정

## 관련 문서

- [전체 아키텍처](../../ARCHITECTURE.md)
- [API 문서](../../docs/api/README.md)
- [개발 설정](../../SETUP.md)
