import { Slot } from 'expo-router';
import { AuthProvider } from "../context/AuthContext";
import {Amplify} from "aws-amplify";
import awsconfig from '../src/aws-exports';

Amplify.configure(awsconfig);

export default function Layout() {
    return (
        <AuthProvider>
            <Slot />
        </AuthProvider>
    );
}