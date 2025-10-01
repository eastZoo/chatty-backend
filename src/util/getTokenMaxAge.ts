// Access Token: 1분 (테스트용)
export const AdminAccessTokenMaxAge = 1 * 60 * 1000; // 1분

// Refresh Token: 7일
export const AdminRefreshTokenMaxAge = 7 * 24 * 60 * 60 * 1000; // 7일

// Redis TTL: 30분 (API 요청 없으면 자동 로그아웃)
export const RedisRefreshTokenTTL = 30 * 60; // 30분 (초 단위)
