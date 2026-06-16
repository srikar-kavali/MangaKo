import { Slot } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Amplify } from 'aws-amplify';
import awsconfig from '../src/aws-config-modular';

Amplify.configure(awsconfig);

export default function RootLayout() {
    console.log("✅ Amplify configured with:", awsconfig.Auth.Cognito);
    console.log("Mangapill API =", process.env.EXPO_PUBLIC_MANGAPILL_API);

    return (
        <SafeAreaProvider style={{ flex: 1, backgroundColor: '#0c0c10' }}>
            <StatusBar barStyle="light-content" backgroundColor="#0c0c10" />
            <Slot />
        </SafeAreaProvider>
    );
}
