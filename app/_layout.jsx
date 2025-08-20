import { Slot } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { Amplify } from 'aws-amplify';
import awsconfig from '../src/aws-exports';

Amplify.configure(awsconfig);

export default function RootLayout() {
    console.log("WeebCentral API =", process.env.EXPO_PUBLIC_WEEBCENTRAL_API);

    return (
        <AuthProvider>
            <Slot />
        </AuthProvider>
    );
}
