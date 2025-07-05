import { StyleSheet, View, Text, Switch } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import React from 'react';

const Settings = () => {
    const { isDarkMode, toggleTheme } = useTheme();
    const backgroundColor = isDarkMode ? '#2A203B' : '#FDFBEE';
    const textColor = isDarkMode ? '#FDFBEE' : '#2A203B';

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <Text style={[styles.title, { color: textColor }]}>Settings</Text>

            <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: "#FDFBEE", true: "#2A203B" }}
                thumbColor={isDarkMode ? "#f4f3f4" : "#222"}
            />

            <Text style={{ color: textColor, marginTop: 20 }}>
                {isDarkMode ? 'Dark Mode' : 'Light Mode'}
            </Text>
        </View>
    );
};

export default Settings;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FDFBEE',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
    }
})