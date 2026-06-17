import { Tabs } from 'expo-router';
import { Amplify } from 'aws-amplify';
import awsconfig from '../../src/aws-exports';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';

Amplify.configure(awsconfig);

const ACCENT     = '#7c6af5';
const ACCENT_DIM = 'rgba(124,106,245,0.14)';
const TAB_BG     = '#0c0c10'; // Unified to match the screen base background
const BORDER     = 'rgba(255,255,255,0.06)';
const INACTIVE   = '#666570'; // Brightened slightly for dark mode contrast

// Checks if device is iOS native OR running in mobile Safari/Web wrapper
const isIOSDevice = Platform.OS === 'ios' || (Platform.OS === 'web' && /iPhone|iPad|iPod/i.test(navigator.userAgent));

export default function Layout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: TAB_BG,
                    borderTopWidth: 1,
                    borderTopColor: BORDER,
                    // --- FIXED TAB BAR PROFILE ---
                    height: isIOSDevice ? 74 : 64,
                    paddingBottom: isIOSDevice ? 20 : 10,
                    paddingTop: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: 0.5,
                    shadowRadius: 16,
                    elevation: 20,
                },
                tabBarActiveTintColor: ACCENT,
                tabBarInactiveTintColor: INACTIVE,
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '600',
                    letterSpacing: 0.2,
                    marginTop: 2,
                },
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color, focused }) => (
                        <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={20} />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="favorites"
                options={{
                    title: 'My List',
                    tabBarIcon: ({ color, focused }) => (
                        <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                            <Ionicons name={focused ? 'book' : 'book-outline'} color={color} size={20} />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="categories"
                options={{
                    title: 'Categories',
                    tabBarIcon: ({ color, focused }) => (
                        <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                            <Ionicons name={focused ? 'grid' : 'grid-outline'} color={color} size={20} />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="activity"
                options={{
                    title: 'Activity',
                    tabBarIcon: ({ color, focused }) => (
                        <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                            <Ionicons name={focused ? 'time' : 'time-outline'} color={color} size={20} />
                        </View>
                    ),
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    iconWrap: {
        width: 38,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    iconWrapActive: {
        backgroundColor: ACCENT_DIM,
    },
});