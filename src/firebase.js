import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Werte aus der Firebase-Konsole: Projekteinstellungen -> "Meine Apps" -> Web-App.
// Diese Werte sind öffentlich sichtbar (stehen im Quelltext der Seite) -- das ist normal
// und kein Sicherheitsrisiko. Der eigentliche Schutz kommt aus firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyC_xozYOAmkXIRh9I9_xzACMPc2upnu0IQ',
  authDomain: 'kistenzettel.firebaseapp.com',
  projectId: 'kistenzettel',
  storageBucket: 'kistenzettel.firebasestorage.app',
  messagingSenderId: '1052388901582',
  appId: '1:1052388901582:web:12f450f0efe3222172c69f',
};

// Die einzige E-Mail-Adresse, die neue Etiketten erstellen und Listen bearbeiten darf.
// Muss mit der Adresse übereinstimmen, mit der du dich per Google anmeldest, und mit
// der Adresse in firestore.rules.
export const OWNER_EMAIL = 'neelamkumariyadav95@gmail.com';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
