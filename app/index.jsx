import { StyleSheet, View, Text, Image } from "react-native";
import { Link } from 'expo-router';
import React from "react";
import logoLight from "../assets/BookLogo_lightMode.png";
import logoDark from "../assets/BookLogo_nightMode.png";
import settingsLight from "../assets/settingsLight.png";
import settingsDark from "../assets/settingsDark.png";
import { useTheme } from '../contexts/ThemeContext';
import { Colors } from '../constants/Colors';

const Home = () => {
    const { isDarkMode } = useTheme();

    const bookImage = isDarkMode ? logoDark : logoLight;
    const settingsImage = isDarkMode ? settingsDark : settingsLight;
    const theme = isDarkMode ? Colors.dark : Colors.light;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.settingsContainer}>
                <Link href="/settings">
                    <Image source={settingsImage} style={styles.settings} />
                </Link>
            </View>

            <View style={styles.content}>
                <Image source={bookImage} style={styles.logo} />
                <Text style={[styles.title, { color: theme.text }]}>Hello World</Text>
                <Text style={{ marginTop: 10, marginBottom: 30, color: theme.text }}>First App</Text>

                <Link href="/about" style={{ color: theme.text }}>About Page</Link>
                <Link href="/contact" style={{ color: theme.text }}>Contact Page</Link>
            </View>
        </View>
    );
};

export default Home;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    settingsContainer: {
        position: 'absolute',
        top: 5,
        right: 5,
        zIndex: 10,
    },
    settings: {
        width: 50,
        height: 50,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontWeight: 'bold',
        fontSize: 18,
    },
    logo: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 100,
        height: 100,
        resizeMode: 'cover',
    },
});
