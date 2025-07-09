import { signIn as authSignIn, signUp as authSignUp,
    confirmSignUp as auth_confirmSignUp, resendSignUpCode as auth_resendSignUpCode,
} from '@aws-amplify/auth';

export async function signIn(email, password) {
    try {
        const { isSignedIn, nextStep } = await authSignIn({
            username: email,
            password
        });
        console.log("SignIn result:", { isSignedIn, nextStep });
        return { success: true, user: { username: email } };
    } catch (error) {
        console.error('Login error', error);
        return { success: false, error: error.message || 'Login failed' };
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
