import { Stack, Slot } from 'expo-router';
import { ThemeProvider } from '../contexts/ThemeContext';
import {StyleSheet, Text, useColorScheme, View} from 'react-native';
import { Colors } from "../constants/Colors"


const InnerLayout = () => {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme] ?? Colors.light;

    return (
        <ThemeProvider>
            <Stack screenOptions={{
                headerStyle: { backgroundColor: 'theme.background' },
                headerTintColor: 'theme.title',
            }}>
                <Stack.Screen name="index" options={{title: 'Home'}}/>
                <Stack.Screen name="about" options={{title: 'About'}} />
                <Stack.Screen name="contact" options={{title: 'Contact'}} />
            </Stack>
        </ThemeProvider>
    )
}

const RootLayout = () => {
    return (
        <ThemeProvider>
            <InnerLayout />
        </ThemeProvider>
    );
};

export default RootLayout;