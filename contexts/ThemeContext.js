import react, {createContext, useState, useContext, useEffect} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Appearance} from "react-native";

const ThemeContext = createContext();

export const ThemeProvider = ({children}) => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const STORAGE_KEY = 'theme_preference';

    // Load theme from AsyncStorage or system preference
    useEffect(() => {
        const loadTheme = async () => {
            const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
            if (storedValue !== null) {
                setIsDarkMode(storedValue === 'dark');
            } else {
                const colorScheme = Appearance.getColorScheme();
                setIsDarkMode(colorScheme === 'dark');
            }
        };
        loadTheme();
    }, []);

    const toggleTheme = async () => {
        const newTheme = !isDarkMode;
        setIsDarkMode(newTheme);
        await AsyncStorage.setItem(STORAGE_KEY, newTheme ? 'dark' : 'light');
    };

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);


