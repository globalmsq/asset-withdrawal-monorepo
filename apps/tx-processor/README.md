# Transaction Processor

## 개요

Transaction Processor는 출금 요청을 처리하고 워크플로우를 조정하는 핵심 오케스트레이션 서비스입니다. API 서버로부터 받은 출금 요청을 검증하고, 서명 서비스로 전달하며, 전체 프로세스를 관리합니다.

## 주요 기능

- 출금 요청 큐 소비 및 처리
- 비즈니스 로직 검증 (잔액, 한도, 권한)
- 트랜잭션 워크플로우 오케스트레이션
- 실패 처리 및 재시도 관리
- 배치 처리 최적화
- 처리 상태 추적 및 보고

## 기술 스택

- **큐 시스템**: AWS SQS Consumer
- **워크플로우**: 상태 머신 패턴
- **데이터베이스**: MySQL with Prisma
- **검증**: 비즈니스 규칙 엔진
- **로깅**: Winston
- **모니터링**: Prometheus metrics

## 처리 플로우

```
┌─────────────────┐
│ Withdrawal Queue│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Validation    │──── 잔액 확인
│     Layer       │──── 한도 확인
└────────┬────────┘──── 권한 검증
         │
         ▼
┌─────────────────┐
│   Processing    │──── 상태 업데이트
│     Engine      │──── 트랜잭션 생성
└────────┬────────┘──── 메타데이터 추가
         │
         ▼
┌─────────────────┐
│  Signing Queue  │
└─────────────────┘
```

## 프로젝트 구조

```
apps/tx-processor/
├── src/
│   ├── processors/      # 처리 로직
│   ├── validators/      # 검증 규칙
│   ├── orchestrators/   # 워크플로우 조정
│   ├── services/        # 비즈니스 서비스
│   ├── utils/          # 유틸리티 함수
│   └── index.ts        # 진입점
├── tests/              # 테스트 파일
├── .env.example       # 환경 변수 예시
└── README.md         # 이 파일
```

## 환경 변수

```bash
# 서비스 설정
PORT=3001
NODE_ENV=development
WORKER_CONCURRENCY=10

# 큐 설정
WITHDRAWAL_QUEUE_URL=https://sqs.region.amazonaws.com/account/withdrawal-queue
SIGNING_QUEUE_URL=https://sqs.region.amazonaws.com/account/signing-queue
MESSAGE_RETENTION_PERIOD=86400
VISIBILITY_TIMEOUT=300

# 처리 설정
BATCH_SIZE=50
PROCESSING_TIMEOUT=60000
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_MS=5000

# 검증 규칙
MIN_WITHDRAWAL_AMOUNT=1
MAX_WITHDRAWAL_AMOUNT=1000000
DAILY_WITHDRAWAL_LIMIT=5000000
```

## 비즈니스 로직

### 검증 규칙

1. **잔액 검증**
   ```typescript
   // 사용자 잔액이 출금 금액보다 많은지 확인
   if (userBalance < withdrawalAmount) {
     throw new InsufficientBalanceError();
   }
   ```

2. **한도 검증**
   ```typescript
   // 일일 출금 한도 확인
   const dailyTotal = await getDailyWithdrawalTotal(userId);
   if (dailyTotal + amount > DAILY_LIMIT) {
     throw new WithdrawalLimitExceededError();
   }
   ```

3. **권한 검증**
   ```typescript
   // 사용자가 해당 자산에 대한 출금 권한이 있는지 확인
   if (!hasWithdrawalPermission(userId, tokenAddress)) {
     throw new UnauthorizedError();
   }
   ```

### 처리 상태

```typescript
enum ProcessingStatus {
  RECEIVED = 'RECEIVED',        // 큐에서 수신
  VALIDATING = 'VALIDATING',    // 검증 중
  VALIDATED = 'VALIDATED',      // 검증 완료
  QUEUED = 'QUEUED',           // 서명 큐 전송
  FAILED = 'FAILED',           // 처리 실패
  RETRYING = 'RETRYING'        // 재시도 중
}
```

## 워크플로우 관리

### 상태 머신
```typescript
const workflow = new StateMachine({
  initial: 'received',
  states: {
    received: {
      on: { VALIDATE: 'validating' }
    },
    validating: {
      on: {
        VALID: 'validated',
        INVALID: 'failed'
      }
    },
    validated: {
      on: { QUEUE: 'queued' }
    },
    queued: {
      on: { COMPLETE: 'completed' }
    },
    failed: {
      on: { RETRY: 'retrying' }
    }
  }
});
```

### 배치 처리
```typescript
// 동일 사용자의 여러 출금을 배치로 처리
const batchProcessor = new BatchProcessor({
  batchSize: 50,
  flushInterval: 5000,
  groupBy: 'userId'
});
```

## 실행 방법

### 개발 환경
```bash
# 개발 서버 실행
npm run dev:processor

# 테스트 실행
npm run test:processor
```

### 프로덕션
```bash
# 빌드
npm run build:processor

# 실행
npm run serve:processor
```

## 모니터링

### 메트릭
- `processor_messages_processed`: 처리된 메시지 수
- `processor_validation_failures`: 검증 실패 수
- `processor_processing_duration`: 처리 시간
- `processor_queue_depth`: 큐 깊이
- `processor_batch_size`: 배치 크기

### 헬스 체크
```typescript
// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    queueConnection: queueClient.isConnected(),
    dbConnection: await checkDatabaseConnection()
  };
  res.json(health);
});
```

## 에러 처리

### 에러 유형
1. **검증 에러**: 비즈니스 규칙 위반
2. **시스템 에러**: 인프라 또는 연결 문제
3. **타임아웃 에러**: 처리 시간 초과

### 재시도 전략
```typescript
const retryStrategy = {
  validation_error: { retry: false },
  system_error: { retry: true, maxAttempts: 3 },
  timeout_error: { retry: true, maxAttempts: 2 }
};
```

## 성능 최적화

1. **배치 처리**: 여러 요청을 묶어서 처리
2. **병렬 처리**: 독립적인 검증은 병렬로 실행
3. **캐싱**: 자주 조회되는 데이터 캐싱
4. **연결 풀링**: 데이터베이스 연결 재사용

## 문제 해결

### 일반적인 문제

1. **"Queue connection lost"**
   - AWS 자격 증명 확인
   - 네트워크 연결 확인
   - SQS 권한 확인

2. **"Processing timeout"**
   - PROCESSING_TIMEOUT 값 조정
   - 배치 크기 감소
   - 병렬 처리 수 증가

3. **"Database connection pool exhausted"**
   - 연결 풀 크기 증가
   - 쿼리 최적화
   - 캐싱 전략 개선

## 관련 문서

- [전체 아키텍처](../../ARCHITECTURE.md)
- [API 서버](../api-server/README.md)
- [서명 서비스](../signing-service/README.md)