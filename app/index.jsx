import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, InteractionManager } from 'react-native';

export default function Index() {
    const router = useRouter();

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            router.replace('/login');
        });

        return () => task.cancel();
    }, []);

    return <View />;
}
