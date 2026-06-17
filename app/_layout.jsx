import { Slot } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Amplify } from 'aws-amplify';
import awsconfig from '../src/aws-config-modular';

Amplify.configure(awsconfig);

const BG = '#0c0c10';

export default function RootLayout() {
    return (
        <View style={{ flex: 1, backgroundColor: BG }}>
            <SafeAreaProvider style={{ flex: 1, backgroundColor: BG }}>
                <StatusBar barStyle="light-content" backgroundColor={BG} />
                <Slot />
            </SafeAreaProvider>
        </View>
    );
}