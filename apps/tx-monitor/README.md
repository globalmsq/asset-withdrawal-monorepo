# Transaction Monitor

## 개요

Transaction Monitor는 블록체인에 제출된 트랜잭션의 상태를 실시간으로 추적하고 모니터링하는 서비스입니다. 트랜잭션 확인, 실패 감지, 재시도 로직을 담당합니다.

## 주요 기능

- 블록체인 트랜잭션 상태 실시간 모니터링
- 트랜잭션 확인 수 추적
- 실패 또는 중단된 트랜잭션 감지
- 자동 재시도 메커니즘
- 웹훅을 통한 상태 알림
- 가스 가격 급등 감지 및 대응

## 기술 스택

- **블록체인 상호작용**: Ethers.js v6
- **큐 시스템**: AWS SQS
- **실시간 연결**: WebSocket (블록체인 이벤트)
- **데이터베이스**: MySQL with Prisma
- **로깅**: Winston
- **모니터링**: Prometheus metrics

## 아키텍처

```
┌─────────────────┐
│   SQS Queue     │
│ (Monitor Tasks) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│   TX Monitor    │────▶│  Blockchain  │
│    Service      │◀────│   (Polygon)  │
└────────┬────────┘     └──────────────┘
         │
         ▼
┌─────────────────┐
│     MySQL       │
│   (TX Status)   │
└─────────────────┘
```

## 모니터링 플로우

1. SQS 큐에서 모니터링 작업 수신
2. 블록체인에서 트랜잭션 상태 조회
3. 확인 수 및 상태 확인
4. 데이터베이스 상태 업데이트
5. 필요시 웹훅 알림 발송
6. 미확인 트랜잭션은 재큐잉

## 프로젝트 구조

```
apps/tx-monitor/
├── src/
│   ├── monitors/         # 모니터링 로직
│   ├── services/         # 비즈니스 서비스
│   ├── handlers/         # 이벤트 핸들러
│   ├── utils/           # 유틸리티 함수
│   └── index.ts         # 진입점
├── tests/               # 테스트 파일
├── .env.example        # 환경 변수 예시
└── README.md          # 이 파일
```

## 환경 변수

```bash
# 서비스 설정
PORT=3003
NODE_ENV=development

# 블록체인
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_WS_URL=wss://rpc-amoy.polygon.technology
CONFIRMATION_BLOCKS=12
MAX_RETRY_COUNT=3

# SQS
MONITOR_QUEUE_URL=https://sqs.region.amazonaws.com/account/monitor-queue
VISIBILITY_TIMEOUT=300

# 웹훅
WEBHOOK_URL=https://your-app.com/webhooks/tx-status
WEBHOOK_SECRET=your-webhook-secret

# 모니터링 설정
POLL_INTERVAL=5000
BATCH_SIZE=10
TIMEOUT_BLOCKS=50
```

## 트랜잭션 상태

### 상태 전이도

```
PENDING → PROCESSING → CONFIRMING → CONFIRMED
                    ↓
                 FAILED
                    ↓
                RETRYING
```

### 상태 설명

- `PENDING`: 초기 상태
- `PROCESSING`: 블록체인에 제출됨
- `CONFIRMING`: 확인 대기 중
- `CONFIRMED`: 필요한 확인 수 도달
- `FAILED`: 트랜잭션 실패
- `RETRYING`: 재시도 중

## 모니터링 전략

### 1. 블록 기반 모니터링

```typescript
// 새 블록마다 미확인 트랜잭션 확인
blockchain.on('block', async blockNumber => {
  const pendingTxs = await getPendingTransactions();
  await checkTransactions(pendingTxs, blockNumber);
});
```

### 2. 주기적 폴링

```typescript
// 5초마다 상태 확인
setInterval(async () => {
  await pollTransactionStatuses();
}, POLL_INTERVAL);
```

### 3. 타임아웃 처리

```typescript
// 50 블록 이상 확인되지 않은 트랜잭션 처리
if (currentBlock - tx.blockNumber > TIMEOUT_BLOCKS) {
  await handleTimeout(tx);
}
```

## 실행 방법

### 개발 환경

```bash
# 개발 서버 실행
npm run dev:monitor

# 테스트 실행
npm run test:monitor
```

### 프로덕션

```bash
# 빌드
npm run build:monitor

# 실행
npm run serve:monitor
```

## 모니터링 메트릭

### Prometheus 메트릭

- `tx_monitor_processed_total`: 처리된 트랜잭션 수
- `tx_monitor_confirmed_total`: 확인된 트랜잭션 수
- `tx_monitor_failed_total`: 실패한 트랜잭션 수
- `tx_monitor_retry_total`: 재시도 횟수
- `tx_monitor_confirmation_time`: 확인 시간 히스토그램

### 로그 레벨

```typescript
logger.info('Transaction confirmed', { txHash, confirmations });
logger.warn('Transaction timeout', { txHash, age });
logger.error('Monitor error', { error, txHash });
```

## 재시도 로직

### 재시도 조건

1. 트랜잭션 실패 (revert, out of gas)
2. 네트워크 타임아웃
3. 가스 가격 급등으로 인한 중단

### 재시도 전략

```typescript
const retryConfig = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelay: 5000,
  maxDelay: 60000,
};
```

## 웹훅 알림

### 웹훅 페이로드

```json
{
  "event": "transaction.confirmed",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "transactionHash": "0x...",
    "status": "CONFIRMED",
    "confirmations": 12,
    "blockNumber": 12345678
  },
  "signature": "hmac-sha256-signature"
}
```

### 지원 이벤트

- `transaction.confirmed`: 트랜잭션 확인 완료
- `transaction.failed`: 트랜잭션 실패
- `transaction.timeout`: 타임아웃 발생
- `transaction.retrying`: 재시도 시작

## 문제 해결

### 일반적인 문제

1. **"RPC connection failed"**
   - RPC URL이 올바른지 확인
   - 네트워크 연결 상태 확인
   - RPC 제공자 상태 확인

2. **"Transaction stuck"**
   - 가스 가격이 너무 낮은지 확인
   - 네트워크 혼잡도 확인
   - nonce 충돌 여부 확인

3. **"Webhook delivery failed"**
   - 웹훅 URL 접근 가능 여부 확인
   - 웹훅 시크릿 일치 여부 확인
   - 타임아웃 설정 확인

## 성능 최적화

- 배치 처리로 RPC 호출 최소화
- 블록체인 이벤트 구독으로 폴링 감소
- 트랜잭션 상태 캐싱
- 연결 풀링 사용

## 관련 문서

- [전체 아키텍처](../../ARCHITECTURE.md)
- [서명 서비스](../signing-service/README.md)
- [트랜잭션 프로세서](../tx-processor/README.md)
