import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation} from "@react-navigation/native"
import {Formik} from 'formik';
import * as yup from 'yup';
import { signUp } from "../auth/cognito";
import dragonCircle from "../assets/dragonCircle.png"
import { router } from 'expo-router'
import { useAuth } from '../context/AuthContext'

const signUpValidationSchema = yup.object().shape({
    email: yup
        .string()
        .email()
        .required('Email is required'),
    password: yup
        .string()
        .min(8, ({ min }) => `Password must be at least ${min} characters`)
        .required('Password is required'),
});

export default function SignUp() {
    const { setTempEmail } = useAuth();

    return (
        <View style={styles.container}>
            <Image source={dragonCircle} style={styles.logo} />
            <Text style={styles.title}>Sign Up</Text>

            <Formik
                validationSchema={signUpValidationSchema}
                initialValues={{ email: '', password: '' }}
                onSubmit={async (values, { setSubmitting }) => {
                    try {
                        const { success, error } = await signUp(values.email, values.password);
                        if (success) {
                            Alert.alert('Success', 'Account created! Please confirm your email.');
                            setTempEmail(values.email);
                            router.push('/confirmCode');
                        } else {
                            Alert.alert('Sign Up Failed', error);
                        }
                    } catch (err) {
                        Alert.alert('Unexpected Error', err.message || 'Something went wrong');
                    } finally {
                        setSubmitting(false);
                    }
                }}
            >
                {({
                      handleChange,
                      handleBlur,
                      handleSubmit,
                      values,
                      errors,
                      touched,
                      isValid,
                  }) => (
                        <>
                            <View style={styles.inputContainer}>
                                <Ionicons name="mail-outline" size={25} style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Email"
                                    value={values.email}
                                    onChangeText={handleChange('email')}
                                    onBlur={handleBlur('email')}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                            </View>
                            {touched.email && errors.email && (
                                <Text style={styles.errorText}>{errors.email}</Text>
                            )}

                            <View style={styles.inputContainer}>
                                <Ionicons name="lock-closed-outline" size={25} style={styles.icon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Password"
                                    secureTextEntry
                                    value={values.password}
                                    onChangeText={handleChange('password')}
                                    onBlur={handleBlur('password')}
                                />
                            </View>
                            {touched.password && errors.password && (
                                <Text style={styles.errorText}>{errors.password}</Text>
                            )}

                            <TouchableOpacity style={styles.button} onPress={handleSubmit}>
                                <Text  style={styles.buttonText}>Sign Up</Text>
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
        height: 200,
        width: 200,
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
});