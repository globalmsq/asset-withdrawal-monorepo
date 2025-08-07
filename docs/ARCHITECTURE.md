# 시스템 아키텍처

## 개요

자산 출금 시스템은 마이크로서비스 아키텍처를 기반으로 구축된 이벤트 기반 시스템입니다. 각 서비스는 특정 도메인에 대한 책임을 가지며, AWS SQS를 통해 비동기적으로 통신합니다.

## 시스템 구성도

```mermaid
graph TB
    subgraph "클라이언트"
        Client[클라이언트 앱]
        Admin[관리자 대시보드]
    end

    subgraph "API 레이어"
        ALB[Application Load Balancer]
        API[API Server<br/>포트: 3000]
    end

    subgraph "큐 시스템"
        SQS1[tx-request-queue<br/>출금 요청 큐]
        SQS2[signed-tx-queue<br/>서명된 트랜잭션 큐]
        SQS3[tx-monitor-queue<br/>모니터링 큐]
        SQS4[balance-check-queue<br/>잔액 확인 큐]
        SQS5[balance-transfer-queue<br/>잔액 전송 큐]

        DLQ1[request-dlq<br/>요청 DLQ]
        DLQ2[signed-tx-dlq<br/>서명 DLQ]
        DLQ3[broadcast-tx-dlq<br/>브로드캐스트 DLQ]
    end

    subgraph "처리 서비스"
        Signer[Signing Service<br/>포트: 3002]
        Broadcaster[TX Broadcaster<br/>포트: 3004<br/>(개발 예정)]
        Monitor[TX Monitor<br/>포트: 3003<br/>(개발 예정)]
        AcctMgr[Account Manager<br/>포트: 3005<br/>(개발 예정)]
    Recovery[Recovery Service<br/>포트: 3006<br/>(개발 예정)]
    end

    subgraph "데이터 레이어"
        MySQL[(MySQL<br/>포트: 3306)]
        Redis[(Redis<br/>포트: 6379)]
    end

    subgraph "블록체인"
        Polygon[Polygon Network]
    end

    Client --> ALB
    Admin --> ALB
    ALB --> API

    API --> SQS1
    API --> MySQL
    API --> Redis

    SQS1 --> Signer
    Signer --> SQS2
    Signer --> MySQL
    Signer --> Redis

    SQS2 --> Broadcaster
    Broadcaster --> Polygon
    Broadcaster --> SQS3
    Broadcaster --> MySQL

    SQS3 --> Monitor
    Monitor --> Polygon
    Monitor --> MySQL

    AcctMgr --> SQS4
    AcctMgr --> SQS5
    AcctMgr --> MySQL
    AcctMgr --> Polygon
    SQS5 --> Signer

    Recovery --> DLQ1
    Recovery --> DLQ2
    Recovery --> DLQ3
    Recovery --> Polygon
    Recovery --> MySQL

    SQS1 -.->|5회 실패 시| DLQ1
    SQS2 -.->|5회 실패 시| DLQ2
    SQS3 -.->|5회 실패 시| DLQ3
    SQS4 -.->|실패 시| DLQ1
    SQS5 -.->|실패 시| DLQ1
```

## 서비스별 상세 설명

### 1. API Server (api-server)

- **역할**: HTTP API 게이트웨이
- **주요 기능**:
  - 사용자 인증 및 권한 관리
  - 출금 요청 검증 및 접수
  - 트랜잭션 상태 조회
  - 속도 제한 및 API 보안
- **기술 스택**: Express.js, TypeScript, JWT

### 2. Signing Service (signing-service)

- **역할**: 트랜잭션 서명 전문 서비스
- **주요 기능**:
  - 출금 요청 큐(tx-request-queue) 소비
  - 안전한 키 관리 (AWS Secrets Manager)
  - 트랜잭션 서명 (단일/배치)
  - 가스 가격 최적화 및 캐싱
  - nonce 관리 (Redis 기반)
  - 동적 배치 처리 결정
  - Multicall3를 통한 배치 최적화
  - 서명된 트랜잭션 큐잉
- **기술 스택**: Ethers.js, AWS Secrets Manager, Multicall3, Redis

### 3. Transaction Broadcaster (tx-broadcaster) - 개발 예정

- **역할**: 블록체인 트랜잭션 전송
- **주요 기능**:
  - 서명된 트랜잭션 큐(signed-tx-queue) 소비
  - 블록체인 네트워크로 브로드캐스트
  - 트랜잭션 상태 업데이트
  - NonceManager를 통한 주소별 순차 처리
  - nonce 충돌 감지 시 DLQ로 전송
  - 실패 시 재시도 로직
  - 모니터링 큐로 전달
- **기술 스택**: Ethers.js, 재시도 라이브러리

### 4. Transaction Monitor (tx-monitor) - 개발 예정

- **역할**: 트랜잭션 상태 모니터링
- **주요 기능**:
  - 모니터링 큐(tx-monitor-queue) 소비
  - 블록체인 상태 추적
  - 확인 수 모니터링 (12 confirmations)
  - 실패 감지 및 알림
  - 최종 상태 업데이트
- **기술 스택**: Ethers.js, WebSocket

### 5. Account Manager (account-manager) - 개발 예정

- **역할**: 계정 잔액 자동 관리
- **주요 기능**:
  - 서브 계정 잔액 모니터링
  - 임계값 기반 자동 충전
  - 메인 계정에서 서브 계정으로 잔액 전송
  - 배치 처리를 통한 가스비 절감
  - 메인 계정 잔액 부족 시 알림
  - ManagedAccount 및 BalanceTransfer 모델 관리
- **기술 스택**: Cron Jobs, Ethers.js, Redis

### 6. Recovery Service (recovery-service) - 개발 예정

- **역할**: DLQ 메시지 처리 및 트랜잭션 복구
- **주요 기능**:
  - DLQ 메시지 모니터링 및 분석
  - Nonce gap 감지 시 dummy transaction 생성
  - 네트워크 오류 시 재시도 스케줄링
  - 영구 실패 분류 및 알림
  - Dummy transaction은 sent_transactions 테이블에만 기록
- **기술 스택**: Ethers.js, AWS Secrets Manager (Just-in-time 키 로딩)

## 데이터 플로우

### DLQ 에러 처리 전략

#### 에러 분류 시스템

**영구 실패 (즉시 FAILED 처리):**

- `INSUFFICIENT_FUNDS`: 잔액 부족
- `INVALID_TRANSACTION`: 잘못된 트랜잭션 데이터
- `EXECUTION_REVERTED`: 스마트 컨트랙트 실행 실패
- `UNKNOWN`: 알 수 없는 에러

**재시도 가능한 에러 (DLQ로 전송):**

- `NETWORK`: 네트워크 연결 오류
- `TIMEOUT`: 응답 시간 초과
- `NONCE_TOO_LOW` / `NONCE_TOO_HIGH`: Nonce 충돌
- `GAS_PRICE_TOO_LOW`: 가스비 부족
- `REPLACEMENT_UNDERPRICED`: 트랜잭션 교체 시 가스비 부족
- `OUT_OF_GAS`: 가스 한도 초과

#### DLQ 메시지 구조

```typescript
interface DLQMessage<T = any> {
  originalMessage: T; // 원본 메시지
  error: {
    type: DLQErrorType; // 에러 타입 분류
    code?: string; // 에러 코드
    message: string; // 에러 메시지
    details?: Record<string, any>;
  };
  meta: {
    timestamp: string; // 실패 시각
    attemptCount: number; // 시도 횟수
  };
}
```

#### DLQ 설정

- **maxReceiveCount**: 5 (5회 실패 시 DLQ로 이동)
- **메시지 보존 기간**: 4일 (345600초)
- **Recovery Service**: DLQ 메시지를 분석하여 복구 전략 수립 (향후 구현)

### 출금 요청 플로우

```
1. 클라이언트 → API Server: 출금 요청 제출
2. API Server → MySQL: 요청 저장 (상태: PENDING)
3. API Server → tx-request-queue: 메시지 큐잉
4. Signing Service → tx-request-queue: 메시지 소비
5. Signing Service → MySQL: 상태 업데이트 (상태: SIGNING)
6. Signing Service: 트랜잭션 서명 (단일/배치)
7. Signing Service → signed-tx-queue: 서명된 트랜잭션 큐잉
8. TX Broadcaster → signed-tx-queue: 메시지 소비
9. TX Broadcaster → Polygon: 트랜잭션 브로드캐스트
10. TX Broadcaster → MySQL: 상태 업데이트 (상태: BROADCASTED)
11. TX Broadcaster → tx-monitor-queue: 모니터링 요청 큐잉
12. TX Monitor → tx-monitor-queue: 메시지 소비
13. TX Monitor → Polygon: 트랜잭션 확인 추적
14. TX Monitor → MySQL: 최종 상태 업데이트 (상태: CONFIRMED/FAILED/CANCELED)
```

### 배치 전송 플로우 (Multicall3) - 고속 처리

```
1. 다중 출금 요청 수집
2. Signing Service: 동적 배치 처리 결정
   - 배치 처리 활성화 여부 확인
   - 최소 배치 크기 검증 (기본: 5개)
   - 토큰별 그룹화 및 임계값 확인 (기본: 3개)
   - 처리량 증대 및 가스 절약률 계산
3. MulticallService: Multicall3 calldata 생성
4. TransactionSigner.signBatchTransaction() 실행
5. 단일 트랜잭션으로 다중 전송 처리
6. 핵심 이점:
   - 처리 속도: 수만 건의 트랜잭션을 빠르게 처리
   - 네트워크 혼잡 감소: 블록체인 트랜잭션 수 대폭 감소
   - 가스비 절감: 20-70% (부가적 이점)
```

### Recovery Service 플로우 - 개발 예정

```
1. DLQ 메시지 수신 및 분석
2. 에러 타입별 처리:
   - NONCE_TOO_HIGH:
     • Nonce gap 감지 (예: 현재 17, 시도한 19 → 18 누락)
     • Dummy transaction 생성 (from=to, value=0)
     • 직접 서명 및 블록체인 전송
     • sent_transactions 테이블에만 기록 (requestId=null, transactionSource='SYSTEM')
   - NETWORK: 지연 재시도
   - PERMANENT: 알림 발송
3. 복구 완료 후 원본 트랜잭션 재처리
```

### 계정 관리 플로우 (Account Manager) - 개발 예정

```
1. Account Manager → 서브 계정 잔액 조회 (주기적)
2. 임계값 이하 감지 시:
   - balance-check-queue: 잔액 확인 메시지 큐잉
   - 메인 계정 잔액 확인
   - 충전 금액 계산
3. balance-transfer-queue: 잔액 전송 요청 큐잉
4. Signing Service → balance-transfer-queue: 메시지 소비
5. Signing Service: 잔액 전송 트랜잭션 서명
6. TX Broadcaster → 블록체인: 잔액 전송 실행
7. Account Manager → MySQL: BalanceTransfer 기록 저장
8. 메인 계정 잔액 부족 시: 알림 발송
```

## 보안 아키텍처

### 네트워크 보안

- VPC 내 프라이빗 서브넷에 서비스 배치
- 보안 그룹을 통한 포트 제한
- API Gateway에만 퍼블릭 액세스 허용

### 애플리케이션 보안

- JWT 기반 인증
- API 키 관리
- 속도 제한 및 DDoS 보호
- 입력 검증 및 살균

### 데이터 보안

- 전송 중 암호화 (TLS)
- 저장 시 암호화 (AES-256-GCM)
- 키 관리 (AWS Secrets Manager)
- 개인키 이중 암호화
- 감사 로깅

### 트랜잭션 보안

- nonce 관리: Redis 원자적 연산
- 가스 가격 검증 및 상한선 설정
- 주소 체크섬 검증
- 트랜잭션 서명 검증

## 확장성 전략

### 수평 확장

- 각 서비스는 독립적으로 확장 가능
- Kubernetes HPA를 통한 자동 확장
- 큐 깊이 기반 워커 스케일링

### 성능 최적화

- Redis 캐싱 레이어 (nonce, 가스 가격, 잔액)
- 데이터베이스 읽기 복제본
- CDN을 통한 정적 자산 제공
- 동적 배치 처리 최적화 (고속 대량 처리)
  - 주요 목적: 수만 건의 트랜잭션 고속 처리
  - 토큰별 자동 그룹화로 효율성 극대화
  - 블록체인 네트워크 부하 대폭 감소
  - 처리 속도: 단일 처리 대비 10-100배 향상
  - 부가 이점: 가스비 20-70% 절감

### 지원 블록체인

- **Polygon**: Mainnet, Amoy Testnet (구현 완료)
- **Localhost**: Hardhat 개발 환경 (구현 완료)
- **Ethereum**: Mainnet, Sepolia (예정)
- **BSC**: Mainnet, Testnet (예정)
- **Arbitrum**: One, Nova (예정)

## 모니터링 및 관찰성

### 메트릭 수집

- Prometheus를 통한 메트릭 수집
- 커스텀 비즈니스 메트릭
- 시스템 리소스 모니터링

### 로깅

- 중앙집중식 로깅 (ELK Stack)
- 구조화된 JSON 로그
- 상관 ID를 통한 추적

### 추적

- 분산 추적 (Jaeger)
- 서비스 간 요청 추적
- 성능 병목 현상 식별

## 장애 복구

### 고가용성

- 다중 AZ 배포
- 로드 밸런서를 통한 트래픽 분산
- 상태 검사 및 자동 복구

### 백업 및 복구

- 자동화된 데이터베이스 백업
- 특정 시점 복구 지원
- 재해 복구 계획

### 서킷 브레이커

- 서비스 간 장애 전파 방지
- 자동 폴백 메커니즘
- 점진적 복구 전략
