import { Module } from '@nestjs/common';
import { FirebaseAdminProvider } from './firebase-admin';

@Module({
  providers: [FirebaseAdminProvider],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
