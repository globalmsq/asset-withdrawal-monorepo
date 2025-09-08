# Docker 구성 가이드

## 개요

이 디렉토리는 Asset Withdrawal System을 로컬 환경에서 Docker를 사용하여 실행하기 위한 구성 파일들을 포함합니다. `docker-compose.yaml` 파일은 개발 및 통합 테스트에 필요한 모든 서비스를 정의합니다.

## 파일 구조

- `docker-compose.yaml`: 개발 및 통합 테스트 환경용 Docker Compose 설정 파일입니다.
- `dockerfile.packages`: 모노레포의 각 서비스(`api-server`, `signing-service` 등)를 빌드하기 위한 멀티 스테이지 Dockerfile입니다.
- `init.sql`: MySQL 데이터베이스 초기화를 위한 스크립트입니다.
- `scripts/init-localstack.sh`: LocalStack(AWS 에뮬레이터) 초기화를 위한 스크립트입니다. SQS 큐와 Secrets Manager 시크릿을 생성합니다.
- `scripts/init-hardhat.sh`: Hardhat 로컬 블록체인에 테스트 컨트랙트를 배포하는 스크립트입니다.

## 로컬 실행 방법

### 1. 전체 개발 환경 실행

```bash
# 프로젝트 루트 디렉토리에서 실행
docker-compose -f docker/docker-compose.yaml up -d

# 변경사항이 있을 경우 빌드와 함께 실행
docker-compose -f docker/docker-compose.yaml up --build -d
```

### 2. 개발 환경 (MySQL만 실행)

```bash
# 로컬에서 API 서버를 직접 실행하고 싶은 경우
docker-compose -f docker/docker-compose.dev.yaml up -d
```

### 3. 로그 확인

```bash
# 모든 서비스 로그 확인
docker-compose -f docker/docker-compose.yaml logs -f

# 특정 서비스 로그 확인
docker-compose -f docker/docker-compose.yaml logs -f api-server
docker-compose -f docker/docker-compose.yaml logs -f mysql
```

### 4. 서비스 상태 확인

```bash
# 컨테이너 상태 확인
docker-compose -f docker/docker-compose.yaml ps

# 헬스 체크 확인
docker-compose -f docker/docker-compose.yaml exec api-server curl http://localhost:8080/health
```

### 5. 중지 및 정리

```bash
# 서비스 중지
docker-compose -f docker/docker-compose.yaml down

# 볼륨까지 삭제
docker-compose -f docker/docker-compose.yaml down -v

# 이미지까지 삭제
docker-compose -f docker/docker-compose.yaml down --rmi all
```

## 접속 정보

### API 서버

- URL: http://localhost:8080
- API 문서: http://localhost:8080/api-docs
- 헬스 체크: http://localhost:8080/health

### MySQL 데이터베이스

- Host: localhost
- Port: 3306
- Database: withdrawal_system
- Username: root
- Password: pass

## 환경 변수 설정

필요한 경우 docker-compose.yaml 파일에서 다음 환경 변수를 수정할 수 있습니다:

```yaml
environment:
  - NODE_ENV=production
  - PORT=8080
  - MYSQL_HOST=mysql
  - MYSQL_PORT=3306
  - MYSQL_DATABASE=withdrawal_system
  - MYSQL_USER=root
  - MYSQL_PASSWORD=pass
```

## 개발 팁

1. **데이터베이스 초기화**: 처음 실행 시 `init.sql` 스크립트가 자동으로 실행되어 테이블을 생성합니다.

2. **볼륨 관리**: MySQL 데이터는 `mysql_data` 볼륨에 저장되므로 컨테이너를 재시작해도 데이터가 유지됩니다.

3. **로컬 개발**: API 서버를 로컬에서 직접 실행하고 싶다면 `docker-compose.dev.yaml`을 사용하여 MySQL만 실행하세요.

4. **포트 변경**: 포트 충돌이 발생하면 docker-compose.yaml 파일에서 포트 매핑을 변경하세요.

## 문제 해결

### 포트 충돌

```bash
# 포트 사용 중인 프로세스 확인
lsof -i :8080
lsof -i :3306

# 포트 변경 예시
ports:
  - "8081:8080"  # 외부 포트를 8081로 변경
```

### 데이터베이스 연결 오류

```bash
# MySQL 컨테이너 상태 확인
docker-compose -f docker/docker-compose.yaml logs mysql

# 데이터베이스 직접 접속 테스트
docker-compose -f docker/docker-compose.yaml exec mysql mysql -u root -p
```

### 빌드 오류

```bash
# 이미지 재빌드
docker-compose -f docker/docker-compose.yaml build --no-cache

# 캐시 정리
docker system prune -a
```
