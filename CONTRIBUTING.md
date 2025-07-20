# 기여 가이드라인

## 환영합니다! 👋

자산 출금 시스템 프로젝트에 기여해 주셔서 감사합니다. 이 문서는 프로젝트에 기여하는 방법에 대한 가이드라인을 제공합니다.

## 행동 강령

- 모든 참여자를 존중하고 포용적인 환경을 유지합니다
- 건설적인 피드백을 제공하고 받아들입니다
- 프로젝트와 커뮤니티의 이익을 우선시합니다

## 기여 방법

### 1. 이슈 보고

버그를 발견하거나 새로운 기능을 제안하고 싶다면:

1. 기존 이슈를 먼저 확인하세요
2. 새 이슈를 생성할 때는 적절한 템플릿을 사용하세요
3. 명확하고 상세한 설명을 제공하세요

#### 버그 보고 시 포함 사항
- 버그에 대한 명확한 설명
- 재현 단계
- 예상 동작과 실제 동작
- 환경 정보 (OS, Node.js 버전 등)
- 가능하다면 스크린샷이나 로그

#### 기능 제안 시 포함 사항
- 기능의 목적과 이점
- 사용 사례
- 가능한 구현 방법
- 대안 고려 사항

### 2. Pull Request 제출

#### 준비 작업
1. 저장소를 포크합니다
2. 새 브랜치를 생성합니다: `git checkout -b feature/your-feature-name`
3. 변경사항을 작성합니다
4. 테스트를 작성하고 실행합니다
5. 커밋 메시지 규칙을 따릅니다

#### 커밋 메시지 규칙
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 스타일 변경 (포맷팅, 세미콜론 등)
- `refactor`: 리팩토링
- `test`: 테스트 추가 또는 수정
- `chore`: 빌드 프로세스 또는 도구 변경

**예시:**
```
feat(api): 일괄 출금 엔드포인트 추가

- POST /api/v1/withdrawals/batch 엔드포인트 구현
- CSV 파일 업로드 지원
- 최대 1000건 동시 처리 가능

Closes #123
```

#### PR 체크리스트
- [ ] 코드가 프로젝트 스타일 가이드를 따릅니다
- [ ] 모든 테스트가 통과합니다
- [ ] 새로운 기능에 대한 테스트를 추가했습니다
- [ ] 문서를 업데이트했습니다
- [ ] 변경 로그를 업데이트했습니다

### 3. 코드 스타일

#### TypeScript
- 엄격한 타입 사용 (`strict: true`)
- 인터페이스는 `I` 접두사 사용 (예: `IUser`)
- 열거형은 PascalCase 사용
- 함수는 명확한 반환 타입 명시

```typescript
// 좋은 예
interface IWithdrawalRequest {
  id: string;
  amount: bigint;
  status: WithdrawalStatus;
}

async function processWithdrawal(request: IWithdrawalRequest): Promise<void> {
  // 구현
}

// 나쁜 예
interface withdrawalRequest {
  id: any;
  amount: number;
}

async function processWithdrawal(request) {
  // 구현
}
```

#### 디렉토리 구조
```
src/
├── controllers/    # 요청 핸들러
├── services/       # 비즈니스 로직
├── repositories/   # 데이터 액세스
├── middlewares/    # Express 미들웨어
├── utils/          # 유틸리티 함수
├── types/          # 타입 정의
└── validators/     # 입력 검증
```

### 4. 테스트 작성

#### 단위 테스트
```typescript
describe('WithdrawalService', () => {
  describe('createWithdrawal', () => {
    it('유효한 요청으로 출금을 생성해야 함', async () => {
      // Given
      const request = { amount: 100n, userId: '123' };
      
      // When
      const result = await service.createWithdrawal(request);
      
      // Then
      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
    });

    it('잔액 부족 시 오류를 발생시켜야 함', async () => {
      // 테스트 구현
    });
  });
});
```

#### 통합 테스트
```typescript
describe('POST /api/v1/withdrawals', () => {
  it('인증된 사용자가 출금을 요청할 수 있어야 함', async () => {
    const response = await request(app)
      .post('/api/v1/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '100', tokenAddress: '0x...' });
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });
});
```

### 5. 문서화

#### 코드 주석
- 복잡한 로직에는 설명 추가
- JSDoc을 사용한 함수 문서화
- TODO와 FIXME 사용 시 이슈 번호 포함

```typescript
/**
 * 출금 요청을 처리합니다.
 * @param request - 출금 요청 정보
 * @returns 처리된 출금 정보
 * @throws {InsufficientBalanceError} 잔액이 부족한 경우
 */
async function processWithdrawal(request: IWithdrawalRequest): Promise<IWithdrawal> {
  // TODO(#456): 배치 처리 최적화 필요
  
  // 복잡한 가스 계산 로직
  // 1. 현재 네트워크 가스 가격 조회
  // 2. 트랜잭션 복잡도에 따른 가스 한도 계산
  // 3. 10% 버퍼 추가
  const gasPrice = await calculateOptimalGasPrice();
}
```

#### API 문서
- OpenAPI 3.0 스펙 유지
- 모든 엔드포인트에 대한 예시 포함
- 오류 응답 문서화

### 6. 보안 고려사항

- 민감한 정보를 코드에 하드코딩하지 마세요
- 모든 사용자 입력을 검증하세요
- SQL 인젝션 방지를 위해 Prisma 사용
- 적절한 인증 및 권한 검사 구현

### 7. 성능 고려사항

- N+1 쿼리 문제 방지
- 적절한 인덱스 사용
- 대용량 데이터는 페이지네이션 구현
- 캐싱 전략 고려

## 리뷰 프로세스

1. 모든 PR은 최소 1명의 리뷰어 승인 필요
2. CI 파이프라인의 모든 검사 통과 필수
3. 충돌 해결 후 재검토 필요
4. 큰 변경사항은 여러 작은 PR로 분할 권장

## 릴리스 프로세스

1. `develop` 브랜치에서 개발
2. `main` 브랜치로 병합 시 자동 배포
3. 시맨틱 버저닝 사용 (MAJOR.MINOR.PATCH)
4. 변경 로그 자동 생성

## 도움 받기

- 슬랙 채널: #asset-withdrawal-dev
- 이메일: dev@example.com
- 주간 개발 미팅: 매주 수요일 오후 2시

## 라이선스

이 프로젝트에 기여함으로써 귀하의 기여가 프로젝트 라이선스에 따라 라이선스된다는 데 동의합니다.