# Shared Package

## 개요

Shared 패키지는 모든 서비스에서 공통으로 사용되는 타입, 유틸리티, 검증자, 큐 인터페이스 등을 제공하는 공유 라이브러리입니다. 코드 중복을 방지하고 일관성을 유지하기 위한 핵심 패키지입니다.

## 주요 구성 요소

### 1. 타입 정의 (Types)
- 공통 데이터 모델 인터페이스
- API 요청/응답 타입
- 이벤트 및 메시지 타입
- 열거형 및 상수

### 2. 유틸리티 함수 (Utils)
- 암호화/복호화 헬퍼
- 날짜/시간 처리
- 금액 변환 및 포맷팅
- 로깅 유틸리티

### 3. 검증자 (Validators)
- 입력 데이터 검증
- 비즈니스 규칙 검증
- 스키마 검증 (Joi/Yup)

### 4. 큐 인터페이스 (Queue)
- SQS 추상화 레이어
- 메시지 타입 정의
- 큐 헬퍼 함수

### 5. 에러 클래스 (Errors)
- 커스텀 에러 클래스
- 에러 코드 정의
- 에러 핸들링 유틸리티

### 6. 체인 설정 (Chain Config)
- 다중 체인 지원: Polygon, Ethereum, BSC, localhost (Hardhat)
- ChainProvider를 통한 체인별 설정 관리
- API 요청에서 체인/네트워크 명시적 지정 필요 (기본값 없음)

## 프로젝트 구조

```
packages/shared/
├── src/
│   ├── types/           # TypeScript 타입 정의
│   │   ├── withdrawal.ts
│   │   ├── transaction.ts
│   │   ├── user.ts
│   │   └── index.ts
│   ├── utils/           # 유틸리티 함수
│   │   ├── crypto.ts
│   │   ├── datetime.ts
│   │   ├── amount.ts
│   │   └── logger.ts
│   ├── validators/      # 검증 로직
│   │   ├── withdrawal.validator.ts
│   │   ├── auth.validator.ts
│   │   └── common.validator.ts
│   ├── queue/          # 큐 관련 코드
│   │   ├── interfaces.ts
│   │   ├── sqs.client.ts
│   │   └── messages.ts
│   ├── errors/         # 에러 정의
│   │   ├── base.error.ts
│   │   ├── business.errors.ts
│   │   └── system.errors.ts
│   └── constants/      # 상수 정의
│       ├── status.ts
│       └── limits.ts
├── tests/             # 테스트 파일
└── README.md         # 이 파일
```

## 주요 인터페이스

### 출금 관련 타입
```typescript
export interface IWithdrawalRequest {
  id: string;
  userId: string;
  amount: bigint;
  tokenAddress: string;
  destinationAddress: string;
  status: WithdrawalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SIGNING = 'SIGNING',
  BROADCASTED = 'BROADCASTED',
  CONFIRMING = 'CONFIRMING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED'
}
```

### 큐 메시지 타입
```typescript
export interface IQueueMessage<T> {
  id: string;
  type: MessageType;
  payload: T;
  timestamp: Date;
  retryCount: number;
}

export interface IWithdrawalMessage {
  withdrawalId: string;
  userId: string;
  amount: string;
  tokenAddress: string;
  destinationAddress: string;
}
```

### 검증자 예시
```typescript
export const withdrawalValidator = {
  create: Joi.object({
    amount: Joi.string()
      .pattern(/^\d+(\.\d{1,18})?$/)
      .required(),
    tokenAddress: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{40}$/)
      .required(),
    destinationAddress: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{40}$/)
      .required()
  })
};
```

## 유틸리티 함수

### 금액 처리
```typescript
// Wei 변환
export const toWei = (amount: string, decimals: number = 18): bigint => {
  return parseUnits(amount, decimals);
};

// 포맷팅
export const formatAmount = (amount: bigint, decimals: number = 18): string => {
  return formatUnits(amount, decimals);
};
```

### 암호화
```typescript
// 해시 생성
export const generateHash = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

// HMAC 서명
export const generateHmac = (data: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};
```

### 로깅
```typescript
export const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});
```

## 에러 클래스

### 기본 에러
```typescript
export class BaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

### 비즈니스 에러
```typescript
export class InsufficientBalanceError extends BaseError {
  constructor(required: string, available: string) {
    super(
      'INSUFFICIENT_BALANCE',
      `잔액이 부족합니다. 필요: ${required}, 사용 가능: ${available}`,
      400
    );
  }
}

export class WithdrawalLimitExceededError extends BaseError {
  constructor(limit: string) {
    super(
      'WITHDRAWAL_LIMIT_EXCEEDED',
      `일일 출금 한도를 초과했습니다. 한도: ${limit}`,
      400
    );
  }
}
```

## 사용 예시

### 타입 임포트
```typescript
import { 
  IWithdrawalRequest, 
  WithdrawalStatus,
  IQueueMessage 
} from '@mustb/shared/types';
```

### 유틸리티 사용
```typescript
import { toWei, formatAmount, logger } from '@mustb/shared/utils';

const amountInWei = toWei('100.5', 18);
logger.info('Amount converted', { wei: amountInWei.toString() });
```

### 검증자 사용
```typescript
import { withdrawalValidator } from '@mustb/shared/validators';

const validation = withdrawalValidator.create.validate(requestBody);
if (validation.error) {
  throw new ValidationError(validation.error.details);
}
```

### 에러 처리
```typescript
import { InsufficientBalanceError } from '@mustb/shared/errors';

if (balance < amount) {
  throw new InsufficientBalanceError(
    formatAmount(amount),
    formatAmount(balance)
  );
}
```

## 테스트

```bash
# 단위 테스트 실행
npm run test:shared

# 테스트 커버리지
npm run test:shared:coverage
```

## 버전 관리

이 패키지는 시맨틱 버저닝을 따릅니다:
- **Major**: 하위 호환성이 깨지는 변경
- **Minor**: 하위 호환성이 유지되는 기능 추가
- **Patch**: 버그 수정

## 기여 가이드

1. 새로운 타입이나 유틸리티 추가 시 적절한 디렉토리에 배치
2. 모든 퍼블릭 함수와 타입에 JSDoc 주석 추가
3. 단위 테스트 작성 필수
4. 기존 API와의 호환성 유지

## 관련 문서

- [전체 아키텍처](../../ARCHITECTURE.md)
- [API 서버](../../apps/api-server/README.md)
- [데이터베이스 패키지](../database/README.md)