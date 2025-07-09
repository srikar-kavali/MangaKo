import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [tempEmail, setTempEmail] = useState(null); // stores email temporarily for confirmation

    return (
        <AuthContext.Provider value={{ tempEmail, setTempEmail }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
