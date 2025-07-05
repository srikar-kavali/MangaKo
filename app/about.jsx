import { StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import {useTheme} from "../contexts/ThemeContext";
const About = () => {
    const { isDarkMode, toggleTheme } = useTheme();
    const backgroundColor = isDarkMode ? '#2A203B' : '#FDFBEE';
    const textColor = isDarkMode ? '#FDFBEE' : '#2A203B';

    return (
        <View style = {[styles.container, { backgroundColor }]}>
            <Text style={[styles.title, {color: textColor}]}>About Page</Text>
        </View>


    )
}

export default About;

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