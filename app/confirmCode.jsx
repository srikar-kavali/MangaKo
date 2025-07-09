import React, { useState } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { confirmSignUp, resendSignUpCode } from "../auth/cognito";
import { router } from 'expo-router';

export default function ConfirmCode() {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const { tempEmail } = useAuth();

    const handleSubmit = async () => {
        if (!code.trim()) return;
        setLoading(true);
        const { success, error } = await confirmSignUp(tempEmail, code.trim());
        setLoading(false);

        if (success) {
            router.replace('/login');
        } else {
            Alert.alert('Error', error);
        }
    };

    const handleResendCode = async () => {
        if (!tempEmail) return;
        setLoading(true);
        console.log("Attempting to resend code to:", tempEmail);
        const { success, error } = await resendSignUpCode(tempEmail);
        setLoading(false);

        if (success) {
            Alert.alert('Code Resent', 'Check your email for a new verification code.');
        } else {
            Alert.alert('Resend Failed', error);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Enter Verification Code</Text>

            <TextInput
                style={styles.input}
                placeholder="Code"
                value={code}
                onChangeText={setCode}
                keyboardType="numeric"
            />

            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Confirming...' : 'Confirm'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleResendCode}>
                <Text style={styles.resendLink}>Resend Code</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 100, // Pulls content upward
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    input: {
        width: '100%',
        height: 50,
        backgroundColor: '#f1f1f1',
        borderRadius: 8,
        paddingHorizontal: 10,
        marginBottom: 20,
        fontSize: 16,
    },
    button: {
        width: '100%',
        height: 50,
        backgroundColor: '#1E90FF',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 15,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
    },
    resendLink: {
        color: '#1E90FF',
        fontSize: 16,
        textDecorationLine: 'underline',
    },
});
