import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { GoogleAuth } from 'google-auth-library';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class PushNotificationService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0; // Unix timestamp in ms

  constructor(private readonly httpService: HttpService) {}

  // 토큰이 없거나 만료되었으면 새 토큰을 요청하여 캐싱합니다.
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiry - 60000 > now) {
      return this.accessToken;
    }
    // 서비스 계정 JSON 파일 경로와 스코프를 지정합니다.
    const auth = new GoogleAuth({
      keyFile: 'chatty-5ad6f-firebase-adminsdk-fbsvc-bb0d9043e8.json', // 서비스 계정 키 파일 경로를 지정하세요.
      scopes: 'https://www.googleapis.com/auth/firebase.messaging',
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    this.accessToken = accessTokenResponse.token!;
    // 만약 만료 시간이 제공되지 않으면, 55분 후로 설정합니다.
    if (client.credentials.expiry_date) {
      this.tokenExpiry = client.credentials.expiry_date;
    } else {
      this.tokenExpiry = now + 55 * 60 * 1000;
    }
    Logger.log(`Obtained new access token, expires at ${this.tokenExpiry}`);
    return this.accessToken;
  }

  // FCM HTTP v1 API를 이용해 푸시 알림 전송
  async sendPushNotification(fcmToken: string, title: string, body: string) {
    const accessToken = await this.getAccessToken();

    const message = {
      message: {
        token: fcmToken,
        notification: { title, body },
      },
    };

    // 환경 변수 FCM_PROJECT_ID에 실제 프로젝트 ID를 입력하세요.
    const projectId = process.env.FCM_PROJECT_ID;
    if (!projectId) {
      throw new Error('FCM_PROJECT_ID is not set in environment variables');
    }
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    try {
      const response = await lastValueFrom(
        this.httpService.post(url, message, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );
      Logger.log('Push notification sent successfully', response.data);
    } catch (error) {
      Logger.error('Failed to send push notification', error);
      throw error;
    }
  }
}
