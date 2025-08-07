import React, {createContext, useContext, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage'
import {getCurrentUser} from "aws-amplify/auth";

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [tempEmail, setTempEmailState] = useState(null); // stores email temporarily for confirmation

    useEffect(() => {
        const loadEmail = async () => {
            try{
                const savedEmail = await AsyncStorage.getItem('tempEmail');
                if (savedEmail) setTempEmailState(savedEmail);
            } catch (error) {
                console.error('Failed to load tempEmail', error);
            }
        };

        loadEmail();
    }, []);

    const setTempEmail = async (email) => {
        try {
            await AsyncStorage.setItem('tempEmail', email);
            setTempEmailState(email);
        } catch (error) {
            console.error('Failed to save tempEmail', error);
        }
    };

    return (
        <AuthContext.Provider value={{ tempEmail, setTempEmail }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
