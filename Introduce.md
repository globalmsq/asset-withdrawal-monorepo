# Blockchain Withdrawal System Architecture

## 1. 개요

이 문서는 AWS 환경에서 운영될 블록체인 출금 시스템의 아키텍처를 정의한다. 사용자의 자산을 안전하게 보호하고, 출금 요청을 신속하고 안정적으로 처리하며, 대규모 트래픽에도 확장 가능하도록 설계하는 것을 목표로 한다.

## 2. 아키텍처 구성도 및 데이터 흐름

- **요청 수신**: 클라이언트의 출금 요청은 `TX Request API`를 통해 접수되어 `TX Request Queue`에 적재된다.
- **검증 및 서명**: `Validation & Signing TX` 컴포넌트가 큐에서 요청을 순차적으로 처리한다. `Redis`에서 사용자 잔액을 확인하고 `Secret Manager`에서 프라이빗 키를 로드하여 트랜잭션에 서명한다. 유효하지 않은 요청(예: 잔액 부족, 주소 오류)은 `Invalid Dead Letter Queue`로 이동시킨다.
- **트랜잭션 전송**: 서명이 완료된 트랜잭션은 `Signed TX Queue`로 전달된다. `Transaction Senders` 컴포넌트는 해당 큐의 트랜잭션을 가져와 블록체인 네트워크에 전파한다. 전송 실패 시, 트랜잭션은 `TX Dead Letter Queue`로 격리된다.
- **상태 추적 및 모니터링**: `Cron` 기반의 `Transaction Status Check` 및 `Verify Sent Transactions` 작업이 `Transaction Tracker`와 연동하여 블록체인 상의 트랜잭션 상태를 지속적으로 추적하고, 최종 결과를 데이터베이스에 업데이트한다.
- **관리자 기능**: `Admin Front`는 `Admin API` 및 `TX Status API`를 통해 시스템의 현재 상태와 트랜잭션 처리 현황을 조회하고 관리하는 기능을 제공한다.
- **모니터링 및 알림**: `Prometheus`, `Grafana`, `LogStash`가 시스템 전반의 지표와 로그를 수집 및 시각화하며, `Alert Manager`는 사전에 정의된 임계치 초과 시 운영팀에 알림을 전송한다.

```mermaid
graph TD
    %% Request Flow
    MSQ[MSQ/User] --> TX_Request_API[TX Request API]
    TX_Request_API --> TX_Request_Queue[(TX Request Queue)]

    %% Processing Core
    TX_Request_Queue --> Validation_Signing_TX{Validation & Signing TX}

    subgraph "Dependencies"
        direction LR
        Secret_Manager[Secret Manager] --> Validation_Signing_TX
        Redis[Redis] --> Validation_Signing_TX
    end

    Validation_Signing_TX --> Invalid_DLQ[(Invalid DLQ)]
    Validation_Signing_TX --> Signed_TX_Queue[(Signed TX Queue)]

    %% Broadcast Flow
    Signed_TX_Queue --> Transaction_Senders{Transaction Senders}
    Transaction_Senders --> Blockchain([Blockchain])
    Transaction_Senders --> TX_DLQ[(TX DLQ)]
    TX_DLQ --> Handle_Error[Handle Error]

    %% Tracking & DB Update
    subgraph "Tracking & Database"
        direction TB
        Transaction_Tracker{Transaction Tracker}
        DB[(Database)]
        Cron_Jobs[Cron: Status Check] --> Transaction_Tracker
        Transaction_Tracker -- Reads --> Blockchain
        Transaction_Tracker -- Updates --> DB
        Validation_Signing_TX -- Writes --> DB
    end

    %% Admin & Monitoring (Side Panels)
    subgraph "Admin & Status"
        direction TB
        Admin_Front[Admin Front] --> Admin_API[Admin API]
        Admin_Front --> TX_Status_API[TX Status API]
        Admin_API --> DB
        TX_Status_API --> DB
    end

    subgraph "Monitoring & Alerting"
        direction TB
        Prometheus
        Grafana
        LogStash
        Alert_Manager
    end

```

[https://www.figma.com/board/HvHzZrTw4E2pgQH7DBAju4/Blockchain-Withdrawal-System?node-id=0-1&t=hocJvQMkWSxOoMDD-1](https://www.figma.com/board/HvHzZrTw4E2pgQH7DBAju4/Blockchain-Withdrawal-System?node-id=0-1&t=hocJvQMkWSxOoMDD-1)

## 3. 주요 구성 요소

### 3.1. API 및 관리자 인터페이스

- **TX Request API**: 외부로부터 출금 요청을 수신하는 게이트웨이이다. 요청의 기본 형식을 검증한 후 `TX Request Queue`로 전달한다.
- **TX Status API / Admin API**: 관리자 페이지에서 트랜잭션의 상태를 조회하거나 시스템 설정을 변경하는 데 사용되는 API이다.
- **Admin Front**: 개발자 및 운영자가 출금 내역, 오류 트랜잭션 등을 조회하고 필요한 조치를 취할 수 있는 웹 기반 관리자 화면이다.

### 3.2. 메시지 큐 (Amazon SQS)

- **TX Request Queue**: 처리 대기 중인 출금 요청이 저장되는 기본 큐이다.
- **Signed TX Queue**: 서명은 완료되었으나, 블록체인 전송 대기 중인 트랜잭션이 보관되는 큐이다.
- **Invalid Dead Letter Queue**: 유효성 검사 및 서명 단계에서 실패한 요청을 격리하는 DLQ(Dead-Letter Queue)이다.
- **TX Dead Letter Queue**: 블록체인 전송에 실패한 트랜잭션을 격리하는 DLQ이다.

### 3.3. 출금 처리 워커(Worker)

- **Validation & Signing TX**: `TX Request Queue`의 요청을 처리하는 핵심 워커이다. `Redis`에서 잔액을 확인하고, `Secret Manager`에서 키를 가져와 트랜잭션 서명까지의 과정을 수행한다.
- **Transaction Senders**: `Signed TX Queue`에서 서명된 트랜잭션을 가져와 블록체인 네트워크에 전송하는 역할을 담당한다.

### 3.4. 데이터 저장소

- **Database (DB)**: 트랜잭션 상태, 마지막 스캔 블록 번호 등 영구 보존이 필요한 모든 데이터를 저장한다. (예: Amazon RDS, Aurora)
- **Redis**: 사용자 잔액, 전송에 필요한 토큰 정보(ABI 등)와 같이 빠른 조회가 필요한 데이터를 캐싱하여 응답 속도를 향상시키고 데이터베이스의 부하를 경감시킨다. (예: Amazon ElastiCache)

### 3.5. 상태 추적 및 스케줄러

- **Transaction Tracker**: 블록체인에 전송된 트랜잭션의 상태(컨펌 여부 등)를 추적하는 컴포넌트이다.
- **Cron Jobs**: Kubernetes CronJob 또는 AWS EventBridge를 통해 주기적으로 실행되는 작업이다. 장기 미처리 트랜잭션을 감시하거나 전송된 트랜잭션의 최종 상태를 확인하여 DB를 업데이트한다.

### 3.6. 모니터링 및 알림 시스템

- **Prometheus / Grafana / LogStash / Alert Manager**: 시스템의 핵심 지표와 로그를 수집, 시각화하며, 이상 징후 발생 시 `Alert Manager`가 운영팀에 알림을 전송하는 중요한 구성 요소이다.

## 4. 출금 프로세스 흐름

1. **요청 접수**: `TX Request API`가 출금 요청을 수신하여 `TX Request Queue`에 메시지를 전송한다.
2. **검증 및 서명**: `Validation & Signing TX` 워커가 큐에서 메시지를 가져와 처리한다.
   - `Redis`에서 출금 가능 잔액을 확인한다.
   - `AWS Secrets Manager`에서 프라이빗 키를 안전하게 로드한다.
   - 트랜잭션에 서명 후, `Signed TX Queue`로 전송한다.
   - 오류 발생 시(잔액 부족 등), 해당 요청은 `Invalid Dead Letter Queue`로 전송된다.
3. **블록체인 전송**: `Transaction Senders` 워커가 `Signed TX Queue`에서 서명된 트랜잭션을 가져온다.
   - 트랜잭션을 블록체인 노드를 통해 네트워크에 전파(Broadcast)한다.
   - 전송 실패 시(Nonce 오류, 가스비 부족 등), 트랜잭션은 `TX Dead Letter Queue`로 전송된다.
4. **상태 추적**: `Transaction Tracker`와 주기적인 `Cron Jobs`는 DB에 '처리중'으로 기록된 트랜잭션들을 블록체인에서 조회한다.
5. **완료 처리**: 트랜잭션이 블록에 성공적으로 포함되고 충분한 수의 컨펌을 획득하면, DB의 상태를 `COMPLETED`로 업데이트함으로써 프로세스가 완료된다.
6. **오류 처리**: `Invalid/TX Dead Letter Queue`에 적재된 메시지는 정의된 `Handle Error` 로직에 따라 처리된다. (예: 운영자 알림, 수동 재처리 인터페이스 제공)

## 5. 주요 기술 스택 및 AWS 기반 고려사항

- **Compute**: 각 API와 워커는 컨테이너화(Docker)하여 Amazon EKS(Elastic Kubernetes Service)에서 운영된다.
- **Secrets Management**: 프라이빗 키는 **AWS Secrets Manager**에 저장하고, IAM Role 기반으로 `Validation & Signing TX` 워커만 접근하도록 권한을 최소화해야 한다.
- **Queuing**: **Amazon SQS**를 사용하여 표준 큐와 DLQ를 구성한다. 큐의 메시지 수에 따라 워커(Pod) 수를 자동으로 조절(예: KEDA)하여 탄력적으로 요청을 처리한다.
- **Monitoring**: **Amazon Managed Service for Prometheus/Grafana**와 **Amazon CloudWatch**를 연동하여 강력한 모니터링 및 알림 파이프라인을 구축한다.

## 6. 개선

- **Dead Letter Queue 처리 자동화**: `Handle Error` 부분은 시스템 안정성에 매우 중요하다. DLQ에 메시지가 수신될 경우, CloudWatch Alarm을 통해 즉시 운영팀에 알림을 전송하고, Admin Front에서 해당 내역을 조회하여 재처리하거나 폐기할 수 있는 기능을 구현해야 한다.
- **네트워크 보안 강화**: AWS VPC 내에서 Security Group과 NACL을 통해 각 컴포넌트 간 통신을 엄격히 제어해야 한다. 예를 들어, `Validation & Signing` 워커는 `Secrets Manager`, `Redis`, `DB` 등 필수적인 서비스에만 접근할 수 있도록 네트워크 규칙을 설정해야 한다.
- **Blockchain Endpoint 이중화 및 Fail-over**: 단일 블록체인 엔드포인트(노드)에 대한 의존성은 시스템 전체의 장애 지점(SPOF)이 될 수 있다. 여러 프로바이더(Infura, Alchemy 등)의 엔드포인트 또는 자체 운영 노드를 포함하여 다수의 엔드포인트를 구성하고, 주기적인 상태 확인(Health Check)을 통해 특정 엔드포인트에 문제가 발생했을 때 자동으로 다른 엔드포인트로 전환하는 Fail-over 로직을 구현하여 서비스 연속성을 확보해야 한다.

## 7. 구현된 기술 스택 (Phase 1 완료)

### 7.1 현재 구현 상태

- **ORM**: Prisma (MySQL)
- **API Framework**: Express.js + TypeScript
- **Queue**: In-memory (POC) → AWS SQS (Production 예정)
- **Testing**: Jest + Supertest
- **Documentation**: OpenAPI 3.0 (예정)
- **Container**: Docker + Docker Compose

### 7.2 예정된 기술 스택

- **Container Orchestration**: Amazon EKS
- **CI/CD**: GitHub Actions / Jenkins
- **Infrastructure as Code**: Terraform
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack (Elasticsearch, LogStash, Kibana)
- **APM**: AWS X-Ray 또는 Datadog

## 8. 개발 및 배포 프로세스

### 8.1 브랜치 전략

- **main**: 프로덕션 브랜치
- **develop**: 개발 통합 브랜치
- **feature/\***: 기능 개발 브랜치
- **hotfix/\***: 긴급 수정 브랜치

### 8.2 코드 리뷰 프로세스

- PR 생성 시 자동 테스트 실행
- 최소 1명 이상의 리뷰어 승인 필요
- 보안 관련 변경은 보안 담당자 추가 리뷰
- 코드 커버리지 80% 이상 유지

### 8.3 배포 파이프라인

- **개발**: feature 브랜치 → develop → 개발 환경 자동 배포
- **스테이징**: develop → staging 브랜치 → 스테이징 환경
- **프로덕션**: staging → main → Blue-Green 배포
- **롤백**: 이전 버전으로 즉시 전환 가능

### 8.4 환경별 설정

- **Local**: Docker Compose + LocalStack
- **Dev**: EKS Dev Cluster + RDS Dev
- **Staging**: Production과 동일한 구성 (축소 버전)
- **Production**: Multi-AZ EKS + Aurora MySQL

## 9. 운영 목표 및 SLA

### 9.1 가용성

- **목표**: 99.9% uptime (월간 다운타임 < 43분)
- **계획된 유지보수**: 월 1회, 새벽 2-4시 (KST)
- **무중단 배포**: Blue-Green 배포로 다운타임 제로

### 9.2 성능

- **API 응답시간**:
  - P50 < 100ms
  - P95 < 200ms
  - P99 < 500ms
- **트랜잭션 처리**:
  - 요청 접수 → 블록체인 전송: < 30초
  - 전체 완료 (컨펌 포함): < 5분 (네트워크 상황에 따라 변동)
- **동시 처리 용량**: 10,000 TPS

### 9.3 복구 목표

- **RTO (Recovery Time Objective)**: 30분
- **RPO (Recovery Point Objective)**: 5분
- **백업 주기**:
  - 데이터베이스: 실시간 복제 + 일일 스냅샷
  - 설정 및 코드: Git 기반 버전 관리

### 9.4 보안 목표

- **취약점 스캔**: 주간 자동 스캔
- **침투 테스트**: 분기별 1회
- **보안 패치**: Critical - 24시간 내, High - 1주일 내
- **접근 권한 검토**: 월별 권한 감사

## 10. 장애 대응 시나리오

### 10.1 장애 등급 정의

- **P1 (Critical)**: 전체 서비스 중단, 자산 손실 위험
- **P2 (Major)**: 주요 기능 장애, 성능 심각 저하
- **P3 (Minor)**: 일부 기능 장애, 우회 가능
- **P4 (Low)**: 사용성 문제, 긴급하지 않음

### 10.2 대응 절차

1. **감지**: 모니터링 알람 또는 사용자 신고
2. **분류**: 장애 등급 판단 및 담당자 지정
3. **대응**:
   - P1: 15분 내 대응 시작, 전 팀원 소집
   - P2: 30분 내 대응 시작
   - P3-P4: 업무 시간 내 처리
4. **복구**: 장애 원인 제거 및 서비스 정상화
5. **사후 분석**: RCA(Root Cause Analysis) 작성 및 재발 방지

### 10.3 비상 연락망

- On-call 엔지니어 로테이션 (주간 단위)
- PagerDuty를 통한 알람 에스컬레이션
- 장애 대응 War Room (Slack 채널)
