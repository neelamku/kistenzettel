import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Werte aus der Firebase-Konsole: Projekteinstellungen -> "Meine Apps" -> Web-App.
// Diese Werte sind öffentlich sichtbar (stehen im Quelltext der Seite) -- das ist normal
// und kein Sicherheitsrisiko. Der eigentliche Schutz kommt aus firestore.rules.
export const firebaseConfig = {
  apiKey: 'DEIN_API_KEY',
  authDomain: 'DEIN_PROJEKT.firebaseapp.com',
  projectId: 'DEIN_PROJEKT',
  storageBucket: 'DEIN_PROJEKT.appspot.com',
  messagingSenderId: 'DEINE_SENDER_ID',
  appId: 'DEINE_APP_ID',
};

// Die einzige E-Mail-Adresse, die neue Etiketten erstellen und Listen bearbeiten darf.
// Muss mit der Adresse übereinstimmen, mit der du dich per Google anmeldest, und mit
// der Adresse in firestore.rules.
export const OWNER_EMAIL = 'neelamkumariyadav95@gmail.com';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
