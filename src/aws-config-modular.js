const awsconfig = {
    Auth: {
        Cognito: {
            region: "us-east-1",
            userPoolId: "us-east-1_lcEuXN4mz",
            userPoolClientId: "5fa3q84jk2o1ba4079klpgevtc",
            identityPoolId: "us-east-1:d653209a-9ae0-4019-90bb-665fde3a5a56",
            loginMechanisms: ["EMAIL"],
            usernameAttributes: ["EMAIL"],
            signUpVerificationMethod: "code"
        }
    }
};

export default awsconfig;