# 블록체인 출금 시스템 - 기술 설계 문서

## 개요

이 문서는 블록체인 출금 시스템의 기술적 구현 세부사항을 담고 있습니다. PRD에서 정의한 비즈니스 요구사항을 구현하기 위한 기술 스택, 아키텍처, 데이터베이스 설계 등을 포함합니다.

## 기술 스택

### 런타임 및 언어

- **Node.js**: 18+ LTS
- **TypeScript**: 5.4.5 (strict mode 활성화)

### 프레임워크

- **Express.js**: 4.21.2 - REST API 서버
- **Nx**: 21.2.1 - 모노레포 관리

### 데이터베이스

- **MySQL**: 8.0
- **Prisma ORM**: 6.11.0
- **Redis**: 최신 stable (nonce 관리, 가스 가격 캐싱)

### 블록체인

- **Ethers.js**: v6.13.4
- **지원 네트워크**: Polygon (Amoy 테스트넷, 메인넷), Localhost (Hardhat)

### 큐 시스템

- **AWS SQS**: 프로덕션 환경
- **LocalStack**: 개발 환경 (AWS SQS 에뮬레이션)

### 보안

- **AWS Secrets Manager**: 개인키 관리
- **AES-256-GCM**: 추가 암호화 레이어
- **JWT**: 인증 토큰
- **bcrypt**: 패스워드 해싱

## 시스템 아키텍처

### 마이크로서비스 구성

```
apps/
├── api-server/          # REST API 게이트웨이
├── signing-service/     # 트랜잭션 서명 서비스
├── tx-broadcaster/      # 블록체인 브로드캐스트 서비스 (개발 예정)
├── tx-monitor/          # 트랜잭션 모니터링 서비스 (개발 예정)
├── account-manager/     # 계정 잔액 관리 서비스 (개발 예정)
└── admin-ui/           # React 관리자 인터페이스 (개발 예정)
```

### 큐 구성

#### 기존 큐

- `tx-request-queue`: 출금 요청 메시지
- `signed-tx-queue`: 서명된 트랜잭션
- `tx-monitor-queue`: 모니터링 대상 트랜잭션
- `dlq-*`: 각 큐의 Dead Letter Queue

#### Account Manager 큐 (계획)

- `balance-check-queue`: 잔액 확인 요청
- `balance-transfer-queue`: 잔액 전송 요청

## 데이터베이스 설계

### 기존 스키마

```prisma
model WithdrawalRequest {
  id                   BigInt    @id @default(autoincrement())
  requestId            String    @unique // UUID v4
  amount               String
  symbol               String    // 토큰 심볼
  toAddress            String
  tokenAddress         String
  chain                String    // 블록체인 이름
  network              String    // 네트워크 타입
  status               String    @default("PENDING")
  errorMessage         String?
  processingMode       String    @default("SINGLE") // SINGLE, BATCH
  batchId              String?   // BatchTransaction 참조
  tryCount             Int       @default(0)
  processingInstanceId String?   // 처리 중인 인스턴스 ID
  processingStartedAt  DateTime? // 처리 시작 시간
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
}

model SignedSingleTransaction {
  id                    BigInt    @id @default(autoincrement())
  requestId             String    // WithdrawalRequest 참조
  txHash                String
  nonce                 Int
  gasLimit              String
  maxFeePerGas          String?   // EIP-1559
  maxPriorityFeePerGas  String?   // EIP-1559
  from                  String
  to                    String
  value                 String
  amount                String    // 전송 금액
  symbol                String    // 토큰 심볼
  data                  String?   // 트랜잭션 데이터
  chainId               Int
  tryCount              Int       @default(0)
  status                String    @default("SIGNED")
  gasUsed               String?
  errorMessage          String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  broadcastedAt         DateTime?
  confirmedAt           DateTime?
}

model SignedBatchTransaction {
  id                    BigInt    @id @default(autoincrement())
  txHash                String?   @unique
  multicallAddress      String    // Multicall3 컨트랙트 주소
  totalRequests         Int       // 배치 내 요청 수
  totalAmount           String    // 총 전송 금액
  symbol                String    // 토큰 심볼
  chainId               Int
  nonce                 Int
  gasLimit              String
  maxFeePerGas          String?   // EIP-1559
  maxPriorityFeePerGas  String?   // EIP-1559
  tryCount              Int       @default(0)
  status                String    @default("PENDING")
  gasUsed               String?
  errorMessage          String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  broadcastedAt         DateTime?
  confirmedAt           DateTime?
}
```

### Account Manager 스키마 (계획)

```prisma
model ManagedAccount {
  id               BigInt    @id @default(autoincrement())
  address          String    @unique
  accountType      String    // MAIN, SUB
  chain            String    // 블록체인 이름
  network          String    // 네트워크 타입
  minBalance       String    // 최소 유지 잔액 (ETH)
  targetBalance    String    // 목표 충전 잔액 (ETH)
  isActive         Boolean   @default(true)
  lastCheckedAt    DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model BalanceTransfer {
  id               BigInt    @id @default(autoincrement())
  fromAccount      String
  toAccount        String
  amount           String
  symbol           String    // ETH 또는 토큰 심볼
  chain            String
  network          String
  status           String    // PENDING, SIGNING, BROADCASTED, CONFIRMED, FAILED, CANCELED
  txHash           String?
  errorMessage     String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

## API 설계

### 기존 API 엔드포인트

#### 출금 API

```typescript
POST /api/v1/withdrawals
{
  "amount": "100.5",
  "symbol": "USDT",
  "toAddress": "0x...",
  "tokenAddress": "0x...",
  "chain": "polygon",
  "network": "amoy"
}

GET /api/v1/withdrawals/:requestId
```

### Account Manager API (계획)

```typescript
// 관리 계정 등록
POST /api/v1/accounts
{
  "address": "0x...",
  "accountType": "MAIN" | "SUB",
  "chain": "polygon",
  "network": "mainnet",
  "minBalance": "0.1",    // ETH
  "targetBalance": "0.5"  // ETH
}

// 계정 목록 조회
GET /api/v1/accounts

// 잔액 상태 조회
GET /api/v1/accounts/:address/balance

// 수동 잔액 전송
POST /api/v1/accounts/transfer
{
  "fromAccount": "0x...",
  "toAccount": "0x...",
  "amount": "0.5",
  "symbol": "ETH"
}
```

## 환경 변수

### 공통 환경 변수

```env
# Database
DATABASE_URL=mysql://root:password@localhost:3306/withdrawal_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Queue
QUEUE_TYPE=localstack  # 또는 'aws'
AWS_REGION=ap-northeast-2
AWS_ENDPOINT=http://localhost:4566  # LocalStack용

# Blockchain
RPC_URL=http://localhost:8545  # 오버라이드용
CHAIN_ID=31337  # 오버라이드용

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=32-character-encryption-key
```

### signing-service 환경 변수

```env
# Signing Service 전용
SIGNING_SERVICE_PRIVATE_KEY_SECRET=signing-service/private-key
SIGNING_SERVICE_LOG_LEVEL=info
SIGNING_SERVICE_AUDIT_LOG_PATH=/app/logs/audit.log

# Batch Processing
ENABLE_BATCH_PROCESSING=true
BATCH_THRESHOLD=5
MIN_GAS_SAVINGS_PERCENT=20
```

### account-manager 환경 변수 (계획)

```env
# Account Manager 전용
BALANCE_CHECK_INTERVAL=300000  # 5분 (밀리초)
MIN_BALANCE_THRESHOLD=0.1      # ETH
BATCH_TRANSFER_ENABLED=true
MAX_BATCH_SIZE=10
```

## 개발 환경 설정

### Docker Compose 구성

```yaml
services:
  mysql: # 데이터베이스
  redis: # 캐시 및 nonce 관리
  localstack: # AWS 서비스 에뮬레이션
  hardhat-node: # 로컬 블록체인
  sqs-admin: # SQS 모니터링 UI
```

### 로컬 개발 시작

```bash
# Docker 서비스 시작
docker-compose -f docker/docker-compose.yaml up -d

# 개발 서버 시작
nx serve api-server
nx serve signing-service
```

## 배치 처리 아키텍처

### 동적 배치 처리 결정 로직

signing-service는 다음 조건을 평가하여 배치 처리 여부를 결정합니다:

1. **큐 상태 확인**: 대기 중인 동일 토큰 요청 수
2. **가스 효율성 계산**: 개별 전송 vs 배치 전송 가스비 비교
3. **시간 제약**: 최대 대기 시간 초과 여부

### 배치 처리 흐름

```
1. 요청 수집 (최대 N초 또는 M개)
2. 배치 가능성 평가
3. Multicall3 calldata 생성
4. 배치 트랜잭션 서명
5. 브로드캐스트 및 모니터링
```

## 보안 고려사항

### 개인키 관리

1. AWS Secrets Manager에 암호화된 개인키 저장
2. 애플리케이션 레벨에서 AES-256-GCM으로 추가 암호화
3. 메모리에서만 복호화, 로그에 절대 노출 금지

### API 보안

1. JWT 토큰 기반 인증
2. Rate Limiting (express-rate-limit)
3. CORS 정책 설정
4. Helmet.js로 보안 헤더 설정

### 트랜잭션 보안

1. Nonce 관리: Redis를 통한 원자적 연산
2. 가스 가격 검증: 최대 가스 가격 제한
3. 주소 검증: 체크섬 주소 확인

## 모니터링 및 로깅

### 로깅 전략

```typescript
// Winston 로거 설정
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() }),
  ],
});
```

### 메트릭 수집 (계획)

- Prometheus 형식 메트릭 엔드포인트
- 커스텀 메트릭: 트랜잭션 수, 성공률, 평균 처리 시간
- 시스템 메트릭: CPU, 메모리, 디스크 사용률

## 테스트 전략

### 단위 테스트

- Jest 사용
- 목표 커버리지: 80% 이상
- 모든 핵심 비즈니스 로직 테스트

### 통합 테스트

- 서비스 간 통신 테스트
- 큐 메시지 처리 테스트
- 데이터베이스 트랜잭션 테스트

### E2E 테스트

- 전체 출금 플로우 테스트
- 실패 시나리오 테스트
- 부하 테스트

## 배포 전략

### CI/CD 파이프라인

```yaml
stages:
  - lint: ESLint, Prettier 검사
  - test: 단위 테스트, 통합 테스트
  - build: Docker 이미지 빌드
  - security: Snyk 취약점 스캔
  - deploy:
      - dev: 자동 배포
      - staging: 수동 승인 후 배포
      - production: 다중 승인 후 배포
```

### 배포 방식

- Blue/Green 배포
- 카나리 배포 (10% → 50% → 100%)
- 자동 롤백 (오류율 > 5%)

## 성능 최적화

### 데이터베이스 최적화

- 인덱스 전략: status, requestId, createdAt
- 커넥션 풀링 설정
- 읽기 전용 복제본 활용 (향후)

### 캐싱 전략

- Redis 캐싱: 가스 가격 (TTL: 30초)
- 메모리 캐싱: 토큰 정보
- CDN: 정적 자산 (Admin UI)

### 비동기 처리

- 큐 기반 비동기 처리
- 병렬 처리 가능한 작업 식별
- 배치 처리로 효율성 향상
