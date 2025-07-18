import React, { useState } from 'react';
import {Text, View, StyleSheet, TouchableOpacity, TextInput, Alert, Image} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {resetPassword} from "../auth/cognito";
import { router } from 'expo-router';
import {Formik} from 'formik';
import * as yup from 'yup';
import dragonCircle from "../assets/dragonCircle.png";
import {Ionicons} from "@expo/vector-icons";

const forgetValidationSchema = yup.object().shape({
    email: yup
        .string()
        .email()
        .required("Email is required"),
})

export default function Forget() {
    return (
        <View style={styles.container}>
            <Image source={dragonCircle} style={styles.logo} />
            <Text style={styles.title}>Reset Password</Text>
            <Formik
                validationSchema={forgetValidationSchema}
                initialValues={{email: ''}}
                onSubmit={async (values, { setSubmitting }) => {
                    try {
                        const { success, error } = await resetPassword(values.email);
                        if (success) {
                            Alert.alert('Success, Reset Code sent to email.');
                            router.push({ pathname: '/reset', params: { email: values.email } });
                        }
                        else {
                            Alert.alert('Reset code failed', error);
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
                        <TouchableOpacity
                            style={styles.button}
                            onPress={handleSubmit}
                            disabled={!isValid}
                        >
                            <Text style={styles.buttonText}>Send Code</Text>
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