# Redis 기반 토큰 관리 시스템 설치 및 실행 가이드

## 📋 개요

이 가이드는 채팅 웹앱에 Redis를 도입하여 토큰 관리 시스템을 구현하는 방법을 설명합니다.

## 🔧 주요 변경사항

### 토큰 관리 정책

- **Access Token**: 15분 유효기간
- **Refresh Token**: 7일 절대 유효기간 (Redis TTL: 30분)
- **자동 로그아웃**: 30분간 API 요청 없으면 Redis에서 삭제
- **토큰 재발급**: Access Token 만료시 자동으로 x-access-token 헤더에 새 토큰 전송

### 백엔드 변경사항

1. Redis 서비스 추가 (`RedisService`)
2. JWT Guard 개선 (자동 토큰 재발급)
3. AuthService 수정 (Redis 연동)
4. 토큰 만료시간 조정

### 프론트엔드 변경사항

1. axios 인터셉터 수정 (x-access-token 헤더 처리)
2. localStorage 기반 토큰 관리
3. 자동 토큰 갱신 로직

## 🚀 설치 및 실행

### 1. 백엔드 설정

#### 1.1 의존성 설치

```bash
cd chatty-backend
npm install ioredis
```

#### 1.2 환경변수 설정

`.env` 파일에 다음 설정을 추가하세요:

```env
# Redis 설정
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT 설정 (기존)
ADMIN_JWT_SECRET=your-secure-jwt-secret-key
ADMIN_JWT_REFRESH_SECRET=your-secure-refresh-secret-key
```

#### 1.3 Docker Compose 실행

```bash
# Redis 포함하여 전체 서비스 실행
docker-compose up -d

# 또는 Redis만 실행
docker-compose up -d redis
```

### 2. 프론트엔드 설정

#### 2.1 의존성 확인

프론트엔드는 추가 설치가 필요하지 않습니다.

#### 2.2 환경변수 설정

`.env` 파일에 다음 설정을 확인하세요:

```env
VITE_API_BASE_URL=http://localhost:3001
```

## 🔍 테스트 방법

### 1. 로그인 테스트

1. 프론트엔드에서 로그인
2. 브라우저 개발자 도구 > Application > Local Storage에서 `access_token` 확인
3. 네트워크 탭에서 응답 헤더에 `x-access-token` 확인

### 2. 토큰 자동 갱신 테스트

1. 로그인 후 15분 대기 (또는 토큰 만료 시간 조정)
2. API 요청 시 자동으로 새 토큰이 발급되는지 확인
3. 응답 헤더의 `x-access-token` 확인

### 3. 자동 로그아웃 테스트

1. 로그인 후 30분간 API 요청 없이 대기
2. Redis에서 Refresh Token이 삭제되는지 확인
3. API 요청 시 401 에러 발생 확인

## 🛠️ 개발 환경 설정

### Redis 로컬 설치 (선택사항)

```bash
# Windows (Chocolatey)
choco install redis

# macOS (Homebrew)
brew install redis

# Ubuntu/Debian
sudo apt-get install redis-server

# Redis 실행
redis-server
```

### Redis CLI 테스트

```bash
# Redis 연결
redis-cli

# 키 확인
KEYS refresh_token:*

# 특정 사용자의 Refresh Token 확인
GET refresh_token:1

# TTL 확인
TTL refresh_token:1
```

## 📊 모니터링

### Redis 모니터링

```bash
# Redis 모니터링 모드
redis-cli monitor

# 메모리 사용량 확인
redis-cli info memory

# 키 개수 확인
redis-cli dbsize
```

### 로그 확인

백엔드 콘솔에서 다음 로그를 확인할 수 있습니다:

- `Redis 연결 성공`
- `Refresh Token 저장 완료`
- `Refresh Token TTL 갱신 완료`
- `새로운 Access Token 저장됨`

## ⚠️ 주의사항

1. **보안**: 프로덕션 환경에서는 강력한 JWT 시크릿 키를 사용하세요
2. **Redis 보안**: Redis 서버에 적절한 인증 및 방화벽 설정을 적용하세요
3. **토큰 저장**: Access Token은 localStorage에 저장되므로 XSS 공격에 주의하세요
4. **HTTPS**: 프로덕션 환경에서는 반드시 HTTPS를 사용하세요

## 🔧 문제 해결

### Redis 연결 오류

```bash
# Redis 서비스 상태 확인
docker-compose ps redis

# Redis 로그 확인
docker-compose logs redis

# Redis 재시작
docker-compose restart redis
```

### 토큰 재발급 실패

1. Refresh Token이 Redis에 존재하는지 확인
2. Refresh Token의 TTL 확인
3. JWT 시크릿 키 일치 여부 확인

### 프론트엔드 토큰 저장 실패

1. 브라우저 개발자 도구에서 localStorage 확인
2. CORS 설정 확인
3. 네트워크 탭에서 응답 헤더 확인

## 📝 추가 개발 가이드

### 새로운 Guard 사용법

```typescript
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Controller('example')
@UseGuards(JwtAuthGuard)
export class ExampleController {
  // 이 컨트롤러의 모든 엔드포인트는 자동 토큰 갱신이 적용됩니다
}
```

### Redis 서비스 사용법

```typescript
import { RedisService } from './auth/redis.service';

// Refresh Token 저장
await redisService.setRefreshToken(userId, refreshToken, 1800);

// Refresh Token 조회
const token = await redisService.getRefreshToken(userId);

// TTL 갱신
await redisService.refreshTokenTTL(userId, 1800);
```
