import { StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import {useTheme} from "../contexts/ThemeContext";
const Contact = () => {
    const { isDarkMode, toggleTheme } = useTheme();
    const backgroundColor = isDarkMode ? '#2A203B' : '#FDFBEE';
    const textColor = isDarkMode ? '#FDFBEE' : '#2A203B';

    return (
        <View style = {[styles.container, { backgroundColor }]}>
            <Text style={[styles.title, { color: textColor }]}>Contact Page</Text>
        </View>


    )
}

export default Contact;

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FDFBEE',
        // #2A203B dark purple (dark mode)
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontWeight: 'bold',
        fontSize: 18,
    },

});