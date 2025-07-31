# QA Checklist

이 문서는 Asset Withdrawal System의 QA 테스트 체크리스트입니다. 각 기능별로 테스트해야 할 시나리오와 검증 포인트를 정리합니다.

## 1. Signing Service 안정성 개선

### 1.1 Queue Recovery Service

#### 1.1.1 서버 시작 시 개별 트랜잭션 복구

**사전 조건 설정**
- signed-tx-queue에 개별 트랜잭션 메시지 추가
- 데이터베이스에 SIGNING 상태의 WithdrawalRequest 생성
- Redis 캐시 초기화

**테스트 단계**
1. Signing Service 종료
2. signed-tx-queue에 테스트 메시지 추가
3. Signing Service 재시작
4. 로그 모니터링

**검증 포인트**
- [ ] signed-tx-queue가 비어있는지 확인
- [ ] request-queue에 메시지가 추가되었는지 확인
- [ ] WithdrawalRequest 상태가 PENDING으로 변경되었는지 확인
- [ ] 로그에 "Queue recovery completed successfully" 메시지 확인
- [ ] 로그에 복구된 트랜잭션 ID 확인

**SignedTransaction 메시지 형식 검증**
- [ ] transactionType 필드가 'SINGLE' 또는 'BATCH' 값을 가지는지 확인
- [ ] requestId 필드가 존재하고 올바른 ID를 포함하는지 확인
- [ ] batchId 필드가 배치 트랜잭션에만 존재하는지 확인
- [ ] rawTransaction 필드명이 통일되어 사용되는지 확인
- [ ] maxFeePerGas와 maxPriorityFeePerGas 필드가 존재하는지 확인

#### 1.1.2 서버 시작 시 배치 트랜잭션 복구

**사전 조건**
- signed-tx-queue에 batchId가 있는 메시지 추가
- BatchTransaction (상태: SIGNED) 생성
- 관련 WithdrawalRequest들 (batchId 연결) 생성

**테스트 단계**
1. Signing Service 종료
2. 배치 트랜잭션 메시지를 signed-tx-queue에 추가
3. Signing Service 재시작
4. recoverBatchTransaction() 실행 확인

**검증 포인트**
- [ ] BatchTransaction 상태가 FAILED로 변경
- [ ] errorMessage: "Recovered during service restart" 확인
- [ ] 모든 WithdrawalRequest의 batchId가 null로 변경
- [ ] processingMode가 SINGLE로 변경
- [ ] 각 트랜잭션이 request-queue에 개별적으로 추가
- [ ] 로그에 "Successfully recovered batch {batchId} with {count} transactions" 확인

**배치 메시지 형식 검증**
- [ ] transactionType이 'BATCH'인지 확인
- [ ] requestId와 batchId가 동일한 값을 가지는지 확인
- [ ] 배치 분할 시 각 sub-batch도 원본 batchId를 유지하는지 확인

#### 1.1.3 Nonce 동기화 테스트

**시나리오 1: 블록체인 nonce > 캐시 nonce**
- [ ] Redis 캐시의 nonce를 블록체인보다 낮게 설정
- [ ] 서버 재시작
- [ ] 캐시가 블록체인 nonce로 업데이트되는지 확인
- [ ] 로그에 "Updated nonce cache to {nonce}" 메시지 확인

**시나리오 2: 블록체인 nonce < 캐시 nonce**
- [ ] Redis 캐시의 nonce를 블록체인보다 높게 설정
- [ ] 서버 재시작
- [ ] 캐시가 유지되는지 확인 (변경되지 않음)

**시나리오 3: 모든 체인/네트워크 동기화**
- [ ] polygon/mainnet nonce 동기화 확인
- [ ] polygon/testnet nonce 동기화 확인
- [ ] ethereum/mainnet nonce 동기화 확인
- [ ] ethereum/testnet nonce 동기화 확인
- [ ] bsc/mainnet nonce 동기화 확인
- [ ] bsc/testnet nonce 동기화 확인
- [ ] localhost/testnet nonce 동기화 확인

**시나리오 4: 개발 환경 nonce 동기화**
- [ ] NODE_ENV=development 설정 시 localhost 체인만 동기화되는지 확인
- [ ] 다른 체인(polygon, ethereum, bsc)은 동기화 건너뛰는지 확인
- [ ] 로그에 "Found 1 chain/network combinations" 확인 (localhost만)

### 1.2 오류 처리 흐름

#### 1.2.1 개별 트랜잭션 - 복구 가능한 오류

**테스트할 오류 타입**

**insufficient balance 오류**
- [ ] 잔액 부족 상황 시뮬레이션
- [ ] isRecoverableError()가 true 반환 확인
- [ ] WithdrawalRequest 상태가 PENDING으로 변경
- [ ] request-queue로 메시지 복구 확인
- [ ] signed-tx-queue에서 메시지 삭제 확인

**insufficient funds 오류**
- [ ] 가스비 부족 상황 시뮬레이션
- [ ] 동일한 복구 프로세스 확인

**insufficient allowance 오류**
- [ ] 토큰 승인 부족 상황 시뮬레이션
- [ ] 동일한 복구 프로세스 확인

**gas required exceeds 오류**
- [ ] 가스 한도 초과 상황 시뮬레이션
- [ ] 동일한 복구 프로세스 확인

**nonce too low 오류**
- [ ] 낮은 nonce로 트랜잭션 시도
- [ ] 동일한 복구 프로세스 확인

**nonce has already been used 오류**
- [ ] 중복 nonce 사용 시도
- [ ] 동일한 복구 프로세스 확인

**network error / timeout 오류**
- [ ] RPC 연결 차단으로 네트워크 오류 발생
- [ ] 타임아웃 상황 시뮬레이션
- [ ] 동일한 복구 프로세스 확인

#### 1.2.2 개별 트랜잭션 - 복구 불가능한 오류

**테스트할 오류**
- [ ] invalid address 오류 테스트
- [ ] contract execution failed 오류 테스트
- [ ] invalid signature 오류 테스트

**각 오류별 검증**
- [ ] WithdrawalRequest 상태가 FAILED로 변경
- [ ] errorMessage에 오류 내용 저장
- [ ] signed-tx-queue에서 메시지 삭제
- [ ] request-queue로 복구되지 않음 확인

#### 1.2.3 배치 트랜잭션 - 복구 가능한 오류

**사전 조건**
- 3개 이상의 트랜잭션으로 배치 생성
- 복구 가능한 오류 상황 설정 (예: insufficient balance)

**검증 포인트**
- [ ] BatchTransaction 상태가 FAILED로 변경
- [ ] errorMessage에 오류 내용 저장
- [ ] 로그에 "Recoverable error detected, recovering batch transactions" 확인
- [ ] 각 WithdrawalRequest가 개별적으로 request-queue로 복구
- [ ] queueRecoveryService.recoverTransactionOnError() 호출 확인
- [ ] 각 메시지가 signed-tx-queue에서 삭제

#### 1.2.4 배치 트랜잭션 - 복구 불가능한 오류

**검증 포인트**
- [ ] BatchTransaction 상태가 FAILED로 변경
- [ ] 모든 WithdrawalRequest 상태가 FAILED로 변경
- [ ] batchId가 null로 설정
- [ ] processingMode가 SINGLE로 변경
- [ ] errorMessage에 오류 내용 저장
- [ ] 큐에서 모든 메시지 삭제
- [ ] request-queue로 복구되지 않음 확인

### 1.3 Nonce 충돌 처리

#### 1.3.1 중복 Nonce 감지

**시나리오**
1. 첫 번째 트랜잭션 서명 (nonce: 100)
2. Redis 캐시 업데이트 지연 시뮬레이션
3. 두 번째 트랜잭션 서명 시도 (동일 nonce: 100)

**검증**
- [ ] isNonceDuplicate()가 true 반환
- [ ] 두 번째 트랜잭션이 거부됨
- [ ] 로그에 "Duplicate nonce detected" 메시지 확인
- [ ] 트랜잭션이 request-queue로 복구

#### 1.3.2 동시 트랜잭션 처리

**시나리오**
- 10개의 트랜잭션을 동시에 처리

**검증**
- [ ] 각 트랜잭션이 고유한 nonce 할당 (100, 101, 102...)
- [ ] Redis 캐시에 올바른 nonce 저장
- [ ] nonce 충돌 없이 모든 트랜잭션 성공

### 1.4 최대 전송량 검증

#### 1.4.1 단일 트랜잭션 최대 전송량

**설정**
- USDT 토큰의 maxTransferAmount: 10,000 설정

**테스트 케이스**
- [ ] 9,999 USDT 전송: 성공
- [ ] 10,000 USDT 전송: 성공
- [ ] 10,001 USDT 전송: 실패
- [ ] 오류 메시지: "Transfer amount exceeds maximum allowed" 확인

#### 1.4.2 배치 총합 최대 전송량

**시나리오**
- 각각 5,000 USDT인 3개 트랜잭션 (총 15,000 USDT)
- maxTransferAmount: 10,000 설정

**검증**
- [ ] validateBatchTransfers()에서 오류 반환
- [ ] 오류 메시지: "Total amount for USDT exceeds maximum" 확인
- [ ] 배치 생성 실패
- [ ] 트랜잭션들이 개별 처리로 전환

### 1.5 체인 설정

#### 1.5.1 지원 체인/네트워크 테스트

**각 체인/네트워크 조합별 테스트**

**polygon/mainnet**
- [ ] ChainProviderFactory.getProvider() 성공
- [ ] 올바른 chainId (137) 확인
- [ ] RPC URL 연결 확인
- [ ] nonce 동기화 성공
- [ ] 트랜잭션 서명 성공

**polygon/testnet (Amoy)**
- [ ] ChainProviderFactory.getProvider() 성공
- [ ] 올바른 chainId (80002) 확인
- [ ] RPC URL 연결 확인
- [ ] nonce 동기화 성공
- [ ] 트랜잭션 서명 성공

**ethereum/mainnet**
- [ ] 동일한 검증 수행 (chainId: 1)

**ethereum/testnet (Sepolia)**
- [ ] 동일한 검증 수행 (chainId: 11155111)

**bsc/mainnet**
- [ ] 동일한 검증 수행 (chainId: 56)

**bsc/testnet**
- [ ] 동일한 검증 수행 (chainId: 97)

**localhost/testnet**
- [ ] Hardhat 노드 연결 확인
- [ ] 동일한 검증 수행 (chainId: 31337)

### 1.6 통합 시나리오

#### 1.6.1 서비스 재시작 시나리오

**단계별 테스트**
1. [ ] 5개 트랜잭션을 signing-service에서 처리 중
2. [ ] 3개는 서명 완료, 2개는 처리 중인 상태에서 서비스 강제 종료 (kill -9)
3. [ ] signed-tx-queue 확인 (3개 메시지 존재)
4. [ ] 서비스 재시작
5. [ ] recoverQueuesOnStartup() 자동 실행 확인
6. [ ] 3개 트랜잭션이 request-queue로 복구
7. [ ] 2개 트랜잭션도 새로 처리 시작
8. [ ] 모든 5개 트랜잭션 최종 완료 확인

#### 1.6.2 네트워크 장애 시나리오

**단계별 테스트**
1. [ ] iptables로 RPC 엔드포인트 차단
2. [ ] 트랜잭션 처리 시도
3. [ ] "network error" 또는 "ETIMEDOUT" 오류 발생 확인
4. [ ] 복구 가능한 오류로 처리되는지 확인
5. [ ] request-queue로 복구 확인
6. [ ] iptables 규칙 제거 (네트워크 복구)
7. [ ] 자동으로 트랜잭션 재처리 성공 확인

#### 1.6.3 동시성 테스트

**멀티 인스턴스 시나리오**
1. [ ] Signing Service 인스턴스 3개 동시 실행
2. [ ] 각 인스턴스의 instanceId 고유성 확인
3. [ ] 100개 트랜잭션 동시 처리
4. [ ] processingInstanceId로 충돌 방지 확인
5. [ ] 동일 트랜잭션을 여러 인스턴스가 처리하지 않는지 확인
6. [ ] nonce 충돌 없이 처리되는지 검증
7. [ ] 모든 트랜잭션 성공적으로 완료

### 1.7 로깅 및 모니터링 검증

#### 1.7.1 감사 로그 확인

**주요 동작별 로그**
- [ ] SIGN_TRANSACTION_START 로그 존재
- [ ] SIGN_TRANSACTION_COMPLETE 로그 존재
- [ ] SIGN_TRANSACTION_FAILED 로그 (오류 시)
- [ ] BATCH_SIGN_START 로그 존재
- [ ] BATCH_SIGN_COMPLETE 로그 존재
- [ ] Queue recovery 관련 로그 존재

**로그 내용 검증**
- [ ] transactionId/batchId 포함
- [ ] 타임스탬프 정확성
- [ ] 오류 발생 시 상세 스택 트레이스
- [ ] 복구 동작 추적 가능

#### 1.7.2 메트릭 검증

- [ ] processedCount가 실제 처리된 트랜잭션 수와 일치
- [ ] errorCount가 실제 오류 수와 일치
- [ ] 복구된 트랜잭션이 processedCount에 포함
- [ ] lastProcessedAt 타임스탬프 업데이트 확인

## 2. SignedTransaction 메시지 형식 통합

### 2.1 메시지 형식 일관성 검증

#### 2.1.1 signing-service 메시지 생성

**개별 트랜잭션 메시지 검증**
- [ ] transactionType 필드가 'SINGLE' 값으로 설정되는지 확인
- [ ] requestId 필드에 transactionId가 올바르게 매핑되는지 확인
- [ ] batchId 필드가 undefined 또는 존재하지 않는지 확인
- [ ] rawTransaction 필드명이 사용되는지 확인 (signedTx가 아님)
- [ ] hash, nonce, gasLimit 등 모든 필수 필드가 포함되는지 확인

**배치 트랜잭션 메시지 검증**
- [ ] transactionType 필드가 'BATCH' 값으로 설정되는지 확인
- [ ] requestId 필드에 batchId가 설정되는지 확인
- [ ] batchId 필드에도 동일한 batchId가 설정되는지 확인
- [ ] 배치 분할 시 원본 batchId가 유지되는지 확인

#### 2.1.2 tx-processor 메시지 소비

**메시지 처리 검증**
- [ ] requestId 필드를 사용하여 트랜잭션을 식별하는지 확인
- [ ] rawTransaction 필드를 사용하여 트랜잭션을 브로드캐스트하는지 확인
- [ ] withdrawalId 필드 참조가 없는지 확인
- [ ] signedTx 필드 참조가 없는지 확인

#### 2.1.3 queue-recovery 메시지 처리

**메시지 타입 구분 검증**
- [ ] transactionType 필드로 SINGLE/BATCH를 구분하는지 확인
- [ ] SINGLE 타입은 requestId를 사용하여 복구하는지 확인
- [ ] BATCH 타입은 batchId를 사용하여 복구하는지 확인
- [ ] 잘못된 메시지 형식에 대한 오류 로깅이 작동하는지 확인

### 2.2 메시지 형식 마이그레이션

#### 2.2.1 기존 메시지 호환성

**레거시 메시지 처리**
- [ ] 이전 형식의 메시지가 큐에 있을 때 오류가 발생하는지 확인
- [ ] 필요시 마이그레이션 스크립트 작성 및 테스트
- [ ] 메시지 형식 버전 관리 필요성 검토

## 3. Docker 환경 설정

### 3.1 .dockerignore 검증

#### 3.1.1 환경 변수 파일 제외

**검증 단계**
- [ ] .dockerignore에 `.env` 패턴이 포함되어 있는지 확인
- [ ] .dockerignore에 `**/.env` 패턴이 포함되어 있는지 확인
- [ ] Docker 이미지 빌드 후 .env 파일이 포함되지 않았는지 확인
- [ ] 하위 디렉토리의 .env 파일도 제외되는지 확인

**Docker 이미지 검증**
```bash
# 이미지 내용 확인
docker run --rm docker-signing-service:latest ls -la /app/apps/signing-service/
```
- [ ] .env 파일이 목록에 없는지 확인

### 3.2 체인 설정 파일 로딩

#### 3.2.1 chains.config.json 동적 로딩

**검증 포인트**
- [ ] signing-service가 chains.config.json을 올바르게 로드하는지 확인
- [ ] 하드코딩된 체인 이름이 없는지 확인
- [ ] 체인 설정 변경 시 재빌드 없이 반영되는지 확인

## 4. [향후 추가될 기능 영역]

---

## 테스트 환경 설정

### 필수 구성 요소
- Docker Compose (MySQL, LocalStack, Redis)
- 테스트용 지갑 주소 및 Private Key
- 각 체인별 테스트넷 토큰
- SQS Admin UI (http://localhost:3999)

### 테스트 데이터 준비
```bash
# 데이터베이스 초기화
npm run db:reset
npm run db:seed

# LocalStack 큐 초기화
./docker/scripts/init-localstack.sh

# Redis 초기화
docker exec -it redis-container redis-cli FLUSHALL
```

### 유용한 명령어
```bash
# SQS 메시지 확인
aws --endpoint-url=http://localhost:4566 sqs receive-message --queue-url http://localhost:4566/000000000000/signed-tx-queue

# Redis nonce 확인
docker exec -it redis-container redis-cli GET "nonce:polygon:mainnet:0x..."

# 로그 모니터링
tail -f logs/signing-service.log
```