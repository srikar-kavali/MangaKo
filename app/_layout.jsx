import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <StatusBar
                style="light"
                backgroundColor="#0c0c10"
                translucent={false}
            />
            <Slot />
        </SafeAreaProvider>
    );
}