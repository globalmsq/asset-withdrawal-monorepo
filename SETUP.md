# 설정 가이드

## 사전 요구사항

### 필수 소프트웨어

- Node.js 18.x 이상
- pnpm 8.x 이상
- Docker & Docker Compose
- Git
- MySQL 8.0 (Docker로 실행 가능)

### 권장 개발 도구

- Visual Studio Code
- Postman 또는 Insomnia (API 테스트)
- MySQL Workbench 또는 DBeaver

## 프로젝트 설정

### 1. 저장소 클론

```bash
git clone https://github.com/your-org/asset-withdrawal-monorepo.git
cd asset-withdrawal-monorepo
```

### 2. 의존성 설치

```bash
pnpm install
```

### 3. 환경 변수 설정

루트 디렉토리에 `.env` 파일 생성:

```bash
# 데이터베이스
DATABASE_URL="mysql://root:password@localhost:3306/withdrawal_system"

# JWT 설정
JWT_SECRET="your-super-secret-key"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_EXPIRES_IN="7d"

# 큐 설정
QUEUE_TYPE=localstack
AWS_ENDPOINT=http://localhost:4566
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# 블록체인 설정
# RPC_URL과 CHAIN_ID는 오버라이드용 (선택사항)
RPC_URL=http://localhost:8545  # Hardhat 로컬 개발용
CHAIN_ID=31337  # Hardhat 체인 ID

# 서명 서비스 설정
SIGNING_SERVICE_PRIVATE_KEY_SECRET=signing-service/private-key
SIGNING_SERVICE_LOG_LEVEL=info

# 서비스 포트
API_SERVER_PORT=3000
SIGNING_SERVICE_PORT=3002
TX_BROADCASTER_PORT=3004  # 개발 예정
TX_MONITOR_PORT=3003  # 개발 예정
ACCOUNT_MANAGER_PORT=3005  # 개발 예정

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# 배치 처리 설정
ENABLE_BATCH_PROCESSING=true
BATCH_THRESHOLD=5
MIN_GAS_SAVINGS_PERCENT=20

# Account Manager 설정 (개발 예정)
BALANCE_CHECK_INTERVAL=300000  # 5분 (밀리초)
MIN_BALANCE_THRESHOLD=0.1      # ETH
BATCH_TRANSFER_ENABLED=true
MAX_BATCH_SIZE=10

# 로깅
LOG_LEVEL=debug
```

### 4. Docker 서비스 시작

```bash
# 개발 환경 전체 시작
docker-compose -f docker/docker-compose.yaml up -d

# 또는 개별 서비스만 시작
docker-compose -f docker/docker-compose.yaml up -d mysql redis localstack
```

### 5. LocalStack 초기화

```bash
# SQS 큐 생성
./docker/scripts/init-localstack.sh
```

이 스크립트는 다음 큐들을 생성합니다:

- `tx-request-queue`: 출금 요청 큐
- `signed-tx-queue`: 서명된 트랜잭션 큐
- `tx-monitor-queue`: 모니터링 대상 트랜잭션 큐
- `balance-check-queue`: 잔액 확인 요청 큐 (Account Manager용)
- `balance-transfer-queue`: 잔액 전송 요청 큐 (Account Manager용)
- 각 큐의 DLQ (Dead Letter Queue)

### 6. 데이터베이스 마이그레이션

```bash
# 마이그레이션 실행
pnpm run db:migrate

# 시드 데이터 추가 (개발용)
pnpm run db:seed
```

## 개발 서버 실행

### 전체 서비스 실행

```bash
pnpm run dev
```

### 개별 서비스 실행

```bash
# API 서버만
nx serve api-server

# 서명 서비스만
nx serve signing-service

# TX Broadcaster (개발 예정)
nx serve tx-broadcaster

# TX Monitor (개발 예정)
nx serve tx-monitor

# Account Manager (개발 예정)
nx serve account-manager

# Admin UI (React 앱, 개발 예정)
nx serve admin-ui
```

## 빌드 및 프로덕션 실행

### 빌드

```bash
pnpm run build
```

### 프로덕션 실행

```bash
pnpm run serve
```

## 테스트

### 단위 테스트

```bash
pnpm test
```

### E2E 테스트

```bash
pnpm run test:e2e
```

### 테스트 커버리지

```bash
pnpm run test:coverage
```

## 유용한 명령어

### 코드 품질

```bash
# 린트 실행
pnpm run lint

# 린트 자동 수정
pnpm run lint:fix

# 타입 체크
pnpm run typecheck
```

### 데이터베이스

```bash
# Prisma Studio 실행 (GUI)
pnpm run db:studio

# 스키마 동기화
pnpm run db:push

# 마이그레이션 생성
pnpm run db:migrate:create
```

### 로그 확인

```bash
# Docker 로그
docker-compose -f docker/docker-compose.yaml logs -f [service-name]

# 애플리케이션 로그
tail -f logs/app.log
```

## 개발 팁

### LocalStack 사용

- LocalStack 대시보드: http://localhost:4566
- SQS 관리 UI: http://localhost:3999

### Hardhat 로컬 블록체인

- Hardhat 노드 시작: `npx hardhat node --hostname 0.0.0.0`
- 로컬 체인 ID: 31337
- RPC URL: http://localhost:8545
- 테스트 계정은 Hardhat이 자동 생성

### 지원 블록체인

- **Polygon**: Mainnet, Amoy Testnet
- **Ethereum**: Mainnet, Sepolia (예정)
- **BSC**: Mainnet, Testnet (예정)
- **Localhost**: Hardhat 개발 환경

### 디버깅

1. VS Code의 디버그 설정 사용
2. Chrome DevTools를 사용한 Node.js 디버깅
3. 환경 변수 `DEBUG=*` 설정으로 상세 로그 확인

### API 테스트

- Swagger UI: http://localhost:3000/api-docs
- 포스트맨 컬렉션: `/docs/postman/collection.json`

### 배치 처리 테스트

- 최소 5개 이상의 출금 요청 생성
- 동일 토큰으로 요청하면 자동으로 배치 처리
- Multicall3 컨트랙트 주소: `0xcA11bde05977b3631167028862bE2a173976CA11`

## 문제 해결

### 포트 충돌

```bash
# 사용 중인 포트 확인
lsof -i :3000

# 프로세스 종료
kill -9 [PID]
```

### Docker 문제

```bash
# 컨테이너 재시작
docker-compose -f docker/docker-compose.yaml restart

# 전체 리셋
docker-compose -f docker/docker-compose.yaml down -v
docker-compose -f docker/docker-compose.yaml up -d
```

### 데이터베이스 연결 문제

1. Docker 컨테이너 실행 확인
2. 포트 바인딩 확인 (3306)
3. 환경 변수 확인
4. 네트워크 설정 확인

## 프로덕션 배포 준비

### 환경 변수 체크리스트

- [ ] 프로덕션 데이터베이스 URL
- [ ] 강력한 JWT 시크릿
- [ ] AWS 실제 자격 증명
- [ ] 프로덕션 RPC URL
- [ ] 실제 개인 키 (안전하게 관리)

### 보안 체크리스트

- [ ] HTTPS 설정
- [ ] 방화벽 규칙 설정
- [ ] 민감한 정보 환경 변수로 관리
- [ ] 로그에 민감한 정보 노출 방지
- [ ] API 속도 제한 설정
