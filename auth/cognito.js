import { signIn as authSignIn, signOut as authSignOut, signUp as authSignUp,
    confirmSignUp as auth_confirmSignUp, resendSignUpCode as auth_resendSignUpCode,
getCurrentUser as auth_getCurrentUser, resetPassword as auth_resetPassword,
confirmResetPassword as auth_confirmResetPassword} from '@aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import awsconfig from '../src/aws-config-modular';

Amplify.configure(awsconfig)

export const signIn = async (email, password) => {
    try {
        console.log('📩 Attempting sign-in with:', { username: email, passwordLength: password.length });

        const user = await authSignIn({
            username: email.trim(),
            password,
        });

        console.log('✅ Login success:', user);
        return { success: true, user };
    } catch (error) {
    console.log('❌ Login error details:', error);
    console.log('Error name:', error.name);
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
    return { success: false, error: error.message || 'An unknown error occurred.' };
}
};

export async function signOut() {
    try {
        await authSignOut();
        return { success: true };
    } catch (error) {
        console.error('Sign out error:', error);
        return { success: false, error: error.message || 'Sign out failed' };
    }
}


export async function signUp(email, password) {
    try {
        const { isSignUpComplete, userId, nextStep } = await authSignUp({
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
        console.log("SignUp result:", { isSignUpComplete, userId, nextStep });
        return { success: true, result: { userId } };
    } catch (error) {
        console.error('SignUp error', error);
        return { success: false, error: error.message };
    }
}

export async function confirmSignUp(email, code) {
    try {
        await auth_confirmSignUp({ username: email, confirmationCode: code });
        return { success: true };
    } catch (error) {
        console.error('Confirm sign-up error', error);
        return { success: false, error: error.message || 'Confirmation failed' };
    }
}

export async function resendSignUpCode(email) {
    try {
        const result = await auth_resendSignUpCode({username: email});
        console.log("Resend result:", result);
        return { success: true };
    } catch (error) {
        console.error('Resend error', error);
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
        const result = await auth_resetPassword({ username: email});
        console.log("Reset password initialized:", result);
        return { success: true };
    } catch (error)
    {
        console.error('Reset Password error', error);
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
        console.error('Confirm Reset password error', error);
        return { success: false, error: error.message || 'Password confirmation failed' };

    }
}