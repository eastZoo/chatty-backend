import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

export const FirebaseAdminProvider = {
  provide: 'FIREBASE_ADMIN',
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    if (admin.apps.length === 0) {
      const raw = configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');

      if (!raw) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not defined');
      }

      const serviceAccount = JSON.parse(raw);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    return admin;
  },
};
