import { signIn as authSignIn, signOut as authSignOut, signUp as authSignUp,
    confirmSignUp as auth_confirmSignUp, resendSignUpCode as auth_resendSignUpCode,
getCurrentUser as auth_getCurrentUser, resetPassword as auth_resetPassword,
confirmResetPassword as auth_confirmResetPassword} from '@aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import awsconfig from '../src/aws-config-modular';

Amplify.configure(awsconfig)

export const signIn = async (email, password) => {
    try {

        const user = await authSignIn({
            username: email.trim(),
            password,
        });

        return { success: true, user };
    } catch (error) {
    return { success: false, error: error.message || 'An unknown error occurred.' };
}
};

export async function signOut() {
    try {
        await authSignOut();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || 'Sign out failed' };
    }
}


export async function signUp(email, password) {
    try {
        const { userId } = await authSignUp({
            username: email,
            password,
            options: {
                userAttributes: {
                    email, // Required attribute
                },
                // Optional - auto sign in after sign up
                autoSignIn: true
            }
        });
        return { success: true, result: { userId } };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function confirmSignUp(email, code) {
    try {
        await auth_confirmSignUp({ username: email, confirmationCode: code });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || 'Confirmation failed' };
    }
}

export async function resendSignUpCode(email) {
    try {
        await auth_resendSignUpCode({username: email});
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message || 'Resend failed' };
    }
}

export async function getCurrentUser() {
    try {
        const user = await auth_getCurrentUser();
        return user;
    } catch {
        return null;
    }
}

export async function resetPassword(email) {
    try{
        await auth_resetPassword({ username: email});
        return { success: true };
    } catch (error)
    {
        return { success: false, error: error.message || 'Reset Password failed' };
    }
}

export async function confirmResetPassword(email, code, newPassword) {
    try{
        await auth_confirmResetPassword({
            username: email,
            confirmationCode: code,
            newPassword,
        });
        return { success: true };
    }catch(error) {
        return { success: false, error: error.message || 'Password confirmation failed' };

    }
}