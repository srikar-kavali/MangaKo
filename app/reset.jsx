import React, { useState } from 'react';
import {Text, View, StyleSheet, TouchableOpacity, TextInput, Alert, Image} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {confirmResetPassword} from "../auth/cognito";
import { router } from 'expo-router';
import {Formik} from 'formik';
import * as yup from 'yup';
import {Ionicons} from "@expo/vector-icons";
import { useLocalSearchParams } from 'expo-router';
import dragonCircle from "../assets/dragonCircle.png";

const resetValidationSchema = yup.object().shape({
    newPassword: yup
        .string()
        .min(8, ({ min }) => `Password must be at least ${min} characters`)
        .required('Password is required'),
    confirmPassword: yup
        .string()
        .oneOf([yup.ref('newPassword'), null], 'Passwords must match')
        .required('Please confirm your password'),
});

export default function Reset() {
    const { email: userEmail } = useLocalSearchParams();
    return (
        <View style={styles.container}>
            <Image style={styles.logo} source={dragonCircle}/>
            <Text style={styles.title}>Reset Password</Text>
            <Formik
                validationSchema={resetValidationSchema}
                initialValues={{code: '', newPassword: '', confirmPassword: ''}}
                onSubmit={async (values, { setSubmitting }) => {
                    const { success, error } = await confirmResetPassword(
                        userEmail, // likely passed via navigation or stored in context
                        values.code,
                        values.newPassword
                    );
                    if (success) {
                        Alert.alert('Password Reset', 'You can now log in with your new password.');
                        router.replace('/login');
                    } else {
                        Alert.alert('Error', error);
                    }

                    setSubmitting(false);
                }}
            >
                {({ values, handleChange, handleSubmit, touched, errors }) => (
                    <>
                        <TextInput
                            style={[styles.inputContainer, {marginBottom: 20}]}
                            placeholder="Code"
                            value={values.code}
                            onChangeText={handleChange('code')}
                        />

                        <TextInput
                            style={[styles.inputContainer, {marginBottom: 20}]}
                            secureTextEntry
                            placeholder="New Password"
                            value={values.newPassword}
                            onChangeText={handleChange('newPassword')}
                        />
                        {touched.newPassword && errors.newPassword && (
                            <Text style={styles.errorText}>{errors.newPassword}</Text>
                        )}

                        <TextInput
                            style={[styles.inputContainer, {marginBottom: 20}]}
                            secureTextEntry
                            placeholder="Confirm Password"
                            value={values.confirmPassword}
                            onChangeText={handleChange('confirmPassword')}
                        />
                        {touched.confirmPassword && errors.confirmPassword && (
                            <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                        )}

                        <TouchableOpacity onPress={handleSubmit} style={styles.button}>
                            <Text style={styles.buttonText}>Confirm Reset</Text>
                        </TouchableOpacity>
                    </>
                )}
            </Formik>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    logo: {
        height: 100,
        width: 100,
        resizeMode: 'contain',
        marginBottom: 20,
    },
    title: {
        fontSize: 32,
        marginBottom: 40,
        fontWeight: 'bold',
        color: 'black',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        height: 50,
        backgroundColor: '#f1f1f1',
        borderRadius: 8,
        paddingHorizontal: 10,
        marginBottom: 10,
    },
    icon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: '100%',
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginBottom: 20,
        color: '#000',
    },
    button: {
        width: '100%',
        height: 50,
        backgroundColor: '#1E90FF',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
    },
    signUp: {
        color: '#000',
    },
    signUpLink: {
        color: '#1E90FF',
    },
    errorText: {
        color: 'red',
        alignSelf: 'flex-start',
        marginBottom: 10,
    },
})

