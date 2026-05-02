export declare const loadAmplifyPushNotification: () => {
    addMessageEventListener: (event: string, listener: (message: import("@aws-amplify/rtn-push-notification").PushNotificationMessage | null, completionHandlerId?: string) => void) => import("react-native").EmitterSubscription;
    addTokenEventListener: (event: string, listener: (token: string) => void) => import("react-native").EmitterSubscription;
    completeNotification: (completionHandlerId: string) => void;
    getBadgeCount: () => void | Promise<number | null>;
    getConstants: () => {
        NativeEvent: {
            BACKGROUND_MESSAGE_RECEIVED?: string;
            FOREGROUND_MESSAGE_RECEIVED: string;
            LAUNCH_NOTIFICATION_OPENED: string;
            NOTIFICATION_OPENED: string;
            TOKEN_RECEIVED: string;
        };
        NativeHeadlessTaskKey?: string;
    };
    getLaunchNotification: () => Promise<import("@aws-amplify/rtn-push-notification").PushNotificationMessage | null>;
    getPermissionStatus: () => Promise<import("@aws-amplify/rtn-push-notification").PushNotificationPermissionStatus>;
    registerHeadlessTask: (task: (message: import("@aws-amplify/rtn-push-notification").PushNotificationMessage | null) => Promise<void>) => void;
    requestPermissions: ({ alert, badge, sound }?: import("@aws-amplify/rtn-push-notification").PushNotificationPermissions) => Promise<boolean>;
    setBadgeCount: (count: number) => void;
};
