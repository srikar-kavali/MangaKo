import { Slot } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { Amplify } from 'aws-amplify';
import awsconfig from '../src/aws-config-modular';

Amplify.configure(awsconfig);

export default function RootLayout() {
    console.log("✅ Amplify configured with:", awsconfig.Auth.Cognito);
    console.log("Mangapill API =", process.env.EXPO_PUBLIC_MANGAPILL_API);

    return (
        <AuthProvider>
            <Slot />
        </AuthProvider>
    );
}
