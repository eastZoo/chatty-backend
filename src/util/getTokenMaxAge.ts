// Access Token: 15분 (일반적인 값)
export const AdminAccessTokenMaxAge = 15 * 60 * 1000; // 15분

// Refresh Token: 7일 (일반적인 값)
export const AdminRefreshTokenMaxAge = 7 * 24 * 60 * 60 * 1000; // 7일

// Redis TTL: 30분 (API 요청 없으면 자동 로그아웃)
export const RedisRefreshTokenTTL = 30 * 60; // 30분 (초 단위)
