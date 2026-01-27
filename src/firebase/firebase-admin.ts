import * as admin from 'firebase-admin';
import * as serviceAccount from '../config/chatty-39651-firebase-adminsdk-fbsvc-e39b95e308.json';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

export default admin;
