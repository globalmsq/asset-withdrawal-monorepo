# 블록체인 출금 시스템 - 개발 계획

## 개발 조건
1. **큐 시스템**: AWS SQS (로컬 개발용 LocalStack)
2. **블록체인 집중**: Polygon 네트워크만
3. **앱 명명**: 목적별 명명 필요
4. **데이터베이스**: 명시적 요청 전까지 마이그레이션 파일 없음
5. **아키텍처**: 별도 워커 앱을 가진 마이크로서비스

## 현재 구현 상태

### ✅ 완료된 기능

#### 핵심 서비스
- **API 서버** (api-server): 출금 요청/상태 조회 API, Swagger 문서 (인증은 Admin 개발시 구현 예정)
- **서명 서비스** (signing-service): 트랜잭션 서명, Redis 기반 nonce 관리, 가스 가격 캐싱
- **큐 시스템**: LocalStack/AWS SQS, 다중 큐 지원, 오류 처리

#### 데이터베이스 & 보안
- **데이터베이스**: WithdrawalRequest, Transaction, SignedTransaction 모델
- **보안**: AWS Secrets Manager + AES-256-GCM 개인키 암호화

#### 인프라
- **개발 환경**: Docker Compose, LocalStack, Redis
- **모노레포**: Nx workspace, TypeScript strict mode
- **테스팅**: Jest, 포괄적인 단위/통합 테스트

### ❌ 미구현 (우선순위순)
1. **tx-broadcaster** ⚠️ 긴급: 서명된 트랜잭션을 블록체인에 브로드캐스트
2. **DLQ 핸들러**: 실패한 메시지 처리 및 복구
3. **실제 잔액 검증**: signing-service에서 토큰 잔액 확인
4. **Admin API + 인증**: 트랜잭션 관리, 시스템 모니터링, JWT 인증
5. **모니터링**: Prometheus/Grafana, 알림 시스템

## 아키텍처 개요

### 마이크로서비스 구조
```
[사용자] → [api-server] → [tx-request-queue] → [signing-service] → [signed-tx-queue] → [tx-broadcaster] → [블록체인]
```

1. **api-server**: HTTP API, 요청 검증, 데이터베이스 저장
2. **signing-service**: 트랜잭션 서명, nonce 관리, 가스 가격 최적화
3. **tx-broadcaster**: 블록체인 브로드캐스트, 재시도 로직
4. **tx-monitor**: 트랜잭션 확인 추적

### 큐 아키텍처
- **tx-request-queue**: 새로운 출금 요청
- **signed-tx-queue**: 서명된 트랜잭션
- **invalid-dlq**: 검증 실패 요청
- **tx-dlq**: 브로드캐스트 실패 트랜잭션

### 핵심 기술
- **블록체인**: Polygon (Amoy 테스트넷)
- **큐**: AWS SQS / LocalStack
- **데이터베이스**: MySQL + Prisma ORM
- **캐시**: Redis (nonce, 가스 가격)
- **보안**: AWS Secrets Manager, AES-256-GCM

## 개발 계획

### Phase 1: 핵심 시스템 완성

#### 1.0 signing-service 기능 확장 🆕
**목표**: ERC20 토큰 Batch 전송 지원 (Multicall 활용)
```typescript
// 주요 기능
- Multicall3을 활용한 배치 토큰 전송
- WithdrawalRequest 타입 확장 (SINGLE, BATCH)
- MulticallService 구현 (calldata 생성, ABI 인코딩)
- TransactionSigner에 signBatchTransaction() 메서드 추가
- SigningWorker 단일/배치 메시지 구분 처리
- 배치 전송 검증 및 테스트 케이스
```

#### 1.2 tx-broadcaster 구현 ⚠️
**목표**: 출금 흐름 완료
```typescript
// 주요 기능
- signed-tx-queue에서 메시지 폴링
- 데이터베이스에서 서명된 트랜잭션 조회
- Polygon 네트워크에 브로드캐스트
- 트랜잭션 상태 업데이트 (BROADCASTED → CONFIRMED)
- nonce 충돌 감지시 DLQ 처리
- 실패 시 재시도 로직(일시적 Network 문제) 및 DLQ 처리
```

#### 1.3 DLQ 핸들러 구현
```typescript
// 기능
- 실패 메시지 분류 (영구적 vs 일시적)
- 재시도 자격 판단
- 수동 개입 알림
- 재시도 하기 위해서는 request-queue로 메시지 전송
- 테스트 및 검증
```

#### 1.4 실제 잔액 검증
```typescript
// signing-service 강화
- ERC-20 토큰 잔액 확인
- 가스 수수료 계산 및 검증
- 출금 한도 확인
- Redis 캐시를 통한 성능 최적화
```

#### 1.5 tx-monitor 구현
```typescript
// 트랜잭션 모니터링 서비스
- 블록체인 트랜잭션 상태 추적
- 확인 수 모니터링 (12 confirmations)
- 실패 감지 및 알림
- tx-broadcaster와 연동
- 재시도 트리거
- 가스비 높여서 재시도 트리거
```

### Phase 2: 관리 시스템

##### 2.1.1 Admin UI 애플리케이션 (React + Tailwind CSS)
```bash
# React 앱 생성
nx add @nx/react
nx g @nx/react:app admin-ui
```

**UI 기능**:
- **대시보드**: 실시간 트랜잭션 통계, 시스템 상태
- **트랜잭션 관리**: 검색/필터, 상태 추적, 수동 재시도
- **큐 모니터링**: 실시간 큐 상태, DLQ 관리
- **사용자 관리**: 계정 생성/비활성화, 권한 설정
- **시스템 설정**: 가스 가격 임계값, 재시도 정책

**기술 스택**:
- **프레임워크**: React 18 + TypeScript
- **UI 라이브러리**: Ant Design (주요 컴포넌트) + Tailwind CSS (커스텀 스타일링)
  - Ant Design: 폼, 테이블, 모달 등 복잡한 컴포넌트
  - Tailwind CSS: 레이아웃, 스페이싱, 커스텀 디자인
  - 스타일 충돌 방지: Ant Design 테마 변수와 Tailwind 유틸리티 분리
- **상태 관리**: TanStack Query (서버 상태) + Zustand (클라이언트 상태)
- **차트**: Recharts (트랜잭션 통계, 성능 메트릭)
- **실시간**: Socket.IO (WebSocket 래퍼)
  - 자동 재연결
  - 이벤트 기반 통신
  - 룸 기반 구독

**주요 페이지**:
```
/dashboard - 전체 시스템 개요
/transactions - 트랜잭션 목록/검색
/queues - 큐 상태 모니터링
/users - 사용자 관리
/settings - 시스템 설정
/analytics - 성능 분석
```

##### 2.1.2 Admin API 확장
```typescript
// 인증 엔드포인트
POST /auth/register - 사용자 등록
POST /auth/login - JWT 로그인
POST /auth/refresh - 토큰 갱신

// Admin API (인증 필요)
GET /admin/transactions - 트랜잭션 목록/검색/필터링
GET /admin/transactions/:id - 트랜잭션 상세 정보
POST /admin/transactions/:id/retry - 수동 재시도
PUT /admin/transactions/:id/status - 상태 강제 변경

GET /admin/queues - 큐 상태 모니터링
GET /admin/queues/:name/messages - 큐 메시지 조회
POST /admin/queues/:name/purge - 큐 비우기

GET /admin/users - 사용자 목록
POST /admin/users - 사용자 생성
PUT /admin/users/:id - 사용자 정보 수정
DELETE /admin/users/:id - 사용자 비활성화

GET /admin/stats - 시스템 통계
GET /admin/analytics - 성능 분석 데이터
GET /admin/health - 헬스체크 상세 정보

// WebSocket 엔드포인트
WS /admin/ws - 실시간 업데이트 (큐 상태, 트랜잭션 변경)
```

##### 2.1.4 WebSocket 메시지 포맷
```typescript
// 서버 → 클라이언트 이벤트
interface ServerToClientEvents {
  'queue:update': (data: {
    queueName: string;
    messageCount: number;
    dlqCount: number;
  }) => void;

  'transaction:update': (data: {
    id: string;
    status: string;
    txHash?: string;
    errorMessage?: string;
  }) => void;

  'system:alert': (data: {
    severity: 'info' | 'warning' | 'error';
    message: string;
    timestamp: Date;
  }) => void;
}

// 클라이언트 → 서버 이벤트
interface ClientToServerEvents {
  'subscribe:queues': () => void;
  'subscribe:transactions': (filter?: TransactionFilter) => void;
  'unsubscribe:all': () => void;
}
```

##### 2.1.5 인증 시스템
```typescript
// 주요 기능
- JWT 기반 인증 미들웨어
- 역할 기반 접근 제어 (USER, ADMIN, SUPER_ADMIN)
- bcrypt 패스워드 해싱
- User 모델 및 서비스
- 세션 관리 및 토큰 갱신
- API Rate Limiting
  - IP 기반: 분당 60회
  - 사용자 기반: 분당 100회
  - 버스트 허용: 초당 10회
```

#### 2.2 모니터링 시스템

##### 2.2.1 Prometheus 메트릭
```yaml
# 애플리케이션 메트릭
api_request_duration_seconds: API 응답 시간
api_request_total: API 요청 수 (method, endpoint, status)
queue_message_count: 큐별 메시지 수
queue_processing_duration_seconds: 메시지 처리 시간
transaction_total: 트랜잭션 수 (status, network)
transaction_gas_used: 가스 사용량
transaction_confirmation_time_seconds: 확인 시간

# 시스템 메트릭
node_cpu_usage_percent: CPU 사용률
node_memory_usage_percent: 메모리 사용률
node_disk_usage_percent: 디스크 사용률
```

##### 2.2.2 알림 임계값
```yaml
# Critical (즉시 대응)
- API 오류율 > 5% (5분간)
- 큐 메시지 > 1000개
- DLQ 메시지 > 100개
- 트랜잭션 실패율 > 10%
- 시스템 리소스 > 90%

# Warning (모니터링)
- API 응답 시간 > 1초
- 큐 메시지 > 500개
- DLQ 메시지 > 50개
- 트랜잭션 실패율 > 5%
- 시스템 리소스 > 70%
```

### Phase 3: 프로덕션 준비

#### 3.1 보안 강화

##### 3.1.1 API 보안
```typescript
// API 키 인증 시스템
- API 키 생성/관리
- HMAC 서명 검증
- IP 화이트리스트
- Rate Limiting 강화
```

##### 3.1.2 보안 기능
```typescript
// 추가 보안 레이어
- 2FA 구현 (TOTP)
  - QR 코드 생성
  - 백업 코드 시스템
  - 복구 프로세스
- SQL Injection 방지 (이미 Prisma로 처리됨)
- XSS 방지 (helmet.js)
- CORS 정책 강화
- 보안 헤더 설정
```

##### 3.1.3 보안 감사
- OWASP Top 10 체크리스트
- 침투 테스트 (외부 업체)
- 취약점 스캔 및 수정

#### 3.2 인프라 마이그레이션
- AWS EKS 클러스터 설정
- Helm 차트 작성
- 자동 확장 설정 (HPA, VPA)
- 다중 AZ 배포 및 로드 밸런싱
- 프로덕션 환경 테스트

## 테스트 계획

### Phase 1 테스트 (핵심 시스템)
- **단위 테스트**: 각 서비스의 개별 기능 테스트
- **통합 테스트**: 서비스 간 메시지 큐 통신 테스트
- **시나리오 테스트**:
  - 정상 출금 플로우
  - nonce 충돌 처리
  - RPC 실패 대응

### Phase 2 테스트 (관리 시스템)
- **E2E 테스트**: 전체 출금 플로우 (API → 블록체인)
- **부하 테스트**: 목표 TPS(100) 달성 확인
- **인증 테스트**: JWT 토큰 검증, 권한 확인

### Phase 3 테스트 (프로덕션)
- **보안 테스트**: OWASP Top 10, 침투 테스트
- **장애 복구 테스트**: 서비스 장애 시나리오
- **성능 테스트**: 대용량 처리, 응답 시간

## 추가 고려사항

### 백업 및 복구 전략
```yaml
# 데이터베이스 백업
- 일일 자동 백업 (30일 보관)
- 트랜잭션 로그 백업 (7일 보관)
- 스냅샷 백업 (주간)
- 복구 테스트 (월간)

# 복구 목표
- RPO (Recovery Point Objective): 1시간
- RTO (Recovery Time Objective): 4시간
```

### 로깅 전략
```yaml
# 중앙 집중식 로깅 (ELK Stack)
- Elasticsearch: 로그 저장 및 검색
- Logstash: 로그 수집 및 파싱
- Kibana: 로그 시각화 및 분석

# 로그 레벨
- ERROR: 시스템 오류, 트랜잭션 실패
- WARN: 성능 저하, 리소스 부족
- INFO: 트랜잭션 상태, API 요청
- DEBUG: 상세 처리 과정 (개발 환경만)

# 로그 보관
- 실시간 로그: 7일
- 아카이브 로그: 90일
- 감사 로그: 1년
```

### API 버전 관리
```typescript
// URL 경로 버전 관리
GET /api/v1/withdrawals
GET /api/v2/withdrawals  // 새 버전

// 버전 지원 정책
- 새 버전 출시 후 6개월간 이전 버전 지원
- Deprecation 공지: 3개월 전
- 강제 마이그레이션: 6개월 후
```

### CI/CD 파이프라인
```yaml
# GitHub Actions 워크플로우
stages:
  - lint: ESLint, Prettier 검사
  - test: 단위 테스트, 통합 테스트
  - build: Docker 이미지 빌드
  - security: Snyk 취약점 스캔
  - deploy:
    - dev: 자동 배포
    - staging: 수동 승인 후 배포
    - production: 다중 승인 후 배포

# 배포 전략
- Blue/Green 배포
- 카나리 배포 (10% → 50% → 100%)
- 자동 롤백 (오류율 > 5%)
```

## 기술적 참고사항

### Redis 기반 Nonce 관리 ✅
```typescript
class NonceCacheService {
  async getAndIncrement(address: string): Promise<number>
  async initialize(address: string): Promise<void>
}

// 특징:
- 원자적 INCR 연산으로 충돌 방지
- 서비스 재시작시 네트워크와 동기화
- TTL 24시간, 자동 정리
- 연결 실패시 SQS 재시도 트리거
```

### 가스 가격 캐싱 ✅
```typescript
class GasPriceCache {
  private ttl = 30_000; // 30초
  get(): GasPrice | null
  set(gasPrice: GasPrice): void
}

// 특징:
- RPC 호출 최소화
- 캐시 만료시 자동 갱신
- RPC 실패시 메시지 처리 건너뛰기
```

### WithdrawalRequest 모델 ✅
```prisma
model WithdrawalRequest {
  id            BigInt   @id @default(autoincrement())
  requestId     String   @unique // tx-{timestamp}-{random}
  status        String   @default("PENDING") // PENDING → SIGNING → BROADCASTING → COMPLETED
  amount        String
  currency      String
  toAddress     String
  tokenAddress  String
  network       String
  errorMessage  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### SignedTransaction 모델 ✅
```prisma
model SignedTransaction {
  id                    BigInt    @id @default(autoincrement())
  requestId             String    // WithdrawalRequest와 1:N 관계
  txHash                String
  nonce                 Int
  gasLimit              String
  maxFeePerGas          String?   // EIP-1559
  maxPriorityFeePerGas  String?
  from                  String
  to                    String
  value                 String
  chainId               Int
  retryCount            Int       @default(0)
  status                String    @default("SIGNED") // SIGNED → BROADCASTED → CONFIRMED
  signedAt              DateTime  @default(now())
  broadcastedAt         DateTime?
  confirmedAt           DateTime?
}
```

### User 모델 ❌ (Admin 개발시 구현 예정)
```prisma
model User {
  id        BigInt   @id @default(autoincrement())
  email     String   @unique
  password  String   // bcrypt 해시
  role      String   @default("USER") // USER, ADMIN
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Withdrawal requests 관계 (향후 필요시)
  // withdrawalRequests WithdrawalRequest[]

  @@map("users")
}
```

## 개발 가이드라인

### 로컬 환경 설정
```bash
# 모든 서비스 시작
docker-compose -f docker/docker-compose.yaml up -d
docker-compose -f docker/docker-compose.localstack.yaml up -d

# SQS 큐 초기화
./docker/scripts/init-localstack.sh

# 개발 서버 시작
nx serve api-server
nx serve signing-service  # 별도 터미널
```

### 환경 변수
```env
# 필수 설정
QUEUE_TYPE=localstack                    # 또는 'aws'
AWS_REGION=ap-northeast-2
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_CHAIN_ID=80002                   # Amoy 테스트넷
DATABASE_URL=mysql://root:password@localhost:3306/withdrawal_db
REDIS_URL=redis://localhost:6379
```

## 위험 관리

### 기술적 위험
1. **nonce 충돌**: ✅ Redis 원자적 연산으로 해결
2. **RPC 실패**: ✅ 가스 가격 캐싱 및 폴백으로 해결
3. **트랜잭션 실패**: tx-broadcaster에서 재시도 로직 필요

### 운영 위험
1. **대량 출금**: 큐 기반 부하 분산으로 대응
2. **시스템 장애**: 다중 AZ 배포 및 자동 복구 필요
3. **보안 위협**: 최소 권한 원칙, 정기 감사

## 마일스톤

- **M1**: tx-broadcaster 구현으로 핵심 흐름 완성
- **M2**: tx-monitor, DLQ 핸들러 및 잔액 검증으로 안정성 확보
- **M3**: Admin API + 인증 시스템으로 관리 기반 확보
- **M4**: 모니터링 시스템으로 운영 효율성 확보
- **M5**: 프로덕션 배포 준비 완료

## 즉시 해야 할 작업

### 1. tx-broadcaster 서비스 생성 ⚠️
```bash
nx g @nx/node:app tx-broadcaster
```
**핵심 구현 요소**:
- [ ] SQS 메시지 폴링 워커
- [ ] 서명된 트랜잭션 DB 조회
- [ ] Polygon 네트워크 브로드캐스트
- [ ] 트랜잭션 상태 업데이트
- [ ] 오류 처리 및 재시도 로직

### 2. 테스트 케이스
- [ ] 정상 브로드캐스트 플로우
- [ ] nonce 충돌 시나리오
- [ ] RPC 실패 시나리오
- [ ] 재시도 한도 초과 시나리오

---

*이 계획은 현재 구현 상태를 반영하며, tx-broadcaster 구현을 최우선으로 하여 완전한 출금 시스템을 완성하는 것을 목표로 합니다.*