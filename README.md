# Blockchain Withdrawal System Monorepo

TypeScript 기반의 블록체인 출금 시스템 모노레포입니다.

## 📁 프로젝트 구조

```
├── apps/                   # 애플리케이션들
├── libs/                  # 공유 라이브러리들
│   └── shared/            # 공통 라이브러리
├── tools/                 # 빌드 도구 및 스크립트
├── nx.json               # Nx 설정
├── package.json          # 루트 패키지 설정
├── tsconfig.base.json    # TypeScript 기본 설정
└── README.md            # 이 파일
```

## 🚀 시작하기

### 1. 의존성 설치
```bash
yarn install
```

### 2. 새 패키지 생성
```bash
# 라이브러리 생성
nx g @nx/js:library my-package --directory=libs/my-package

# 애플리케이션 생성
nx g @nx/js:application my-app --directory=apps/my-app
```

### 3. 개발 서버 실행
```bash
# 모든 앱 실행
yarn dev

# 특정 앱 실행
nx serve my-app
```

## 📋 사용 가능한 명령어

```bash
# 빌드
yarn build                # 모든 프로젝트 빌드
nx build my-package       # 특정 패키지 빌드

# 테스트
yarn test                 # 모든 테스트 실행
nx test my-package        # 특정 패키지 테스트

# 린팅
yarn lint                 # 모든 프로젝트 린팅
yarn lint:fix            # 린팅 문제 자동 수정

# 포맷팅
yarn format              # Prettier로 코드 포맷팅

# 의존성 검사
yarn depcheck            # 사용하지 않는 의존성 검사

# 정리
yarn clean               # 빌드 아티팩트 및 캐시 정리
```

## 🏗️ 아키텍처

### 패키지 구조
- **`libs/`**: 재사용 가능한 라이브러리들
  - 각 패키지는 독립적으로 빌드 및 테스트 가능
  - 타입스크립트 path mapping을 통한 모듈 참조 (`@libs/*`)

### 앱 구조
- **`apps/`**: 실행 가능한 애플리케이션들
  - API 서버, 웹 클라이언트 등

## 🔧 개발 가이드

### 새 패키지 추가
1. `nx g @nx/js:library` 명령어로 패키지 생성
2. `tsconfig.base.json`의 paths에 자동으로 추가됨
3. 다른 패키지에서 `@libs/my-package`로 import 가능

### 코드 스타일
- ESLint + Prettier를 사용한 코드 스타일 강제
- 커밋 전 자동 린팅 및 포맷팅 (husky + lint-staged)
- TypeScript strict 모드 활성화

### 테스팅
- Jest를 사용한 단위 테스트
- 각 패키지별 독립적인 테스트 실행
- 코드 커버리지 리포트 생성

## 🛠️ 도구 및 기술

- **Nx**: 모노레포 관리 및 빌드 시스템
- **TypeScript**: 타입 안전성
- **Jest**: 테스트 프레임워크
- **ESLint**: 코드 품질 검사
- **Prettier**: 코드 포맷팅
- **Husky**: Git hooks
- **Yarn**: 패키지 매니저

## 📝 컨벤션

### 패키지 네이밍
- kebab-case 사용
- 명확하고 설명적인 이름

### 브랜치 네이밍
- `feature/기능명`
- `fix/버그명`
- `refactor/리팩터링명`

### 커밋 메시지
- [Conventional Commits](https://www.conventionalcommits.org/) 규칙 준수
- `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:` 등 사용