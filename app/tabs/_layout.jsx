import { Tabs } from 'expo-router';
import { Amplify } from 'aws-amplify';
import awsconfig from '../../src/aws-exports';
import { Ionicons } from '@expo/vector-icons';

Amplify.configure(awsconfig);

export default function Layout() {
    return (
            <Tabs screenOptions={{ headerShown: false }}>
                <Tabs.Screen
                    name="home"
                    options={{
                        title: 'Home',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="home-outline" color={color} size={size} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="favorites"
                    options={{
                        title: 'My List',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="book-outline" color={color} size={size} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="categories"
                    options={{
                        title: 'Categories',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="grid-outline" color={color} size={size} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="activity"
                    options={{
                        title: 'Activity',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="time-outline" color={color} size={size} />
                        ),
                    }}
                />
            </Tabs>
    );
}